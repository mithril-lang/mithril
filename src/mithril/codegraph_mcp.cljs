(ns mithril.codegraph-mcp
  "Local, newline-delimited MCP stdio adapter for the .mith exploration API."
  (:require [clojure.string :as str]
            [mithril.codegraph-fs :as local]))

(def protocol-versions #{"2025-06-18" "2025-03-26"})
(defn- failure [id code message]
  {:jsonrpc "2.0" :id id :error {:code code :message message}})

(defn tool [artifact]
  {:name "mithril_codegraph"
   :description "Explore the local code graph before reading whole files. Results include indexed source spans, revision digests and unresolved/unsupported diagnostics. Static resolution is not a runtime call proof."
   :inputSchema {:type "object" :required ["operation"] :additionalProperties false
                 :properties
                 {:operation {:type "string" :enum (vec (remove #{"rdf"} (get-in artifact [:codegraph-ir :queries])))}
                  :query {:type "string" :minLength 1 :maxLength 256}
                  :community {:type "string"}
                  :revision {:type "string"} :kind {:type "string"}
                  :offset {:type "integer" :minimum 0 :maximum 67108864}
                  :node {:type "string"} :from {:type "string"} :to {:type "string"}
                  :limit {:type "integer" :minimum 1 :maximum (get-in artifact [:codegraph-ir :max-results])}
                  :depth {:type "integer" :minimum 1 :maximum (get-in artifact [:codegraph-ir :max-depth])}}}
   :annotations {:readOnlyHint true :destructiveHint false :openWorldHint false}})

(defn handle!
  "Session state + injectable local query make protocol behavior testable."
  [session artifact query-fn message]
  (let [id (:id message) method (:method message) params (:params message)
        notification? (not (contains? message :id))
        valid? (and (map? message) (= "2.0" (:jsonrpc message)) (string? method)
                    (or notification? (string? id) (number? id)))]
    (cond
      (not valid?) (failure nil -32600 "Invalid JSON-RPC request")
      (= method "notifications/initialized")
      (do (when (= :initializing @session) (reset! session :ready)) nil)
      notification? nil
      (= method "initialize")
      (if (not= :new @session) (failure id -32600 "Session already initialized")
          (do (reset! session :initializing)
              {:jsonrpc "2.0" :id id
               :result {:protocolVersion (if (contains? protocol-versions (:protocolVersion params))
                                           (:protocolVersion params) "2025-06-18")
                        :capabilities {:tools {}}
                        :serverInfo {:name "mithril-codegraph" :version "1.0.0"}
                        :instructions "Use mithril_codegraph explore/search for code questions; use full node names or IDs for callers, callees, impact and path. Index refresh stays local. Consult status diagnostics before treating the graph as complete."}}))
      (= method "ping") {:jsonrpc "2.0" :id id :result {}}
      (not= :ready @session) (failure id -32002 "Initialize the MCP session first")
      (= method "tools/list") {:jsonrpc "2.0" :id id :result {:tools [(tool artifact)]}}
      (= method "tools/call")
      (if-not (and (= "mithril_codegraph" (:name params))
                    (map? (:arguments params))
                    (not= "rdf" (get-in params [:arguments :operation])))
        (failure id -32602 "Unknown tool or invalid arguments")
        (try
          (let [result (query-fn (:arguments params))]
            {:jsonrpc "2.0" :id id
             :result {:content [{:type "text" :text (.stringify js/JSON (clj->js result))}]
                      :structuredContent result :isError false}})
          (catch :default e
            {:jsonrpc "2.0" :id id
             :result {:content [{:type "text" :text (.-message e)}] :isError true}})))
      :else (failure id -32601 "Unknown MCP method"))))

(defn serve! [root artifact]
  (let [root (local/root! root) session (atom :new) pending (atom "")
        emit! #(when % (.write (.-stdout js/process) (str (.stringify js/JSON (clj->js %)) "\n")))
        line! (fn [line]
                (try
                  (emit! (handle! session artifact #(local/query! root artifact %)
                                  (js->clj (js/JSON.parse line) :keywordize-keys true)))
                  (catch :default _ (emit! (failure nil -32700 "Invalid JSON")))))]
    (.setEncoding (.-stdin js/process) "utf8")
    (.on (.-stdin js/process) "data"
         (fn [chunk]
           (swap! pending str chunk)
           ;; Limit the accumulated input before splitting to bound both a
           ;; giant line and a flood of newline-delimited messages in one chunk.
           (if (> (count @pending) 1048576)
             (do (emit! (failure nil -32600 "MCP input budget exceeded"))
                 (.destroy (.-stdin js/process)))
             (let [lines (str/split @pending #"\n" -1)]
               (reset! pending (last lines))
               (doseq [line (butlast lines) :when (not (str/blank? line))] (line! line))))))
    (.on (.-stdin js/process) "end"
         (fn [] (when (seq @pending) (emit! (failure nil -32700 "MCP message requires a newline")))))))
