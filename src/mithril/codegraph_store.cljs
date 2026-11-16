(ns mithril.codegraph-store
  "Immutable .mith premises/source evidence, and replayed OWL/SHACL results."
  (:require [clojure.string :as str]
            [mithril.codegraph :as graph]
            [mithril.codegraph-extract :as extract]
            [mithril.codegraph-contract :as contract]
            [mithril.compiler :as compiler]
            [mithril.rdf-form :as mith]
            [mithril.reason :as reason]
            [mithril.reason-rdf :as rdf]
            [nquads.core :as nq]))

(def fs (js/require "fs"))
(def path-api (js/require "path"))
(def base "https://mithril.fund/ns/codegraph-storage/v1#")
(def files ["asserted.mith" "sources.mith" "ontology.mith"])
(defn directory [root snapshot]
  (.join path-api root ".mithril-codegraph" "revisions" (subs (:snapshot-digest snapshot) 7)))
(defn- refuse! [reason]
  (throw (ex-info (str "Mithril archive refused: " (name reason))
                  {:mithril/error :mithril.codegraph-store/refused :reason reason})))
(defn- literal [value] {"@value" (str value)})
(defn- metadata [values]
  [{"@id" "urn:mithril:archive:metadata" "@graph"
    [(into {"@id" "urn:mithril:archive:revision"}
           (map (fn [[k v]] [(str base k) [(literal v)]])) values)]}])
(defn- metadata-values [text]
  (let [doc (mith/read text)]
    (when-not (and (vector? doc) (= 1 (count doc))
                  (= "urn:mithril:archive:metadata" (get-in doc [0 "@id"]))
                  (= 1 (count (get-in doc [0 "@graph"])))
                  (= "urn:mithril:archive:revision" (get-in doc [0 "@graph" 0 "@id"])))
      (refuse! :invalid-manifest))
    (into {} (for [[p objects] (dissoc (get-in doc [0 "@graph" 0]) "@id")]
               (do (when-not (and (str/starts-with? p base) (= 1 (count objects))
                                  (string? (get-in objects [0 "@value"]))) (refuse! :invalid-manifest))
                   [(subs p (count base)) (get-in objects [0 "@value"])])))))

(defn sources-document [snapshot]
  [{"@id" (extract/id :source-evidence [(:snapshot-digest snapshot)])
    "@graph" (mapv (fn [[p e]]
                     {"@id" (extract/id :source [(:project snapshot) p])
                      (str base "path") [(literal p)]
                      (str base "sourceDigest") [(literal (:source-digest e))]
                      (str base "sourceText") [(literal (:source e))]
                      (str base "parserProfile") [(literal (:parser-profile e))]}) (:files snapshot))}])

(defn- fixed-metadata [snapshot]
  {"format" "mithril.codegraph/archive-v1" "snapshotDigest" (:snapshot-digest snapshot)
   "graphDigest" (:graph-digest snapshot) "contractDigest" (:contract-digest snapshot)
   "ontologyDigest" (:ontology-digest snapshot) "bootstrapDigest" (:bootstrap-digest snapshot)
   "project" (:project snapshot)})

(defn- check-directory! [dir]
  ;; Reject every existing symlink component, including the revision parent.
  (loop [current (.resolve path-api dir)]
    (when (.existsSync fs current)
      (when (.isSymbolicLink (.lstatSync fs current)) (refuse! :symlink)))
    (when-not (= current (.dirname path-api current)) (recur (.dirname path-api current)))))
