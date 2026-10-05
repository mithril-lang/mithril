"Paired local free-generation measurement. No supplied solutions; fixed verification and isolated trials."
(import argparse pathlib tempfile subprocess hashlib json time statistics os shutil platform)
(setv parser (argparse.ArgumentParser))
(for [arg ["fixture-task" "kernel-manifest" "clef-model" "coder-model" "adapter-root" "output-dir"]]
  (.add-argument parser (+ "--" arg) :required True))
(.add-argument parser "--repeats" :type int :default 3)
(setv args (.parse-args parser) repo (get (getattr (.resolve (pathlib.Path __file__)) "parents") 1)
      out (.resolve (pathlib.Path args.output-dir)) hy (str (/ (getattr (pathlib.Path os.sys.executable) "parent") "hy"))
      kbb (shutil.which "kbb") fixture (json.loads (.read-text (pathlib.Path args.fixture-task))) rows [])
(when (not (<= 1 args.repeats 10)) (raise (ValueError "repeats 1..10")))
(.mkdir out :parents True :exist-ok False)
(setv workspace (pathlib.Path (tempfile.mkdtemp :prefix "mithril-generation-benchmark-")))
(.write-text (/ out "protocol.json") (json.dumps
  {"format" "mithril.generation-evaluation/v1" "repeats" args.repeats "unique_tasks" 1 "attempt_budget" 1
   "models" {"clef" args.clef-model "mlx-coder" args.coder-model}
   "scope" "One known two-file CLJK clamp repair, repeated; not held-out coding accuracy. No CLEF controller used in coder runs."
   "fixture" fixture "runtime" {"machine" (platform.machine) "platform" (platform.platform) "hy" hy "kbb" kbb}
   "source_sha256" (dfor name ["bin/mithril-agent.cljk" "scripts/port-generate-files.hy" "src/mithril/generator.cljk"
                              "src/mithril/patch.cljk" "src/mithril/parallel.cljk" "src/mithril/schedule.cljk"
                              "src/mithril/generated_runner.cljk" "src/mithril/evaluation.cljk" "ports/generated-agent.mith"]
                        name (.hexdigest (hashlib.sha256 (.read-bytes (/ repo name)))))
   "cost_boundary" "Local API JPY 0; electricity, device amortization, implementation and training cost unmeasured."
   "timing_boundary" "Outer process wall time including startup, loading, generation, validation, verification and publication; excludes initial model download."
   "generation_model_revision" (json.loads (.read-text (/ (pathlib.Path args.coder-model) "generation-manifest.json")))} :indent 2))
(for [repeat (range args.repeats)]
  ;; Alternate order; sequential episodes avoid concurrent Metal contention.
  (for [kind (if (= (% repeat 2) 0) ["clef" "mlx-coder"] ["mlx-coder" "clef"])]
    (setv label (+ kind "-" (str repeat)) trial (/ workspace label) root (/ trial "repo")
          receipt (/ out (+ label ".json")) task (dict fixture))
    (.mkdir (/ root "src/demo") :parents True)
    (.write-text (/ root "src/demo/math.cljk") "(ns demo.math)\n(defn clamp [x low high] x)\n")
    (.write-text (/ root "src/demo/api.cljk") "(ns demo.api (:require [demo.math :as math]))\n(defn clamp-positive [x] x)\n")
    (for [[name expected] (.items (get fixture "inputs"))]
      (setv source (/ (pathlib.Path (get fixture "root")) name))
      (when (!= expected (.hexdigest (hashlib.sha256 (.read-bytes source)))) (raise (ValueError "Verifier drift")))
      (.mkdir (getattr (/ root name) "parent") :parents True :exist-ok True)
      (shutil.copyfile source (/ root name)))
    (setv (get task "root") (str root) (get task "max-attempts") 1)
    (.write-text (/ trial "task.json") (json.dumps task :indent 2))
    (setv env (dict os.environ) (get env "MITHRIL_GENERATOR_KIND") kind
          model (if (= kind "clef") args.clef-model args.coder-model) started (time.perf-counter))
    (setv process (subprocess.run [kbb "--backend" "sci" "--config" "ports.edn" "--classpath" "src"
                                  "bin/mithril-agent.cljk" "generate" (str (/ trial "task.json")) args.kernel-manifest
                                  (str (/ trial "session")) hy model args.adapter-root (str receipt)]
                     :cwd (str repo) :env env :capture-output True :text True :timeout 300)
          elapsed (- (time.perf-counter) started)
          value (if (.exists receipt) (json.loads (.read-text receipt)) {})
          audits (.get value "model-turns" []) turns (lfor t audits :if (.get t "response") t) attempts (.get value "attempts" [])
          checks (lfor attempt attempts result (.get (.get attempt "verification" {}) "results" [])
                   (.get result "value" {}))
          retained (dfor name (get task "context") name (.read-text (/ root name)))
          success (and (= (.get value "status") "done") (= (len checks) (len (get task "verifiers")))
                       (all (lfor check checks (and (.get check "passed") (.get check "source-unchanged?") (.get check "quiescent?")))))
          row {"id" label "model" kind "repeat" repeat "success" success "status" (.get value "status" "startup-error")
               "process_exit" process.returncode "end_to_end_seconds" elapsed "attempts" (len attempts)
               "completed_generation_calls" (len turns) "failed_provider_calls" (- (len audits) (len turns))
               "verification_checks_passed" (sum (lfor c checks (int (.get c "passed" False))))
               "generation_metrics_complete" (= (len turns) (len attempts))
               "input_tokens" (if (= (len turns) (len attempts)) (sum (lfor t turns (get (get t "response") "input_tokens"))) None)
               "output_tokens" (if (= (len turns) (len attempts)) (sum (lfor t turns (get (get t "response") "output_tokens"))) None)
               "generation_seconds" (if turns (sum (lfor t turns (get (get t "response") "generation_seconds"))) None)
               "load_seconds" (if turns (sum (lfor t turns (get (get t "response") "load_seconds"))) None)
               "peak_memory_gb" (if turns (max (lfor t turns (get (get t "response") "peak_memory_gb"))) None)
               "api_cost_jpy" 0 "receipt" (+ label ".json") "stdout" process.stdout "stderr" process.stderr})
    (.write-text (/ out (+ label "-retained.json")) (json.dumps retained :indent 2))
    (.append rows row)
    (.write-text (/ out "runs.json") (json.dumps rows :indent 2))
    (print label (.get row "status") (round elapsed 3) :flush True)))
(setv summaries {})
(for [kind ["clef" "mlx-coder"]]
  (setv runs (lfor r rows :if (= (get r "model") kind) r) successes (lfor r runs :if (get r "success") r)
        times (lfor r runs (get r "end_to_end_seconds")) good-times (lfor r successes (get r "end_to_end_seconds")))
  (setv (get summaries kind) {"runs" (len runs) "successes" (len successes) "success_rate" (/ (len successes) (len runs))
                             "all_run_median_seconds" (statistics.median times) "range_seconds" [(min times) (max times)]
                             "successful_median_seconds" (if good-times (statistics.median good-times) None)
                             "api_cost_jpy" 0 "total_end_to_end_seconds" (sum times)}))
(.write-text (/ out "summary.json") (json.dumps {"summaries" summaries "scope" "One known task repeated, one attempt each; exploratory comparison only."} :indent 2))
(print (json.dumps summaries :indent 2))
