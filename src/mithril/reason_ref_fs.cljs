(ns mithril.reason-ref-fs
  "Local mutable names for immutable generic reason evidence. Every publish
  verifies the full OWL/SHACL history under one-filesystem write lock. This
  provides local compare-and-swap, not distributed consensus or fsync safety."
  (:require [clojure.string :as str]
            [mithril.checkpoint-ipld-fs :as local]
            [mithril.reason-ipld :as evidence]))

(def fs (js/require "node:fs"))
(def path (js/require "node:path"))

(defn- refuse! [reason]
  (throw (ex-info "Mithril reason ref refused"
                  {:mithril/error :mithril.reason-ref-fs/refused :reason reason})))

(defn- ref-path [store name]
  (when-not (and (string? name)
                 (re-matches #"[A-Za-z0-9][A-Za-z0-9._-]*" name))
    (refuse! :invalid-ref-name))
  (.join path (:directory store) "refs" (str "reason-" name)))

(defn- read-head [store name]
  (let [file (ref-path store name)]
    (when-not (.existsSync fs file) (refuse! :missing-ref))
    (str/trim (.readFileSync fs file "utf8"))))

(defn- checked [store head]
  (evidence/verify-history! #(local/get-block store %) head))

(defn- create-under-lock! [store name head]
  (try (.writeFileSync fs (ref-path store name) (str head "\n")
                          #js {:flag "wx" :mode 384})
       (catch :default error
         (if (= "EEXIST" (.-code error)) (refuse! :ref-exists)
             (throw error))))
  head)

(defn create!
  "Create a new name for an independently verified immutable history."
  [store name head]
  (local/with-store-lock! store
    (fn []
      (when (.existsSync fs (ref-path store name)) (refuse! :ref-exists))
      (checked store head)
      (create-under-lock! store name head))))

(defn read!
  "Resolve a name and independently replay the referenced history."
  [store name]
  (checked store (read-head store name)))

(defn fork!
  "Fork a checked head to another local name without copying its blocks."
  [store source target]
  (local/with-store-lock! store
    (fn []
      (when (.existsSync fs (ref-path store target)) (refuse! :ref-exists))
      (let [head (read-head store source)]
        (checked store head)
        (create-under-lock! store target head)))))

(defn advance!
  "Compare-and-swap an existing name. The next evidence must directly name
  the expected head as parent; an unrelated valid CID cannot move the ref."
  [store name expected next-id]
  (local/with-store-lock! store
    (fn []
      (let [observed (read-head store name)]
        (when-not (= expected observed) (refuse! :ref-conflict))
        (let [verified (checked store next-id)
              saved (evidence/read! #(local/get-block store %) next-id)]
          (when-not (or (= next-id expected)
                        (= [expected] (:parents saved)))
            (refuse! :noncausal-ref-advance))
          (let [file (ref-path store name)
                temporary (str file ".tmp-" (.-pid js/process) "-" (.now js/Date))]
            (.writeFileSync fs temporary (str next-id "\n")
                              #js {:flag "wx" :mode 384})
            (.renameSync fs temporary file))
          verified)))))
