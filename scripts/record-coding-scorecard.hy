"Recompute model comparisons and integration measurements without pooling unlike trials."
(import argparse pathlib json hashlib statistics re datetime)
(setv parser (argparse.ArgumentParser))
(.add-argument parser "--web-log" :required True)
(.add-argument parser "--runtime-log" :required True)
(.add-argument parser "--output" :required True)
(setv args (.parse-args parser) repo (get (getattr (.resolve (pathlib.Path __file__)) "parents") 1)
      evidence (/ repo "docs/evidence") files {})
(defn digest [path] (.hexdigest (hashlib.sha256 (.read-bytes path))))
(defn read [relative]
  (setv path (/ evidence relative) (get files relative) (digest path))
  (json.loads (.read-text path)))
(setv rows (read "generation-final-2026-10-05/runs.json")
      protocol (read "generation-final-2026-10-05/protocol.json") comparison {})
(when (!= (len rows) (* 2 (get protocol "repeats"))) (raise (ValueError "Incomplete comparison")))
(for [kind ["clef" "mlx-coder"]]
  (setv runs (lfor r rows :if (= (get r "model") kind) r)
        good (lfor r runs :if (get r "success") r) times (lfor r runs (get r "end_to_end_seconds")))
  (for [run runs]
    (setv receipt (read (+ "generation-final-2026-10-05/" (get run "receipt"))))
    (when (!= (get run "success") (= (get receipt "status") "done"))
      (raise (ValueError "Comparison receipt/status mismatch"))))
  (setv (get comparison kind) {"trials" (len runs) "completed" (len good)
    "completion_rate" (/ (len good) (len runs)) "median_all_seconds" (statistics.median times)
    "seconds_per_success_including_failures" (if good (/ (sum times) (len good)) None)
    "api_cost_jpy" (sum (lfor r runs (get r "api_cost_jpy"))) "total_cost_jpy" None
    "scope" "One known two-file task, three repeats; not held-out coding accuracy."}))
(setv integrations [])
(for [directory ["mcp-coding-2026-10-05" "mcp-modern-coding-2026-10-05" "mcp-modern-coding-2026-10-05-gpu"
                 "mcp-web-coding-2026-10-05"]]
  (setv measurement (read (+ directory "/measurement.json"))
        metrics (read (+ directory "/receipt.json.metrics.json"))
        receipt (read (+ directory "/receipt.json")))
  (when (!= (get metrics "receipt-sha256") (get files (+ directory "/receipt.json")))
    (raise (ValueError "Integration receipt hash mismatch")))
  (.append integrations {"evidence" directory "success" (get metrics "success")
    "failure_category" (.get measurement "failure_category")
    "end_to_end_seconds" (get measurement "end_to_end_seconds")
    "timing_boundary" (.get measurement "timing_boundary" "Preparation through result retention; recorded before worker shutdown.")
    "runner_seconds" (get (get metrics "timing") "cli-wall-seconds")
    "generation_seconds" (get (get (get metrics "timing") "generation-seconds") "total")
    "verification_seconds" (get (get metrics "timing") "verification-wall-seconds")
    "checks_passed" (get metrics "passed-checks") "checks" (get metrics "verification-checks")
    "input_tokens" (get (get metrics "input-tokens") "total")
    "output_tokens" (get (get metrics "output-tokens") "total")
    "api_cost_jpy" (get (get metrics "cost") "api-amount") "total_cost_jpy" None
    "clef_controller_used" (get metrics "clef-controller-used")}))
(setv web (pathlib.Path args.web_log) runtime (pathlib.Path args.runtime_log)
      web-text (.read-text web) runtime-text (.read-text runtime)
      counts (re.search r"Tests\s+(\d+) failed \| (\d+) passed \| (\d+) skipped \((\d+)\)" web-text)
      duration (re.search r"Duration\s+([\d.]+)s" web-text)
      rt (re.search r"Ran (\d+) tests containing (\d+) assertions\.\s+(\d+) failures, (\d+) errors\." runtime-text))
(when (not (and counts duration rt)) (raise (ValueError "Need terminal test summaries")))
(setv [failed passed skipped total] (lfor s (.groups counts) (int s))
      [tests assertions failures errors] (lfor s (.groups rt) (int s)))
(when (!= (+ failed passed skipped) total) (raise (ValueError "Invalid Web test counts")))
(setv result {"format" "mithril.coding-scorecard/v1"
  "recorded_at_utc" (.isoformat (datetime.datetime.now datetime.timezone.utc))
  "comparison" comparison "integration_smokes" integrations
  "runtime_checks" {"tests" tests "assertions" assertions "failures" failures "errors" errors
                    "log_sha256" (digest runtime)}
  "web_checks" {"passed" passed "failed" failed "skipped" skipped "total" total
    "pass_rate_excluding_skips" (/ passed (+ passed failed)) "wall_seconds" (float (get (.groups duration) 0))
    "log_sha256" (digest web) "scope" "Existing UI regression suite; not model-generated task accuracy or Mithril UI-port completion."}
  "unmeasured_costs" ["electricity" "device amortization" "human implementation" "Codex account usage"]
  "training_performed" False "evidence_sha256" files})
(.write-text (pathlib.Path args.output) (+ (json.dumps result :indent 2) "\n"))
(print (json.dumps {"comparison" comparison "runtime_checks" (get result "runtime_checks")
                  "web_checks" (get result "web_checks")} :indent 2))
