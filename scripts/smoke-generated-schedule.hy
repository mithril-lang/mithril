"Verify the free-generation CLI actually uses the dependency scheduler, with no supplied solutions."
(import argparse pathlib json tempfile shutil subprocess os time)
(setv parser (argparse.ArgumentParser))
(for [arg ["fixture" "kernel-manifest" "model-dir" "adapter-root" "output"]]
  (.add-argument parser (+ "--" arg) :required True))
(setv args (.parse-args parser) fixture (pathlib.Path args.fixture)
      repo (get (getattr (.resolve (pathlib.Path __file__)) "parents") 1)
      task (json.loads (.read-text (/ fixture "task.json")))
      originals (json.loads (.read-text (/ fixture "original-sources.json")))
      root (pathlib.Path (tempfile.mkdtemp :prefix "mithril-scheduled-generation-"))
      workspace (/ root "repo") hy (str (/ (getattr (pathlib.Path os.sys.executable) "parent") "hy")))
(.mkdir workspace)
(for [[name source] (.items originals)]
  (.mkdir (getattr (/ workspace name) "parent") :parents True :exist-ok True)
  (.write-text (/ workspace name) source))
(for [name (get task "inputs")] (shutil.copyfile (/ fixture name) (/ workspace name)))
(setv (get task "root") (str workspace) (get task "max-attempts") 1)
(.write-text (/ root "task.json") (json.dumps task :indent 2))
(setv env (dict os.environ) (get env "MITHRIL_GENERATOR_KIND") "mlx-coder" started (time.perf-counter)
      process (subprocess.run [(shutil.which "kbb") "--backend" "sci" "--config" "ports.edn" "--classpath" "src"
        "bin/mithril-agent.cljk" "generate" (str (/ root "task.json")) args.kernel-manifest
        (str (/ root "session")) hy args.model-dir args.adapter-root args.output]
        :cwd (str repo) :env env :capture-output True :text True :timeout 300)
      receipt (json.loads (.read-text (pathlib.Path args.output)))
      verification (get (get (get receipt "attempts") 0) "verification")
      checks (lfor row (get verification "results") (get row "value")))
(when (not (and (= process.returncode 0) (= (get receipt "status") "done")
                (get verification "passed") (= (get (get verification "schedule") "max-running") 2)
                (< (max (lfor c checks (get c "started-ms"))) (min (lfor c checks (get c "ended-ms"))))))
  (raise (ValueError "Generated source was not verified through actual concurrent scheduling")))
(.write-text (pathlib.Path (+ args.output ".retained.json"))
  (json.dumps (dfor name (get task "context") name (.read-text (/ workspace name))) :indent 2))
(.write-text (pathlib.Path (+ args.output ".measurement.json"))
  (json.dumps {"status" "done" "end_to_end_seconds" (- (time.perf-counter) started)
    "fixture" "known two-file clamp repair" "model_kind" "mlx-coder" "clef_controller_used" False
    "api_cost_jpy" 0 "electricity" None "device_amortization" None
    "scope" "Integration smoke under concurrent browser/test activity; not a model comparison."} :indent 2))
(print "Verified generated source and two overlapping checks via Mithril dependency scheduler.")
