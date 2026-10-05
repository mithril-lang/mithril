"Offline file planning and complete source generation; schema constraints never prescribe code bodies."
(import sys json pathlib argparse time hashlib os)
(setv parser (argparse.ArgumentParser))
(.add-argument parser "--model-dir" :required True)
(.add-argument parser "--clef-adapter-root" :required True)
(.add-argument parser "--model-kind" :choices ["clef" "mlx-coder"] :default "clef")
(setv args (.parse-args parser))
(sys.path.insert 0 (str (.resolve (pathlib.Path args.clef-adapter-root))))
(import local_support :as support)
(import mlx_lm [stream_generate])
(import mlx_lm.sample_utils [make_sampler])
(import outlines)
(import outlines.types [JsonSchema])
(setv request (json.load sys.stdin))
(if (= args.model-kind "clef")
  (do (setv loaded (support.load-model args.model-dir)
            model (get (get loaded "loaded") 0) tokenizer (get (get loaded "loaded") 1)))
  (do
    (setv directory (.resolve (pathlib.Path args.model-dir))
          manifest (json.loads (.read-text (/ directory "generation-manifest.json"))))
    (when (!= (get manifest "format") "mithril.local-generator/v1") (raise (ValueError "Generator manifest format")))
    (for [[name sha] (.items (get manifest "files"))]
      (when (or (.is-absolute (pathlib.Path name)) (in ".." (getattr (pathlib.Path name) "parts")))
        (raise (ValueError "Generator manifest path")))
      (with [f (.open (/ directory name) "rb")]
        (when (!= sha (.hexdigest (hashlib.file-digest f "sha256"))) (raise (ValueError "Generator artifact drift")))))
    (setv (get os.environ "HF_HUB_OFFLINE") "1" (get os.environ "HF_HUB_DISABLE_IMPLICIT_TOKEN") "1")
    (import mlx.core :as mx)
    (mx.set-memory-limit (* 10 1024 1024 1024))
    (mx.set-cache-limit (* 512 1024 1024))
    (import mlx_lm [load])
    (setv started (time.perf-counter) [model tokenizer] (load (str directory)))
    (mx.eval (.parameters model))
    (setv loaded {"load_seconds" (- (time.perf-counter) started)})))
(setv wrapped (outlines.from-mlxlm model tokenizer) phases [])
(defn emit [system payload schema]
  (setv prompt (.apply-chat-template tokenizer [{"role" "system" "content" system}
                 {"role" "user" "content" (json.dumps payload :ensure-ascii False)}]
                :tokenize False :add-generation-prompt True :enable-thinking False)
        input-tokens (len (.encode tokenizer prompt)))
  (when (> input-tokens 8192) (raise (ValueError "Generation context budget; no truncation")))
  (setv constrained (outlines.Generator wrapped (JsonSchema schema)) started (time.perf-counter) chunks [] last None)
  (for [part (stream_generate model tokenizer prompt :max-tokens 1536 :sampler (make_sampler :temp 0)
               :logits-processors [constrained.logits_processor])]
    (.append chunks part.text) (setv last part)
    (try
      (setv value (json.loads (.join "" chunks)))
      (break)
      (except [e ValueError] None)))
  (setv text (.join "" chunks) value (json.loads text))
  (.append phases {"prompt" (json.loads (json.dumps payload)) "output" value "input_tokens" input-tokens "output_tokens" last.generation_tokens
                   "generation_seconds" (- (time.perf-counter) started) "peak_memory_gb" last.peak_memory})
  value)
(setv plan (emit "Plan which files must change to implement the task. Return repository-relative paths exactly, including src/ prefixes. Do not include locked-inputs. You may create new files. Every path must be unique. Return only JSON."
                  request {"type" "object" "required" ["paths"] "additionalProperties" False
                           "properties" {"paths" {"type" "array" "minItems" 1 "maxItems" (get request "max-files")
                                                      "items" {"type" "string"}}}})
      edits [])
(for [destination (get plan "paths")]
  (setv payload {"task" (get request "goal") "destination" destination "repository-files" (get request "files")
                 "already-generated" edits "diagnostics" (.get request "diagnostics")}
        value (emit "Implement the task in the ONE destination file. Return JSON with content containing the entire source text of that file; null means delete it. The content must contain source code only, no prose, export statements or markdown. Preserve the namespace and signatures if present. CLJK is ClojureScript: function calls use prefix notation, namespaces and defn forms must be balanced. A form like (defn name [x] (op x)) has both closing parentheses. Do not include another file's content. You choose the code freely."
                     payload {"type" "object" "required" ["content"] "additionalProperties" False
                              "properties" {"content" {"type" ["string" "null"]}}}))
  (.append edits {"path" destination "content" (get value "content")}))
(print (json.dumps {"mechanism" (+ args.model-kind "-autoregressive-file-plan") "text" (json.dumps {"edits" edits} :ensure-ascii False)
    "phases" phases "load_seconds" (get loaded "load_seconds")
    "generation_seconds" (sum (lfor p phases (get p "generation_seconds")))
    "input_tokens" (sum (lfor p phases (get p "input_tokens"))) "output_tokens" (sum (lfor p phases (get p "output_tokens")))
    "peak_memory_gb" (max (lfor p phases (get p "peak_memory_gb"))) "finish_reason" "json-complete"} :ensure-ascii False))
