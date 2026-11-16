(ns mithril.rdf-form-fs
  "Private atomic output of an explicitly requested .mith reasoning result."
  (:require [clojure.string :as str]))

(defn write! [target text protected-inputs]
  (let [fs (js/require "fs") p (js/require "path")
        dir (.realpathSync fs (.dirname p (.resolve p target)))
        file (.join p dir (.basename p target))
        inputs (set (map #(.realpathSync fs %) protected-inputs))
        temp (str file "." (.randomUUID (js/require "crypto")) ".tmp")]
    (when-not (and (str/ends-with? file ".mith") (not (contains? inputs file)))
      (throw (ex-info "output must be a separate .mith file" {:mithril/error :mithril.rdf-form/invalid-output})))
    (when (and (.existsSync fs file) (.isSymbolicLink (.lstatSync fs file)))
      (throw (ex-info "output symlink refused" {:mithril/error :mithril.rdf-form/output-symlink})))
    (try
      (.writeFileSync fs temp text #js {:flag "wx" :mode 384})
      (let [fd (.openSync fs temp "r")] (try (.fsyncSync fs fd) (finally (.closeSync fs fd))))
      (.renameSync fs temp file)
      (finally (when (.existsSync fs temp) (.unlinkSync fs temp))))
    file))
