(ns mithril.mission-native
  "Explicit process adapter to the independent mithril-interop repository.
  Native source import never substitutes for Mithril IR admission."
  (:require [mithril.mission :as mission]))

(def operations
  #{"plugins" "c2sim-import" "c2sim-project" "msdl-import" "msdl-project" "xml-import" "xml-export" "xml-patch" "xml-project"
    "link16-encode" "link16-decode" "link16-loopback"
    "link16-send" "link16-receive" "hla-exercise"})

(defn invoke!
  "Run one reviewed host request using an explicitly selected Python runtime.
  Returns native receipts; projected model records undergo Mithril validation."
  [{:keys [python adapter-root]} request]
  (when-not (and (string? python) (string? adapter-root)
                 (contains? operations (get request "operation")))
    (throw (ex-info "explicit Python, adapter root and supported operation are required"
                    {:mithril/error :mithril.mission/native-config})))
  (let [result (.spawnSync (js/require "node:child_process") python
                          #js ["-m" "mithril_interop.cli" "rpc"]
                          #js {:cwd adapter-root
                               :input (.stringify js/JSON (clj->js request))
                               :encoding "utf8" :timeout 60000 :maxBuffer 8388608})]
    (when (or (.-error result) (not= 0 (.-status result)))
      (throw (ex-info (or (not-empty (.-stderr result)) "native host failed or timed out")
                      {:mithril/error :mithril.mission/native-refused})))
    (let [value (js->clj (.parse js/JSON (.-stdout result)))]
      (if (contains? #{"xml-project" "c2sim-project" "msdl-project"} (get request "operation"))
        (assoc value "compiled" (mission/compile-document (get value "model")))
        value))))
