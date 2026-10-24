"Real CLEF-assisted development of the port's budget predicate, in scratch."
(import argparse pathlib sys json hashlib subprocess os tempfile)
(setv parser (argparse.ArgumentParser))
(.add-argument parser "--model-dir" :required True)
(.add-argument parser "--clef-adapter-root" :required True)
(.add-argument parser "--output" :required True)
(setv args (.parse-args parser) repo (get (getattr (.resolve (pathlib.Path __file__)) "parents") 1)
      source-path (/ repo "ports/policy.kotoba") original (.read-text source-path)
      good "(if (> n 0) 1 0)" bad "(if (>= n 0) 1 0)"
      source (.replace (.replace original "(ns mithril.port-policy" "(ns coding.program") good bad))
(when (!= (.count original good) 1) (raise (ValueError "Policy precondition changed")))
(sys.path.insert 0 (str (.resolve (pathlib.Path args.clef-adapter-root))))
(import local_support :as support)
(setv task {"source" source "old" bad
            "candidates" [good bad "(if (< n 0) 1 0)"]
            "goal" "A remaining execution budget is available exactly when n is strictly positive. Zero and negative budgets must be refused."}
      prepared (support.controller "prepare" task))
(when (get (get prepared "initial") "passed") (raise (RuntimeError "Seeded zero-budget mutation unexpectedly passed")))
(setv model (support.load-model args.model-dir) decision (support.decide model (get prepared "request"))
      probabilities (get (get decision "questions") "next_action")
      repair (support.controller "finish" prepared {"probabilities" probabilities})
      scratch (pathlib.Path (tempfile.mkdtemp :prefix "mithril-port-development-")))
(.write-text (/ scratch "policy-mutant.kotoba") source)
(when (= (get repair "status") "verified")
  (.write-text (/ scratch "policy-repaired.kotoba") (.replace (get repair "source") "(ns coding.program" "(ns mithril.port-policy"))
  (when (!= (.read-text (/ scratch "policy-repaired.kotoba")) original)
    (raise (RuntimeError "Repair did not recover the intended policy"))))
(.write-text (pathlib.Path args.output) (json.dumps {"format" "mithril.port-development/v1"
       "experiment" "explicit zero-budget mutation; not novel autonomous source generation"
       "source" (str source-path) "source_sha256" (.hexdigest (hashlib.sha256 (.encode original)))
       "decision" decision "repair" repair "scratch" (str scratch)
       "original_unchanged" (= (.read-text source-path) original)} :indent 2))
(print "Port development:" (get repair "status") "receipt:" args.output)
