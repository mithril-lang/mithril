(ns mithril.codegraph-system-one
  "Owner-bound System One graph context and isolated candidate verification."
  (:require [clojure.string :as str]
            [mithril.codegraph :as graph]
            [mithril.codegraph-fs :as local]
            [mithril.codegraph-store :as store]
            [mithril.codegraph-extract :as extract]))

(defn- refuse! [reason]
  (throw (ex-info (name reason) {:reason reason})))

(defn- target! [target]
  (when-not (and (string? target) (<= (count target) 240)
                (re-matches #"[A-Za-z0-9_][A-Za-z0-9_./-]*\.mith" target)
                (not-any? #{"." ".." ".mithril-codegraph" ".git"} (str/split target #"/")))
    (refuse! :invalid-target))
  target)

(defn- private-parent! [root]
  (let [parent (.join local/path-api root ".mithril-codegraph" "system-one-candidates")]
    (doseq [dir [(.dirname local/path-api parent) parent]]
      (when (and (.existsSync local/fs dir) (.isSymbolicLink (.lstatSync local/fs dir)))
        (refuse! :candidate-symlink)))
    (.mkdirSync local/fs parent #js {:recursive true :mode 448})
    parent))

(defn- write-source! [root relative text]
  (let [file (.join local/path-api root relative)]
    (.mkdirSync local/fs (.dirname local/path-api file) #js {:recursive true :mode 448})
    (.writeFileSync local/fs file text #js {:mode 384})
    file))

(defn- candidate! [root artifact snapshot input]
  (let [{:keys [target source revision source-digest]} input
        entry (get-in snapshot [:files target])]
    (target! target)
    (when-not (and (string? source) (<= (.byteLength js/Buffer source "utf8") 8192))
      (refuse! :candidate-source-budget))
    (when-not (and (= revision (:snapshot-digest snapshot))
                  (= source-digest (:source-digest entry))) (refuse! :stale-revision))
    ;; Copy admitted, immutable source strings, never live paths after the check.
    ;; Candidate Git roots contain no target credentials, hooks or executables.
    (let [dir (.join local/path-api (private-parent! root) (.randomUUID (js/require "crypto")))]
      (.mkdirSync local/fs dir #js {:mode 448})
      (try
        (doseq [[p e] (:files snapshot)] (write-source! dir p (:source e)))
        (.execFileSync (js/require "child_process") "git" #js ["init" "-q" dir]
                       #js {:env #js {:PATH (.-PATH js/process.env) :HOME (.-HOME js/process.env)}
                            :timeout 10000 :maxBuffer 1048576})
        (let [before (local/sync! dir artifact)
              file (write-source! dir target source)
              after (local/sync! dir artifact)
              candidate (:snapshot after)
              diagnostics (get-in candidate [:files target :diagnostics])]
          (when (some #(= :extraction-failed (:reason %)) diagnostics)
            (refuse! :candidate-extraction-failed))
          (let [reasoned (store/reason! (get-in after [:archive :directory]) candidate artifact)]
            (when-not (local/freshness! root artifact revision) (refuse! :stale-revision))
            {:repository-revision revision :base-source-digest source-digest
             :source-digest (extract/source-digest source) :target target :candidate-path file
             :before (:receipt before) :after (:receipt after)
             :diagnostics diagnostics
             :reasoning (dissoc reasoned :result)
             :conforms? (= :conforms (:status reasoned))}))
        (catch :default e
          ;; Retain completed archives for review, but never advertise a partial success.
          (throw (ex-info (ex-message e) (assoc (ex-data e) :candidate-directory dir))))))))

(defn run! [root artifact input]
  (let [action (:action input)
        allowed (case action "query" #{:action :request}
                             "context" #{:action :target :request}
                             "candidate" #{:action :target :source :revision :source-digest}
                             ("index" "rebuild" "reason") #{:action} nil)]
    (when-not (and (map? input) allowed (= (set (keys input)) allowed))
      (refuse! :invalid-arguments))
    (when (contains? input :target) (target! (:target input)))
    (let [root (local/root! root)
          synced (local/sync! root artifact {:rebuild? (= action "rebuild")})
          snapshot (:snapshot synced)]
      (case action
        ("index" "rebuild") (:receipt synced)
        "query" (graph/dispatch snapshot artifact (:request input))
        "reason" (dissoc (store/reason! (get-in synced [:archive :directory]) snapshot artifact) :result)
        "context" (let [entry (get-in snapshot [:files (:target input)])]
                    (when (> (.byteLength js/Buffer (or (:source entry) "") "utf8") 8192)
                      (refuse! :candidate-source-budget))
                    {:revision (:snapshot-digest snapshot) :target (:target input)
                     :source (:source entry) :source-digest (:source-digest entry)
                     :graph (graph/dispatch snapshot artifact (:request input))})
        "candidate" (candidate! root artifact snapshot input)))))
