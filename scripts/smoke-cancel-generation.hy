"Cancel an actual local generation process and verify retained files stay unchanged."
(import argparse pathlib json tempfile shutil subprocess os signal time)
(setv parser (argparse.ArgumentParser))
(for [arg ["fixture" "kernel-manifest" "model-dir" "adapter-root" "output"]]
  (.add-argument parser (+ "--" arg) :required True))
(setv args (.parse-args parser) fixture (pathlib.Path args.fixture)
      repo (get (getattr (.resolve (pathlib.Path __file__)) "parents") 1)
      task (json.loads (.read-text (/ fixture "task.json")))
      originals (json.loads (.read-text (/ fixture "original-sources.json")))
      root (pathlib.Path (tempfile.mkdtemp :prefix "mithril-cancel-generation-"))
      workspace (/ root "repo") hy (str (/ (getattr (pathlib.Path os.sys.executable) "parent") "hy")))
(.mkdir workspace)
(for [[name source] (.items originals)]
  (.mkdir (getattr (/ workspace name) "parent") :parents True :exist-ok True)
  (.write-text (/ workspace name) source))
(for [name (get task "inputs")] (shutil.copyfile (/ fixture name) (/ workspace name)))
(setv (get task "root") (str workspace) (get task "max-attempts") 1)
(.write-text (/ root "task.json") (json.dumps task :indent 2))
(setv env (dict os.environ) (get env "MITHRIL_GENERATOR_KIND") "mlx-coder"
      started (time.perf-counter) child-id None
      process (subprocess.Popen [(shutil.which "kbb") "--backend" "sci" "--config" "ports.edn" "--classpath" "src"
        "bin/mithril-agent.cljk" "generate" (str (/ root "task.json")) args.kernel-manifest
        (str (/ root "session")) hy args.model-dir args.adapter-root args.output]
        :cwd (str repo) :env env :stdout subprocess.PIPE :stderr subprocess.PIPE :text True))
(try
  (while (and (is (.poll process) None) (< (- (time.perf-counter) started) 30))
    (setv lines (.splitlines (subprocess.check-output ["ps" "-axo" "pid=,ppid=,command="] :text True)))
    (for [line lines]
      (setv cols (.split (.strip line) None 2))
      (when (and (= (len cols) 3) (in "port-generate-files.hy" (get cols 2))
                 (in "--model-kind mlx-coder" (get cols 2)) (= (int (get cols 1)) process.pid))
        (setv child-id (int (get cols 0)))))
    (when child-id (break))
    (time.sleep 0.02))
  (when (is child-id None) (raise (ValueError "No actual generation helper observed")))
  (.send-signal process signal.SIGINT)
  (setv [stdout stderr] (.communicate process :timeout 15)
        receipt (json.loads (.read-text (pathlib.Path args.output)))
        metrics (json.loads (.read-text (pathlib.Path (+ args.output ".metrics.json"))))
        turns (get receipt "model-turns")
        retained (dfor name (get task "context") name (.read-text (/ workspace name))))
  (when (not (and (not (= (get receipt "status") "done")) (= originals retained)
                 (= (len turns) 1) (get (get turns 0) "cancelled?") (get (get turns 0) "quiescent?")
                 (not (get metrics "success")) (is (get (get metrics "input-tokens") "total") None)
                 (not (.exists (/ root "session/owner.lock")))))
    (raise (ValueError "Cancellation did not preserve source, settle process and release session")))
  (.write-text (pathlib.Path (+ args.output ".validation.json"))
    (json.dumps {"scope" "Intentional cancellation, excluded from model completion benchmarks."
      "helper_observed" True "helper_quiescent" True "source_unchanged" True "session_released" True
      "end_to_end_seconds" (- (time.perf-counter) started) "api_cost_jpy" 0} :indent 2))
  (print "Verified cancellation of actual local generation, unchanged source and released session.")
  (finally
    (when (is (.poll process) None) (.send-signal process signal.SIGINT) (.communicate process :timeout 15))))
