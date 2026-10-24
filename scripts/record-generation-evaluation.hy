"Create a reviewable report from all final episodes, including execution failures and missing measurements."
(import argparse pathlib json statistics)
(setv parser (argparse.ArgumentParser))
(.add-argument parser "--evidence" :required True)
(.add-argument parser "--report" :required True)
(setv args (.parse-args parser) evidence (pathlib.Path args.evidence)
      rows (json.loads (.read-text (/ evidence "runs.json")))
      protocol (json.loads (.read-text (/ evidence "protocol.json"))) metrics {})
(when (!= (len rows) (* 2 (get protocol "repeats"))) (raise (ValueError "Incomplete trial set")))
(for [kind ["clef" "mlx-coder"]]
  (setv runs (lfor r rows :if (= (get r "model") kind) r)
        successes (lfor r runs :if (get r "success") r)
        times (lfor r runs (get r "end_to_end_seconds"))
        measured (lfor r runs :if (get r "generation_metrics_complete") r))
  (setv (get metrics kind)
    {"runs" (len runs) "successes" (len successes) "task_completion_rate" (/ (len successes) (len runs))
     "all_run_median_seconds" (statistics.median times) "range_seconds" [(min times) (max times)]
     "successful_median_seconds" (if successes (statistics.median (lfor r successes (get r "end_to_end_seconds"))) None)
     "total_episode_seconds" (sum times)
     "episode_seconds_per_success_including_failures" (if successes (/ (sum times) (len successes)) None)
     "provider_failure_calls" (sum (lfor r runs (get r "failed_provider_calls")))
     "metrics_coverage" (/ (len measured) (len runs))
     "input_tokens_median" (if measured (statistics.median (lfor r measured (get r "input_tokens"))) None)
     "output_tokens_median" (if measured (statistics.median (lfor r measured (get r "output_tokens"))) None)
     "generation_seconds_median" (if measured (statistics.median (lfor r measured (get r "generation_seconds"))) None)
     "peak_memory_gb_max" (if measured (max (lfor r measured (get r "peak_memory_gb"))) None)
     "api_cost_jpy" 0 "api_cost_per_success_jpy" (if successes 0 None)
     "electricity_jpy" None "device_amortization_jpy" None "human_development_cost_jpy" None
     "training_performed" False}))
(.write-text (/ evidence "metrics.json") (json.dumps metrics :indent 2))
(setv lines ["# Mithril coding evaluation — 2026-10-05" ""
 "Same two-file CLJK clamp repair, same file-planning/source-generation helper, immutable checks, one attempt per episode, three repeats per model. No solution candidates or manual source corrections were supplied. Episodes alternate model order and use separate repositories/sessions. Both checks must pass on unchanged staged source before publication. Terminal completion and retained source are required."
 "" "| Local generator | Completed tasks | Successful median | All-run median | All-run range | API cost |"
 "| --- | --- | --- | --- | --- | --- |"])
(for [[kind title] [["clef" "CLEF backbone"] ["mlx-coder" "Qwen2.5-Coder 7B 4-bit"]]]
  (setv m (get metrics kind) good (get m "successful_median_seconds") range (get m "range_seconds"))
  (.append lines (.format "| {} | {}/{} | {} | {:.3f} s | {:.3f}–{:.3f} s | JPY 0 |" title
      (get m "successes") (get m "runs") (if good (.format "{:.3f} s" good) "No successful run")
      (get m "all_run_median_seconds") (get range 0) (get range 1))))
(.extend lines ["" "CLEF's finite-choice controller and its autoregressive backbone are different capabilities. The previous supplied-candidate suite completed 9/9 repairs with actual CLEF selection; the current free-generation episodes measure its backbone through the same transport helper used by the coder. The coder runs do not use a CLEF controller. A generated-code integration failure counts against task completion but is not an independently measured semantic-code error. Failure diagnostics are in each receipt; absent token/time/memory measurements remain null, rather than fabricated zeros."
 "" "All three final CLEF episodes failed with an unterminated JSON string before verification. Their partial generated text and token counts were not returned by the helper, so semantic correctness and partial token usage are unmeasured. Improving this transport termination/telemetry path is the next testable hypothesis; these failures do not prove the backbone cannot code."
 "" "One known task repeated three times is an exploratory integration check, not a held-out benchmark or evidence of general coding accuracy. No model training or weight update was performed. Model order alternates, but machine background activity and thermal/cache state are not controlled; preliminary timings differ from final timings (coder pilot median 10.059 s versus final 17.132 s). Report both sets and do not infer steady-state speed or p95 from three repeats."
 "" "API cost is zero for offline local inference. Electricity, device amortization, human implementation, initial download time and training cost are outside the timed episode and remain unmeasured. Zero API billing does not mean zero total cost. No cost-efficiency ranking between models is established."
 "" "Measured machine: Apple M1 Max, 32 GiB memory, macOS 26.4. Runtime versions: Hy 1.3.1, MLX 0.32.3, mlx-lm 0.31.3, Outlines 1.2.12, outlines-core 0.2.14, Transformers 5.18.0, huggingface-hub 1.33.0. CLEF revision: 6d4dc3ff7f43fba6065f1caef5c7a135315dfc8d. Coder revision: 019cc73c45c770444708a6dd8690c66243cc5c80. Source hashes and model artifact hashes are recorded in protocol.json."
 "" "Reproduction uses scripts/benchmark-generation.hy with explicit local model directories, the pinned kernel manifest, adapter root, fixture task and a fresh output directory. scripts/record-generation-evaluation.hy --evidence <output-directory> --report <report-file> builds this report and metrics.json from the full episode set. Exact task/checks and original source are retained alongside the receipts."
 "" "Original comparison validation: 23 tests / 146 assertions passed. Subsequent scheduler/recovery/measurement changes passed 31 tests / 182 assertions on 2026-10-05, recorded separately in coding-measurement-2026-10-05.md. Harness tests are separate from model task completion."
 "" "The dependency scheduler now runs the generated-code checks concurrently; its later integration smoke is separate from this paired comparison. Full UI compatibility and the complete product-name migration remain in progress. These coding measurements do not qualify those requirements or a production deployment. Local changes and evidence have not been merged/deployed."
 "" "Evidence: generation-final-2026-10-05/{protocol,runs,summary,metrics}.json, per-model receipts and retained sources. The earlier generation-2026-10-05/ pilot is preserved; its missing generation telemetry was originally zero-filled and must not be interpreted as measured zero usage. Historical free-generation exploratory receipts are stored separately, not pooled into the paired comparison."])
(.write-text (pathlib.Path args.report) (+ (.join "\n" lines) "\n"))
(print (json.dumps metrics :indent 2))
