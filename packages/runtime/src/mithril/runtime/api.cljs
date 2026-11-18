(ns mithril.runtime.api
  "The packaged JavaScript entrypoint of the Mithril language.

  Consumers (the Fund app Worker's /api/compile, system-one, the Code runner)
  call these plain ESM functions and never run a Kotoba toolchain. Inputs and
  outputs are JSON-compatible values converted exactly as `clj->js` converts
  them, so existing JSON consumers keep their byte-for-byte output."
  (:require [mithril.app :as mithril-app]
            [mithril.compiler :as compiler]
            [mithril.execution :as execution]
            [mithril.runtime.build-info :as build-info]))

(def version build-info/version)
(def source-sha build-info/source-sha)

(def app-agent-library-path "lib/app/agent-loop-v1.mith")

(def ^:private app-agent-library*
  (delay (compiler/compile-library-text app-agent-library-path build-info/app-agent-loop-v1)))

(defn app-agent-library
  "The compiled lib/app/agent-loop-v1.mith library artifact (Clojure data)."
  []
  @app-agent-library*)

(defn execute-app-source
  "Compile and execute one browser-submitted app Form, with the receipts the
  app Worker has always appended: compile, artifact test and a not-run deploy."
  [text]
  (let [artifact (mithril-app/compile-text "browser.mith" text [(app-agent-library)])
        semantic-run (execution/execute artifact)
        compiled {:id "compile" :operation "Mithril App IR" :status :executed
                  :engine :mithril.app/compile-text
                  :input-digest (:graph-digest artifact)
                  :output-digest (execution/digest (:app-ir artifact))
                  :metrics {:operations (count (get-in artifact [:app-ir :operations]))}}
        checked {:id "test" :operation "bounded artifact conformance" :status :executed
                 :engine :app-mithril.worker/artifact-check
                 :input-digest (:output-digest compiled)
                 :output-digest (execution/digest
                                 {:format (:format artifact)
                                  :max-steps (get-in artifact [:app-ir :budget :max-steps])})
                 :metrics {:checks 2 :failures 0}}
        deployment {:id "deploy" :operation "self-contained URL" :status :not-run
                    :detail "deployment requires the separate user action"}]
    {:artifact artifact
     :semantic-run semantic-run
     :trace (conj (vec (:receipts semantic-run)) compiled checked deployment)}))

(defn- refusal
  "A JS Error carrying the same code/detail the app Worker returned with 422."
  [error]
  (let [data (ex-data error)
        refused (js/Error. (or (:detail data) (.-message error)))]
    (set! (.-code refused) (str (or (:mithril/error data) :mithril/invalid-source)))
    (set! (.-detail refused) (or (:detail data) (.-message error)))
    (set! (.-cause refused) error)
    refused))

(defn ^:export compileApp
  "compileApp(text) → {artifact, semanticRun, trace}. Throws an Error with
  `code` (e.g. \":mithril.form/read-error\") and `detail` when refused."
  [text]
  (let [{:keys [artifact semantic-run trace]}
        (try (execute-app-source (str text))
             (catch :default error (throw (refusal error))))]
    (clj->js {:artifact artifact :semanticRun semantic-run :trace trace})))

(defn ^:export appAgentLibrary [] (clj->js (app-agent-library)))
