(ns mithril.codegraph-fs
  "Explicit local Git-manifest adapter. Source is never evaluated or sent."
  (:require [cljs.reader :as reader]
            [clojure.string :as str]
            [mithril.compiler :as compiler]
            [mithril.codegraph-extract :as extract]
            [mithril.codegraph :as graph]
            [mithril.codegraph-contract :as contract]
            [mithril.codegraph-store :as store]))

(def fs (js/require "fs"))
(def path-api (js/require "path"))
(def child-process (js/require "child_process"))
(def state-directory ".mithril-codegraph")

(defn- refuse! [reason]
  (throw (ex-info (str "codegraph filesystem refused: " (name reason))
                  {:mithril/error :mithril.codegraph-fs/refused :reason reason})))

(defn root! [root]
  (let [root (.realpathSync fs root)
        git-root (str/trim (.execFileSync child-process "git"
                                         #js ["-C" root "rev-parse" "--show-toplevel"]
                                         #js {:encoding "utf8"}))]
    (when-not (= root (.realpathSync fs git-root)) (refuse! :not-repository-root))
    root))

(defn- local-path! [root relative]
  (loop [parts (str/split relative #"/") current root]
    (if-let [part (first parts)]
      (let [next-path (.join path-api current part)]
        (when (and (.existsSync fs next-path) (.isSymbolicLink (.lstatSync fs next-path)))
          (refuse! :symlink))
        (recur (next parts) next-path))
      current)))

(defn- state-path! [root filename]
  (let [dir (local-path! root state-directory)]
    (.mkdirSync fs dir #js {:recursive true :mode 448})
    (local-path! root (str state-directory "/" filename))))

(defn- stored-text [snapshot maximum archive-digest]
  ;; Canonical RDF partitions repeat long IRIs; compress the private EDN payload
  ;; without changing snapshot identity or requiring a new runtime dependency.
  (let [text (pr-str {:storage-format "mithril.codegraph/mith-cache-v1"
                      :archive-digest archive-digest :snapshot snapshot})]
    (when (> (.byteLength js/Buffer text "utf8") maximum) (refuse! :index-budget))
    (if (< (.byteLength js/Buffer text "utf8") 1048576) text
        (pr-str {:storage-format "mithril.codegraph/gzip-edn-v1"
                 :payload (.toString (.gzipSync (js/require "zlib") (.from js/Buffer text "utf8")) "base64")}))))

(defn- stored-index [text maximum]
  (let [value (reader/read-string text)]
    (if (= "mithril.codegraph/gzip-edn-v1" (:storage-format value))
      (do (when-not (and (= #{:storage-format :payload} (set (keys value))) (string? (:payload value)))
            (refuse! :invalid-storage))
          (let [bytes (.gunzipSync (js/require "zlib") (.from js/Buffer (:payload value) "base64")
                                   #js {:maxOutputLength maximum})]
            (reader/read-string (.decode (js/TextDecoder. "utf-8" #js {:fatal true}) bytes))))
      value)))

(defn read-index! [root artifact]
  (let [root (root! root) file (state-path! root "index.edn")]
    (when (.existsSync fs file)
      (when (> (.-size (.statSync fs file))
               (* 8 (get-in artifact [:codegraph-ir :max-total-bytes])))
        (refuse! :index-budget))
      (let [cache (stored-index (.readFileSync fs file "utf8")
                                (* 8 (get-in artifact [:codegraph-ir :max-total-bytes])))
            _ (when-not (and (= "mithril.codegraph/mith-cache-v1" (:storage-format cache))
                             (= #{:storage-format :archive-digest :snapshot} (set (keys cache)))
                             (string? (:archive-digest cache))) (refuse! :mith-rebuild-required))
            index (graph/verify! (:snapshot cache) artifact)]
        (when-not (= root (:project index)) (refuse! :wrong-project))
        (store/check! (store/directory root index) index artifact (:archive-digest cache))
        index))))

(defn- manifest! [root artifact]
  (let [ir (:codegraph-ir artifact)
        result (.execFileSync child-process "git"
                              #js ["-C" root "ls-files" "--cached" "--others"
                                   "--exclude-standard" "--deduplicate" "-z"]
                              #js {:encoding "utf8" :maxBuffer 8388608})
        paths (->> (str/split result #"\u0000")
                   (remove str/blank?) distinct sort
                   (remove #(str/starts-with? % (str state-directory "/")))
                   (filter #(contains? (set (:extensions ir)) (compiler/extension %))))]
    (when (> (count paths) (:max-files ir)) (refuse! :manifest-budget))
    (loop [paths (seq paths) sources (sorted-map) total 0]
      (if-let [path (first paths)]
        (let [file (local-path! root path)]
          (if-not (.existsSync fs file)
            (recur (next paths) sources total)
            (let [stat (.lstatSync fs file) size (.-size stat)]
              (when-not (.isFile stat) (refuse! :not-source-file))
              (when (or (> size (:max-file-bytes ir))
                         (> (+ total size) (:max-total-bytes ir)))
                (refuse! :source-budget))
              (let [bytes (.readFileSync fs file)
                    ;; Fatal decoder prevents corrupt bytes from being silently
                    ;; normalized into a different source by Buffer.toString.
                    text (.decode (js/TextDecoder. "utf-8" #js {:fatal true}) bytes)]
                (recur (next paths) (assoc sources path text) (+ total size))))))
        sources))))

(defn sync!
  ([root artifact] (sync! root artifact {}))
  ([root artifact {:keys [rebuild?]}]
  (let [root (root! root) lock (state-path! root "index.lock")
        ;; No automatic stale-lock deletion: another writer may own it.
        fd (.openSync fs lock "wx" 384)]
    (try
      (let [previous (when-not rebuild? (read-index! root artifact))
            result (graph/sync-index previous (manifest! root artifact) artifact root)
            archive (store/write! (store/directory root (:snapshot result)) (:snapshot result) artifact)
            file (state-path! root "index.edn")
            temp (state-path! root (str "index." (.randomUUID (js/require "crypto")) ".tmp"))]
        (try
          (.writeFileSync fs temp (stored-text (:snapshot result) (* 8 (get-in artifact [:codegraph-ir :max-total-bytes])) (:manifest-digest archive)) #js {:flag "wx" :mode 384})
          (let [tmp-fd (.openSync fs temp "r")]
            (try (.fsyncSync fs tmp-fd) (finally (.closeSync fs tmp-fd))))
          (.renameSync fs temp file)
          (finally (when (.existsSync fs temp) (.unlinkSync fs temp))))
        (assoc result :archive archive :receipt (assoc (:receipt result) :mith-directory (:directory archive))))
      (finally (.closeSync fs fd) (.unlinkSync fs lock))))))

(defn query! [root artifact request]
  (graph/dispatch (:snapshot (sync! root artifact)) artifact request))

(defn freshness!
  ([root artifact] (freshness! root artifact nil))
  ([root artifact revision]
  (let [root (root! root) index (read-index! root artifact)
        sources (manifest! root artifact)]
    (and index (or (nil? revision) (= revision (:snapshot-digest index)))
         (= (into {} (map (fn [[p text]] [p (extract/source-digest text)]) sources))
            (into {} (map (fn [[p entry]] [p (:source-digest entry)]) (:files index))))))))
