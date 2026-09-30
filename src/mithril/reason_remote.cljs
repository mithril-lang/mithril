(ns mithril.reason-remote
  "Bounded, opt-in remote blocks for generic OWL/SHACL evidence.

  The injected client has the kotobase.blocks/client shape: asynchronous
  :get-block and :put-block! functions. No credential is held here. The
  /ipld/ read surface is public, so publication requires explicit consent.
  Immutable blocks are not a mutable ref/CAS service."
  (:require [ipld.core :as ipld]
            [mithril.reason-ipld :as evidence]
            [multiformats.core :as multiformats]))

(def default-limits {:max-blocks 512
                     :max-block-bytes (* 2 1024 1024)
                     :max-total-bytes (* 32 1024 1024)})

(defn- refuse! [reason data]
  (throw (ex-info "Mithril remote reason evidence refused"
                  (assoc data :mithril/error :mithril.reason-remote/refused
                              :reason reason))))

(defn- admitted! [{:keys [client public-read-consent? limits]} writing?]
  (when-not (ifn? (:get-block client))
    (refuse! :missing-get-block {}))
  (when (and writing? (not (ifn? (:put-block! client))))
    (refuse! :missing-put-block {}))
  (when (and writing? (not (true? public-read-consent?)))
    (refuse! :public-read-consent-required {}))
  (let [limits (merge default-limits limits)]
    (when-not (every? #(and (integer? (get limits %))
                            (pos? (get limits %)))
                      (keys default-limits))
      (refuse! :invalid-limits {}))
    limits))

(defn- checked-cid! [cid]
  (when-not (try (= multiformats/codec-dag-cbor (ipld/cid-codec cid))
                 (catch :default _ false))
    (refuse! :invalid-cid {:cid cid}))
  cid)

(defn- checked-block! [cid bytes limits total]
  (when-not bytes (refuse! :missing-block {:cid cid}))
  (let [size (.-length bytes)]
    (when-not (and (number? size)
                   (<= size (:max-block-bytes limits))
                   (<= (+ total size) (:max-total-bytes limits)))
      (refuse! :resource-limit {:cid cid :bytes size}))
    (let [actual (ipld/cid bytes)]
      (when-not (= cid actual)
        (refuse! :cid-mismatch {:cid cid :actual-cid actual})))
    size))

(defn fetch-history!
  "Fetch only a bounded CID closure, then replay the complete reason history.
  The client must enforce its own network response-size limit if it needs to
  bound bytes before the response body is allocated."
  [{:keys [client] :as options} head]
  (let [limits (admitted! options false)
        blocks (atom {})]
    (checked-cid! head)
    (letfn [(step [pending total]
              (if-let [cid (first pending)]
                (if (contains? @blocks cid)
                  (step (rest pending) total)
                  (do
                    (when (>= (count @blocks) (:max-blocks limits))
                      (refuse! :resource-limit {:max-blocks (:max-blocks limits)}))
                    (checked-cid! cid)
                    (-> (js/Promise.resolve ((:get-block client) cid))
                        (.then
                         (fn [bytes]
                           (let [size (checked-block! cid bytes limits total)
                                 node (ipld/decode bytes)
                                 links (ipld/links node)]
                             (swap! blocks assoc cid bytes)
                             (step (concat (rest pending) links) (+ total size))))))))
                (js/Promise.resolve
                 (evidence/verify-history! #(get @blocks %) head))))]
      (step [head] 0))))

(defn publish!
  "Publish two immutable blocks through an injected Kotobase-style client.
  The predecessor is remotely fetched and replayed before any write. Both
  blocks are fetched again and the full history replayed after PUT. A failed
  read-back is a refusal, never evidence of persistence."
  [{:keys [client] :as options}
   ontology-source data-path data-source query-type parents]
  (let [limits (admitted! options true)]
    (when-not (and (string? ontology-source) (string? data-source))
      (refuse! :invalid-input {}))
    (let [source-bytes (+ (.-length (.encode (js/TextEncoder.) ontology-source))
                          (.-length (.encode (js/TextEncoder.) data-source)))]
      (when (> source-bytes (:max-total-bytes limits))
        (refuse! :resource-limit {:source-bytes source-bytes})))
    (when-not (and (vector? parents) (<= (count parents) 1))
      (refuse! :invalid-parents {}))
    (let [prior (if-let [parent (first parents)]
                  (fetch-history! options parent)
                  (js/Promise.resolve nil))]
      (-> prior
          (.then
           (fn [_]
             (let [{:keys [semantic evidence]}
                   (evidence/blocks ontology-source data-path data-source
                                    query-type parents)
                   blocks [semantic evidence]
                   total (reduce + (map #(.-length (:bytes %)) blocks))]
               (when (or (some #(> (.-length (:bytes %)) (:max-block-bytes limits)) blocks)
                         (> total (:max-total-bytes limits)))
                 (refuse! :resource-limit {:bytes total}))
               (-> (js/Promise.resolve
                    ((:put-block! client) (:cid semantic) (:bytes semantic)))
                   (.then (fn [returned]
                            (when-not (= returned (:cid semantic))
                              (refuse! :put-not-confirmed {:cid (:cid semantic)}))
                            ((:put-block! client) (:cid evidence) (:bytes evidence))))
                   (.then (fn [returned]
                            (when-not (= returned (:cid evidence))
                              (refuse! :put-not-confirmed {:cid (:cid evidence)}))
                            (fetch-history! options (:cid evidence))))))))))))
