"CLEF-Flash head adaptation. Hy is the source; Python is generated only for
Modal's host interface. The backbone is frozen. Dev selects checkpoints; both
held-out splits are excluded from optimization and checkpoint selection."
(import os sys json time copy hashlib pathlib random modal)
(setv revision "17f0b0ad64efb65d273590632833508766b2aae6"
      app (modal.App "mithril-clef-repair-pilot")
      volume (modal.Volume.from-name "mithril-clef-repair-pilot" :create-if-missing True)
      image (.pip-install (modal.Image.debian-slim :python-version "3.12")
                "torch==2.11.0" "transformers==5.10.2" "accelerate" "safetensors" "huggingface_hub" "pillow" "hy==1.3.1"))
(setv image (.env image {"HF_HOME" "/cache/hf" "TOKENIZERS_PARALLELISM" "false"}))

(defn [(app.function :image image :gpu "H100" :timeout 1200 :volumes {"/cache" volume})]
      train-remote [records]
  (import math torch torch.nn.functional :as F
          huggingface_hub [snapshot_download]
          safetensors.torch [save_file])
  (setv t0 (time.perf-counter))
  (torch.manual-seed 20261005)
  (random.seed 20261005)
  (setv release (snapshot_download "Cloudflare/clef-flash" :revision revision))
  (sys.path.insert 0 release)
  (import joint_schema_model :as clef)
  (setv [model processor] (clef.load-release-model release :device "cuda" :attn-implementation "sdpa"))
  (for [p (.parameters model.language-model)] (.requires-grad_ p False))
  (.float model.head)
  (setv head-params (sum (lfor p (.parameters model.head) (.numel p))))
  (setv base model.language-model text-model base.model)
  (when (hasattr text-model "language_model") (setv text-model text-model.language-model))
  (setv output-weight (getattr (.get-output-embeddings base) "weight")
        cache [] load-seconds (- (time.perf-counter) t0))
  (for [[i row] (enumerate records)]
    (setv req (get row "request")
          encoded (clef.encode-record processor.tokenizer req :processor processor :max-length 2048)
          batch (clef.collate-records [encoded] processor.tokenizer.pad-token-id (torch.device "cuda"))
          start (time.perf-counter))
    (with [(torch.no-grad)]
      (setv hidden (getattr (text-model :input-ids (get batch "input_ids")
                         :attention-mask (get batch "attention_mask") :use-cache False :return-dict True) "last_hidden_state")))
    (torch.cuda.synchronize)
    (.append cache {"row" row "encoded" encoded
                   "input_ids" (.cpu (get batch "input_ids"))
                   "attention_mask" (.cpu (get batch "attention_mask"))
                   "hidden" (.cpu hidden) "backbone_seconds" (- (time.perf-counter) start)})
    (when (= (% i 8) 0) (print "encoded" i (len records) :flush True)))
  (defn logits-for [item]
    (with [(torch.autocast "cuda" :dtype torch.bfloat16)]
      (get (get (model.head (.to (get item "hidden") "cuda")
               (.to (get item "input_ids") "cuda") (.to (get item "attention_mask") "cuda")
               [(get item "encoded")] output-weight) 0) 0)))
  (defn evaluate [items]
    (.eval model.head)
    (setv result [])
    (with [(torch.no-grad)]
      (for [item items]
        (setv start (time.perf-counter)
              logits (logits-for item)
              probabilities (.tolist (.cpu (.softmax (.float logits) -1))))
        (torch.cuda.synchronize)
        (setv row (get item "row")
              ids (.option-ids (get (.questions (get item "encoded")) 0))
              dist (dict (zip ids probabilities))
              choice (max dist :key dist.__getitem__))
        (.append result {"id" (get row "id") "split" (get row "split")
                         "gold" (get row "gold") "task_digest" (get row "task_digest")
                         "choice" choice "probabilities" dist "confidence" (get dist choice)
                         "input_tokens" (len (getattr (get item "encoded") "input_ids"))
                         "head_seconds" (- (time.perf-counter) start)
                         "backbone_seconds" (get item "backbone_seconds")})))
    result)
  (setv train-items (lfor item cache :if (= (get (get item "row") "split") "train") item)
        dev-items (lfor item cache :if (= (get (get item "row") "split") "dev") item)
        baseline (evaluate cache)
        baseline-state (copy.deepcopy (.state-dict model.head))
        best-state (copy.deepcopy baseline-state)
        best-loss (float "inf") best-epoch 0 curve []
        optimizer (torch.optim.AdamW (.parameters model.head) :lr 0.0001 :weight-decay 0.01))
  ;; Admit the untouched baseline as checkpoint zero. Dev alone decides whether
  ;; a changed head is retained, even if train loss decreases.
  (defn dev-loss []
    (setv rows (evaluate dev-items))
    (/ (sum (lfor r rows (- (math.log (max 1e-8 (get (get r "probabilities") (get r "gold"))))))) (len rows)))
  (setv best-loss (dev-loss))
  (for [epoch (range 1 13)]
    (.train model.head)
    (random.shuffle train-items)
    (setv losses [])
    (for [item train-items]
      (.zero-grad optimizer :set-to-none True)
      (setv logits (logits-for item)
            ids (.option-ids (get (.questions (get item "encoded")) 0))
            gold-index (.index ids (get (get item "row") "gold"))
            target (torch.tensor [gold-index] :device "cuda" :dtype torch.long)
            loss (F.cross-entropy (.unsqueeze (.float logits) 0) target))
      (.backward loss)
      (torch.nn.utils.clip-grad-norm_ (.parameters model.head) 1.0)
      (.step optimizer)
      (.append losses (.item loss)))
    (setv val-loss (dev-loss)
          row {"epoch" epoch "train_nll" (/ (sum losses) (len losses)) "dev_nll" val-loss})
    (.append curve row)
    (print row :flush True)
    (when (< val-loss best-loss)
      (setv best-loss val-loss best-epoch epoch best-state (copy.deepcopy (.state-dict model.head)))))
  (.load-state-dict model.head best-state)
  (setv adapted (evaluate cache)
        run-dir (+ "/cache/runs/" (time.strftime "%Y%m%d-%H%M%S")))
  (os.makedirs run-dir :exist-ok True)
  (setv state-path (+ run-dir "/joint_head.safetensors"))
  (save_file (dfor [k v] (.items best-state) k (.contiguous (.cpu v))) state-path)
  (setv digest (.hexdigest (hashlib.sha256 (.read-bytes (pathlib.Path state-path))))
        report {"format" "mithril.clef-head-training/v1" "revision" revision
                "seed" 20261005 "gpu" (torch.cuda.get-device-name 0)
                "trainable_parameters" head-params "backbone_frozen" True
                "load_seconds" load-seconds "wall_seconds" (- (time.perf-counter) t0)
                "epochs" 12 "best_epoch" best-epoch "best_dev_nll" best-loss
                "train_count" (len train-items) "dev_count" (len dev-items)
                "head_sha256" digest "head_path" state-path
                "curve" curve "baseline" baseline "adapted" adapted
                "clef_code_sha256" (.hexdigest (hashlib.sha256 (.read-bytes (pathlib.Path (+ release "/joint_schema_model.py")))))} )
  (.write-text (pathlib.Path (+ run-dir "/report.json")) (json.dumps report :indent 2))
  (.commit volume)
  report)

(when (= __name__ "__main__")
  (setv records (json.loads (.read-text (pathlib.Path (get sys.argv 1)))))
  (with [(app.run)]
    (setv result (.remote train-remote records)))
  (.write-text (pathlib.Path (get sys.argv 2)) (json.dumps result :indent 2))
  (print "saved" (get sys.argv 2) :flush True))
