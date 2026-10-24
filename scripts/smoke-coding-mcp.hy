"Exercise Mithril source generation through its actual stdio MCP transport."
(import argparse pathlib json tempfile shutil subprocess os time select hashlib)
(setv parser (argparse.ArgumentParser))
(for [arg ["fixture" "kernel-manifest" "model-dir" "adapter-root" "output-dir"]]
  (.add-argument parser (+ "--" arg) :required True))
(.add-argument parser "--protocol" :choices ["2025-11-25" "2026-07-28"] :default "2025-11-25")
(setv args (.parse-args parser) repo (get (getattr (.resolve (pathlib.Path __file__)) "parents") 1)
      fixture (pathlib.Path args.fixture) out (pathlib.Path args.output-dir)
      task (json.loads (.read-text (/ fixture "task.json")))
      originals (json.loads (.read-text (/ fixture "original-sources.json")))
      root (pathlib.Path (tempfile.mkdtemp :prefix "mithril-coding-mcp-smoke-"))
      workspace (/ root "repo") hy (str (/ (getattr (pathlib.Path os.sys.executable) "parent") "hy"))
      transcript [] process None started (time.perf-counter))
(setv source-hashes (dfor name ["bin/mithril-coding-mcp.cljk" "src/mithril/coding_mcp.cljk"
  "src/mithril/generated_runner.cljk" "src/mithril/generator.cljk" "src/mithril/patch.cljk"
  "src/mithril/schedule.cljk" "src/mithril/evaluation.cljk" "scripts/smoke-coding-mcp.hy"]
  name (.hexdigest (hashlib.sha256 (.read-bytes (/ repo name))))))
(.mkdir out :parents True :exist-ok False)
(.mkdir workspace)
(for [[name source] (.items originals)]
  (.mkdir (getattr (/ workspace name) "parent") :parents True :exist-ok True)
  (.write-text (/ workspace name) source))
(for [name (get task "inputs")] (shutil.copyfile (/ fixture name) (/ workspace name)))
(setv (get task "root") (str workspace))
(.write-text (/ root "task.json") (json.dumps task :indent 2))
(defn send [value]
  (.append transcript {"direction" "client" "message" value})
  (.write process.stdin (+ (json.dumps value) "\n")) (.flush process.stdin))
(defn receive [expected timeout]
  (setv ready (get (select.select [process.stdout] [] [] timeout) 0))
  (when (not ready) (raise (TimeoutError "MCP reply deadline")))
  (setv value (json.loads (.readline process.stdout)))
  (.append transcript {"direction" "server" "message" value})
  (when (!= (get value "id") expected) (raise (ValueError "MCP reply identity")))
  value)
(try
  (setv process (subprocess.Popen [(shutil.which "kbb") "--backend" "sci" "--config" "ports.edn" "--classpath" "src"
        "bin/mithril-coding-mcp.cljk" (str (/ root "task.json")) args.kernel_manifest (str (/ root "sessions"))
        hy "mlx-coder" args.model_dir args.adapter_root]
        :cwd (str repo) :stdin subprocess.PIPE :stdout subprocess.PIPE :stderr subprocess.PIPE :text True))
  (setv meta (if (= args.protocol "2026-07-28") {"_meta" {"io.modelcontextprotocol/protocolVersion" args.protocol
        "io.modelcontextprotocol/clientCapabilities" {}}} {}))
  (if (= args.protocol "2026-07-28")
    (do
      (send {"jsonrpc" "2.0" "id" 1 "method" "server/discover" "params" meta})
      (setv discovery (get (receive 1 30) "result"))
      (when (!= (get discovery "protocolVersion") args.protocol) (raise (ValueError "MCP discovery protocol"))))
    (do
      (send {"jsonrpc" "2.0" "id" 1 "method" "initialize" "params" {"protocolVersion" args.protocol "capabilities" {} "clientInfo" {"name" "mithril-smoke" "version" "1"}}})
      (receive 1 30)
      (send {"jsonrpc" "2.0" "method" "notifications/initialized"})))
  (send {"jsonrpc" "2.0" "id" 2 "method" "tools/list" "params" meta})
  (setv tools (get (get (receive 2 30) "result") "tools"))
  (when (!= (lfor tool tools (get tool "name")) ["mithril_code"]) (raise (ValueError "MCP tool discovery")))
  (setv params (dict meta))
  (.update params {"name" "mithril_code" "arguments" {"goal" (get task "goal")}})
  (send {"jsonrpc" "2.0" "id" 3 "method" "tools/call" "params" params})
  (setv reply (receive 3 300) value (get (get reply "result") "structuredContent")
        retained (dfor name (get task "context") name (.read-text (/ workspace name)))
        directory (/ root "sessions" (get value "receipt-id")))
  (for [name ["receipt.json" "receipt.json.metrics.json"]] (shutil.copyfile (/ directory name) (/ out name)))
  (.write-text (/ out "retained.json") (json.dumps retained :indent 2))
  (.write-text (/ out "wire.json") (json.dumps transcript :indent 2))
  (.write-text (/ out "measurement.json") (json.dumps {"status" (get value "status") "success" False
    "transport" "stdio-mcp" "protocol" args.protocol "end_to_end_seconds" (- (time.perf-counter) started)
    "timing_boundary" "Fixture preparation through tool response; clean shutdown not yet verified."
    "source_sha256" source-hashes "shutdown_verified" False
    "scope" "Single integration attempt; a failed attempt must remain recorded."
    "clef_controller_used" False "api_cost_jpy" 0 "total_cost_jpy" None} :indent 2))
  (when (not (and (get value "success") (get value "verification-passed")
                 (= (get value "max-concurrent-checks") 2) (= (set (get value "changed-files")) (set (get task "context")))
                 (= (get value "receipt-sha256") (.hexdigest (hashlib.sha256 (.read-bytes (/ directory "receipt.json")))))))
    (raise (ValueError "MCP coding did not verify and retain the declared change")))
  (.close process.stdin) (setv process.stdin None)
  (setv [stdout stderr] (.communicate process :timeout 30))
  (when (or (!= process.returncode 0) stdout stderr) (raise (ValueError "MCP transport did not shut down cleanly")))
  (.write-text (/ out "measurement.json") (json.dumps {"status" "done" "success" True "transport" "stdio-mcp"
    "protocol" args.protocol "end_to_end_seconds" (- (time.perf-counter) started)
    "timing_boundary" "Fixture preparation through verified publication and clean worker shutdown; excludes initial model download."
    "scope" "Single known-task integration smoke; not a model comparison."
    "source_sha256" source-hashes "shutdown_verified" True
    "clef_controller_used" False "api_cost_jpy" 0 "total_cost_jpy" None} :indent 2))
  (print "Verified actual Mithril generation, concurrent checks, publication and clean stdio MCP shutdown.")
  (finally
    (when (and process (is (.poll process) None))
      (.terminate process) (.communicate process :timeout 30))))
