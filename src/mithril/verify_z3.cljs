(ns mithril.verify-z3
  "Node host for mithril.verify: runs the z3 binary over SMT-LIB2 text.
  Explicit entry point only. The binary comes from MITHRIL_Z3 or PATH; when it
  is missing every result is :unknown with :solver-unavailable, never proved."
  (:require ["node:child_process" :as child-process]
            [mithril.verify :as verify]))

(def ^:private timeout-seconds 30)

(defn z3-binary []
  (or (some-> js/process .-env .-MITHRIL_Z3 not-empty) "z3"))

(defn z3-version
  "Return the z3 version line, or nil when the binary cannot run."
  []
  (let [result (.spawnSync child-process (z3-binary) #js ["--version"] #js {:encoding "utf8"})]
    (when (and (nil? (.-error result)) (zero? (.-status result)))
      (.trim (.-stdout result)))))

(defn solve
  "Run one SMT-LIB2 script through z3. Returns stdout, or nil when z3 is
  unavailable. A solver error is returned as text so the caller reports
  :unknown instead of guessing."
  [smt]
  (let [result (.spawnSync child-process (z3-binary)
                           #js ["-in" "-smt2" (str "-T:" timeout-seconds)]
                           #js {:input smt :encoding "utf8" :maxBuffer 16777216})]
    (cond
      (.-error result) nil
      :else (str (.-stdout result) (.-stderr result)))))

(defn verify-document
  ([doc] (verify-document doc {}))
  ([doc opts] (verify/verify-document doc (merge {:solve solve} opts))))

(defn verify-function
  ([checked function-name] (verify-function checked function-name {}))
  ([checked function-name opts]
   (verify/verify-function checked function-name (merge {:solve solve} opts))))