(defn- read-file! [dir filename maximum]
  (check-directory! dir)
  (let [file (.join path-api dir filename) stat (.lstatSync fs file)]
    (when-not (and (.isFile stat) (not (.isSymbolicLink stat))) (refuse! :not-archive-file))
    (when (> (.-size stat) maximum) (refuse! :archive-budget))
    (.decode (js/TextDecoder. "utf-8" #js {:fatal true}) (.readFileSync fs file))))
(defn check! [dir snapshot artifact expected-digest]
  (let [maximum (* 8 (get-in artifact [:codegraph-ir :max-total-bytes]))
        text (read-file! dir "manifest.mith" maximum)
        digest (extract/sha256 text)
        values (metadata-values text)]
    (when (and expected-digest (not= expected-digest digest)) (refuse! :manifest-digest))
    (when-not (= (fixed-metadata snapshot) (select-keys values (keys (fixed-metadata snapshot))))
      (refuse! :wrong-revision))
    (when-not (= (set (keys values)) (into (set (keys (fixed-metadata snapshot))) (map #(str % "Digest") files)))
      (refuse! :invalid-manifest))
    (doseq [filename files]
      (when-not (= (get values (str filename "Digest")) (extract/sha256 (read-file! dir filename maximum)))
        (refuse! :archive-digest)))
    {:directory dir :manifest-digest digest :snapshot-digest (:snapshot-digest snapshot)}))

(defn write! [dir snapshot artifact]
  (check-directory! dir)
  (if (.existsSync fs dir) (check! dir snapshot artifact nil)
      (let [parent (.dirname path-api dir) temp (str dir "." (.randomUUID (js/require "crypto")) ".tmp")
            ontology (.readFileSync fs (.resolve path-api contract/package-root contract/ontology-path) "utf8")
            payloads {"asserted.mith" (mith/write-quads
                                       (mapcat #(nq/parse (:rdf-canonical %)) (vals (:partitions snapshot)))
                                       [(extract/id :graph [(:project snapshot) (:contract-digest snapshot)])])
                      "sources.mith" (mith/write (sources-document snapshot)) "ontology.mith" ontology}
            values (merge (fixed-metadata snapshot) (into {} (map (fn [[p text]] [(str p "Digest") (extract/sha256 text)])) payloads))
            payloads (assoc payloads "manifest.mith" (mith/write (metadata values)))
            maximum (* 8 (get-in artifact [:codegraph-ir :max-total-bytes]))]
        (doseq [[_ text] payloads] (when (> (.byteLength js/Buffer text "utf8") maximum) (refuse! :archive-budget)))
        (.mkdirSync fs parent #js {:recursive true :mode 448})
        (.mkdirSync fs temp #js {:mode 448})
        (try
          (doseq [[p text] payloads]
            (let [file (.join path-api temp p)]
              (.writeFileSync fs file text #js {:flag "wx" :mode 384})
              (let [fd (.openSync fs file "r")] (try (.fsyncSync fs fd) (finally (.closeSync fs fd))))))
          (.renameSync fs temp dir)
          {:directory dir :manifest-digest (extract/sha256 (get payloads "manifest.mith"))
           :snapshot-digest (:snapshot-digest snapshot)}
          (finally (when (.existsSync fs temp) (.rmSync fs temp #js {:recursive true :force true})))))))

(defn- atomic-result! [dir filename text]
  (let [file (.join path-api dir filename) temp (str file "." (.randomUUID (js/require "crypto")) ".tmp")]
    (check-directory! dir)
    (when (and (.existsSync fs file) (.isSymbolicLink (.lstatSync fs file))) (refuse! :symlink))
    (try
      (.writeFileSync fs temp text #js {:flag "wx" :mode 384})
      (let [fd (.openSync fs temp "r")] (try (.fsyncSync fs fd) (finally (.closeSync fs fd))))
      (.renameSync fs temp file)
      (finally (when (.existsSync fs temp) (.unlinkSync fs temp))))
    file))

(defn reason! [dir snapshot artifact]
  (let [archive (check! dir snapshot artifact nil)
        maximum (* 8 (get-in artifact [:codegraph-ir :max-total-bytes]))
        text (read-file! dir "asserted.mith" maximum)
        quads (reason/parse-data "asserted.mith" text)
        data-digest (rdf/graph-digest (mith/read text))
        _ (when-not (= (:graph-digest snapshot) data-digest) (refuse! :premise-graph-digest))
        ontology (compiler/compile-ontology-text "ontology.mith" (read-file! dir "ontology.mith" maximum))
        _ (when-not (= (:ontology-digest artifact) (:graph-digest ontology)) (refuse! :ontology-digest))
        result (reason/reason ontology quads)
        output (mith/reason-document result (:graph-digest ontology) data-digest nil)
        form (mith/write output)
        _ (when (> (.byteLength js/Buffer form "utf8") maximum) (refuse! :reason-output-budget))
        path (atomic-result! dir "reasoned.mith" form)]
    (assoc archive :status (:status result) :counts (:counts result) :result result
           :reasoned-path path :reasoned-file-digest (extract/sha256 form)
           :reasoned-graph-digest (rdf/graph-digest output))))
