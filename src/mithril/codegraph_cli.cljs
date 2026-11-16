(ns mithril.codegraph-cli
  (:require [mithril.codegraph-contract :as contract]
            [mithril.codegraph-fs :as fs]
            [mithril.codegraph-mcp :as mcp]
            [mithril.codegraph-ui :as ui]
            [mithril.codegraph-web :as web]
            [mithril.codegraph-store :as store]
            [mithril.reason-ipld :as evidence]))

(defn print-json [value]
  (println (.stringify js/JSON (clj->js value) nil 2)))

(defn- usage! []
  (throw (ex-info "usage: mithril codegraph <compile|index|reason|verify|evidence|query|serve|ui|web> [repository-root] [JSON request|--rebuild]"
                  {:mithril/error :mithril.codegraph/usage})))

(defn run! [command args]
  (let [artifact (contract/load!)
        [root request & extra] args]
    (when (seq extra) (usage!))
    (case command
      "compile" (if (empty? args) (print-json artifact) (usage!))
      "serve" (if (and root (nil? request)) (mcp/serve! root artifact) (usage!))
      "web" (if (and root (or (nil? request) (= "--rebuild" request)))
              (web/serve! root artifact (= "--rebuild" request)) (usage!))
      "ui" (if (and root (or (nil? request) (= "--rebuild" request)))
             (let [root (fs/root! root)
                   snapshot (:snapshot (fs/sync! root artifact {:rebuild? (= "--rebuild" request)}))]
               (print-json (ui/write! root snapshot artifact))) (usage!))
      "index" (if (and root (or (nil? request) (= "--rebuild" request)))
                (print-json (:receipt (fs/sync! root artifact {:rebuild? (= "--rebuild" request)}))) (usage!))
      "query" (if (and root request)
                (print-json (fs/query! root artifact
                                      (js->clj (js/JSON.parse request) :keywordize-keys true)))
                (usage!))
      ("reason" "verify" "evidence")
      (if (and root (nil? request))
        (let [synced (fs/sync! root artifact)
              snapshot (:snapshot synced)
              persisted (store/reason! (get-in synced [:archive :directory]) snapshot artifact)
              source (.readFileSync fs/fs
                                    (.join fs/path-api (get-in synced [:archive :directory]) "ontology.mith") "utf8")
              result (:result persisted)]
          (if (= command "reason")
            (do (print-json (dissoc persisted :result))
                (when-not (= :conforms (:status result))
                  (set! (.-exitCode js/process) (if (= :refused (:status result)) 2 1))))
            (do
          (when-not (= :conforms (:status result))
            (throw (ex-info "codegraph RDF did not pass OWL/SHACL admission"
                            {:mithril/error :mithril.codegraph/invalid-rdf :result result})))
          (if (= command "verify")
            (print-json {:snapshot-digest (:snapshot-digest snapshot)
                         :graph-digest (:graph-digest snapshot)
                         :conforms? true :counts (:counts result)
                         :mith-directory (:directory persisted) :reasoned-path (:reasoned-path persisted)})
            (let [data (.readFileSync fs/fs (.join fs/path-api (get-in synced [:archive :directory]) "asserted.mith") "utf8")
                  blocks (evidence/blocks source "asserted.mith" data nil [])]
              ;; Evidence is opt-in and local. Return the bytes so a caller may
              ;; put them in an existing IPLD store without new network authority.
              (print-json {:snapshot-digest (:snapshot-digest snapshot)
                           :semantic-cid (get-in blocks [:semantic :cid])
                           :evidence-cid (get-in blocks [:evidence :cid])
                           :semantic-bytes (vec (get-in blocks [:semantic :bytes]))
                           :evidence-bytes (vec (get-in blocks [:evidence :bytes]))}))))))
        (usage!))
      (usage!))))
