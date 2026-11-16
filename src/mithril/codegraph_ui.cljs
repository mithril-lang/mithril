(ns mithril.codegraph-ui
  "Bounded standalone offline explorer export, using the admitted snapshot."
  (:require [clojure.string :as str]
            [mithril.codegraph :as graph]
            [mithril.codegraph-contract :as contract]
            [mithril.codegraph-communities :as communities]))

(defn payload [snapshot artifact]
  (graph/verify! snapshot artifact)
  (let [ir (:codegraph-ir artifact)
        ordered (sort-by (juxt #(get {:file 0 :document 1 :function 2 :section 3 :entity 4} (:kind %) 5)
                              :path :name :id) (:nodes snapshot))
        selected (vec (take (:max-ui-nodes ir) ordered))
        ids (set (map :id selected))
        edges (filter #(and (contains? ids (:source %)) (contains? ids (:target %))) (:edges snapshot))
        nodes (mapv #(merge % (graph/with-source snapshot % (min 1024 (:max-source-chars ir)))) selected)
        file-network (communities/file-network snapshot (:max-community-edges ir))
        projected (filter #(and (contains? ids (:source %)) (contains? ids (:target %))) (:edges file-network))
        diagnostics (mapcat (fn [[path entry]]
                              (map #(assoc % :path path) (:diagnostics entry))) (:files snapshot))]
    {:format "mithril.codegraph/explorer-v1" :project (:project snapshot)
     :snapshot-digest (:snapshot-digest snapshot) :graph-digest (:graph-digest snapshot)
     :contract-digest (:contract-digest snapshot)
     :nodes nodes :edges (vec (take (:max-ui-edges ir) edges))
     :file-edges (vec (take (:max-ui-edges ir) projected))
     :analysis (:community-analysis snapshot)
     :limits {:depth (:max-depth ir) :visited (:max-visited ir)}
     :counts {:files (count (:files snapshot)) :nodes (count (:nodes snapshot)) :edges (count (:edges snapshot))
              :documents (count (filter #(= :document (:kind %)) (:nodes snapshot)))
              :unresolved (count (:unresolved snapshot)) :diagnostics (count diagnostics)}
     :unresolved (vec (take (:max-results ir) (:unresolved snapshot)))
     :diagnostics (vec (take (:max-results ir) diagnostics))
     :truncated (or (> (count ordered) (count selected))
                    (> (count edges) (:max-ui-edges ir)) (> (count projected) (:max-ui-edges ir))
                    (:truncated file-network))}))

(defn- safe-json [value]
  (-> (.stringify js/JSON (clj->js value))
      (str/replace "<" "\\u003c") (str/replace ">" "\\u003e") (str/replace "&" "\\u0026")
      (str/replace "\u2028" "\\u2028") (str/replace "\u2029" "\\u2029")))
(defn- asset [filename]
  (.readFileSync (js/require "fs")
                 (.resolve (js/require "path") contract/package-root "resources/codegraph" filename) "utf8"))
(defn- csp-hash [text]
  (str "'sha256-" (.digest (.update (.createHash (js/require "crypto") "sha256") text "utf8") "base64") "'"))

(defn render [snapshot artifact]
  (let [data (safe-json (payload snapshot artifact)) css (asset "explorer.css") script (asset "explorer.js")
        substitutions {"__CSP__" (str "default-src 'none'; script-src " (csp-hash script)
                                      "; style-src " (csp-hash css) "; connect-src 'none'; base-uri 'none'; form-action 'none'")
                       "__STYLE__" css "__DATA__" data "__SCRIPT__" script}
        html (str/replace (asset "explorer.html") #"__(?:CSP|STYLE|DATA|SCRIPT)__"
                          #(get substitutions %))]
    (when (> (.byteLength (.-Buffer (js/require "buffer")) html "utf8")
             (get-in artifact [:codegraph-ir :max-ui-bytes]))
      (throw (ex-info "explorer exceeds admitted byte budget; reduce .mith UI node/edge budgets"
                      {:mithril/error :mithril.codegraph/ui-budget})))
    html))

(defn write! [root snapshot artifact]
  ;; sync! already admits the state directory. Recheck the output against
  ;; symlinks and use an exclusive temporary file before atomic replacement.
  (let [fs (js/require "fs") path (.join (js/require "path") root ".mithril-codegraph" "explorer.html")
        temp (str path "." (.randomUUID (js/require "crypto")) ".tmp")
        html (render snapshot artifact)]
    (when (or (.isSymbolicLink (.lstatSync fs (.dirname (js/require "path") path)))
              (not (.isDirectory (.statSync fs (.dirname (js/require "path") path)))))
      (throw (ex-info "explorer directory must be a local directory" {:mithril/error :mithril.codegraph/ui-path})))
    (when (and (.existsSync fs path) (.isSymbolicLink (.lstatSync fs path)))
      (throw (ex-info "explorer output must not be a symlink" {:mithril/error :mithril.codegraph/ui-path})))
    (try
      (.writeFileSync fs temp html #js {:flag "wx" :mode 384})
      (.renameSync fs temp path)
      {:path path :snapshot-digest (:snapshot-digest snapshot)
       :bytes (.byteLength (.-Buffer (js/require "buffer")) html "utf8")}
      (finally (when (.existsSync fs temp) (.unlinkSync fs temp))))))
