"Repeated bounded repository-edit trials. CLEF versus a declared fixed-first mechanism, not another LLM."
(import argparse pathlib tempfile subprocess hashlib json time statistics os shutil)
(setv parser (argparse.ArgumentParser))
(for [arg ["compiler-root" "model-dir" "adapter-root" "kernel-manifest" "output-dir"]]
  (.add-argument parser (+ "--" arg) :required True))
(.add-argument parser "--repeats" :type int :default 3)
(setv args (.parse-args parser) repo (get (getattr (.resolve (pathlib.Path __file__)) "parents") 1)
      out (.resolve (pathlib.Path args.output-dir)) hy (str (/ (getattr (pathlib.Path os.sys.executable) "parent") "hy"))
      kbb (shutil.which "kbb") verifier (/ repo "scripts/verify-workspace.hy") rows [])
(when (or (< args.repeats 1) (> args.repeats 10)) (raise (ValueError "repeats 1..10")))
(.mkdir out :parents True :exist-ok False)
(setv cases [["positive" "(if (>= n 0) 1 0)" "(if (> n 0) 1 0)" ["(if (< n 0) 1 0)" "(if (= n 0) 1 0)"] [0 0 1 1]
              "Return 1 exactly when n is strictly positive; zero and negative inputs return 0."]
             ["nonnegative" "(if (> n 0) 1 0)" "(if (>= n 0) 1 0)" ["(if (<= n 0) 1 0)" "(if (= n 0) 1 0)"] [0 1 1 1]
              "Return 1 exactly when n is nonnegative; zero is accepted and negative inputs return 0."]
             ["negative" "(if (<= n 0) 1 0)" "(if (< n 0) 1 0)" ["(if (> n 0) 1 0)" "(if (= n 0) 1 0)"] [1 0 0 0]
              "Return 1 exactly when n is strictly negative; zero and positive inputs return 0."]])
(for [repeat (range args.repeats)]
  (for [[case-id old good others expected goal] cases]
    (setv candidates (+ [good] others) rotation (% repeat 3)
          candidates (+ (cut candidates rotation None) (cut candidates 0 rotation))
          source (+ "(ns coding.program (:export [f test-minus test-zero test-one test-many main]))\n"
                    "(defn f [n :i64] :i64 " old ")\n"
                    (.join "\n" (lfor [name n value] (zip ["minus" "zero" "one" "many"] [-1 0 1 7] expected)
                      (+ "(defn test-" name " [] :i64 (if (= (f " (str n) ") " (str value) ") 1 0))")))
                    "\n(defn main [] :i64 (f 0))\n"))
    (for [mode ["replay" "clef"]]
      (setv trial (/ out (+ case-id "-" (str repeat) "-" mode)) root (/ trial "repo")
            session (/ trial "session") receipt (/ trial "receipt.json")
            task-file (/ trial "task.json"))
      (.mkdir root :parents True)
      (.write-text (/ root "program.kotoba") source)
      (shutil.copyfile verifier (/ root "verify.hy"))
      ;; Isolated Git checkout: the agent edits a tracked repository file, never the user's source checkout.
      (subprocess.run ["git" "init" "-q" (str root)] :check True)
      (subprocess.run ["git" "-C" (str root) "add" "program.kotoba" "verify.hy"] :check True)
      (subprocess.run ["git" "-C" (str root) "-c" "user.name=Mithril benchmark" "-c" "user.email=benchmark@localhost"
                       "commit" "-qm" "Declared benchmark task"] :check True)
      (setv task {"root" (str root) "file" "program.kotoba" "goal" goal
                 "before-sha256" (.hexdigest (hashlib.sha256 (.encode source))) "old" old "candidates" candidates
                 "inputs" {"verify.hy" (.hexdigest (hashlib.sha256 (.read-bytes (/ root "verify.hy"))))}
                 "verifier" {"executable" hy "argv" ["verify.hy" args.compiler-root "program.kotoba"] "timeout-ms" 90000}})
      (.write-text task-file (json.dumps task :indent 2))
      (setv started (time.perf-counter)
            result (subprocess.run [kbb "--backend" "sci" "--config" "ports.edn" "--classpath" "src"
                                    "bin/mithril-workspace-agent.cljk" mode (str task-file) args.kernel-manifest
                                    (str session) hy args.model-dir args.adapter-root (str receipt)]
                     :cwd (str repo) :capture-output True :text True :timeout 300)
            elapsed (- (time.perf-counter) started)
            value (if (.exists receipt) (json.loads (.read-text receipt)) {})
            final (.read-text (/ root "program.kotoba")) changed (!= source final)
            exact (= final (.replace source old good))
            row {"task" case-id "repeat" repeat "mode" mode "good_index" (.index candidates good)
                 "exit" result.returncode "status" (.get value "status" "startup-error")
                 "end_to_end_seconds" elapsed "changed" changed "exact_expected_patch" exact
                 "success" (and (= (.get value "status") "done") exact)
                 "model_turns" (len (lfor x (.get value "model-turns" []) :if (.get x "response") x))
                 "host_singleton_decisions" (len (lfor x (.get value "model-turns" []) :if (= (.get x "mechanism") "host-singleton") x))
                 "model_wall_seconds" (/ (sum (lfor x (.get value "model-turns" []) (.get x "wall-ms" 0))) 1000)
                 "model_load_seconds" (sum (lfor x (.get value "model-turns" []) (.get (.get x "response" {}) "load_seconds" 0)))
                 "model_inference_seconds" (sum (lfor x (.get value "model-turns" []) (.get (.get x "response" {}) "inference_seconds" 0)))
                 "input_tokens" (sum (lfor x (.get value "model-turns" []) (.get (.get x "response" {}) "input_tokens" 0)))
                 "api_cost_jpy" 0 "stdout" result.stdout "stderr" result.stderr "receipt" (str receipt)})
      (.append rows row)
      (.write-text (/ out "runs.json") (json.dumps rows :indent 2))
      (print case-id repeat mode (.get row "status") (round elapsed 3) :flush True))))
(setv summaries {})
(for [mode ["replay" "clef"]]
  (setv rs (lfor r rows :if (= (get r "mode") mode) r)
        times (lfor r rs (get r "end_to_end_seconds")))
  (setv (get summaries mode) {"runs" (len rs) "successes" (sum (lfor r rs (int (get r "success"))))
      "success_rate" (/ (sum (lfor r rs (int (get r "success")))) (len rs))
      "median_seconds" (statistics.median times) "min_seconds" (min times) "max_seconds" (max times)
      "model_load_median_seconds" (statistics.median (lfor r rs (get r "model_load_seconds")))
      "model_inference_median_seconds" (statistics.median (lfor r rs (get r "model_inference_seconds")))
      "api_cost_jpy" 0}))
(.write-text (/ out "summary.json") (json.dumps {"format" "mithril.workspace-evaluation/v1" "summaries" summaries
    "scope" "3 supplied finite-candidate Kotoba boundary tasks; fixed-first is not another model; no general coding accuracy claim"
    "cost_boundary" "API zero/offline; electricity, device amortization and human authoring not measured"} :indent 2))
(print (json.dumps summaries :indent 2))
