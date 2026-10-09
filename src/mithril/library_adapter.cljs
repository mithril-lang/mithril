(ns mithril.library-adapter
  "Offline common-ID import resolution; execution uses an explicit host transport."
  (:require [clojure.string :as str]
            [mithril.compiler :as compiler]
            [mithril.mission-native :as native]))
(defn transport [config] (fn [request] (native/invoke! config request)))
(defn- refuse! [message] (throw (ex-info message {:mithril/error :mithril.library/refused})))
(defn binding [descriptor source]
  (let [id (get descriptor "libraryId")
        iri (str "https://mithril.fund/lib/" id)
        artifact (compiler/compile-library-document (str id ".mith") source)]
    (when-not (and (string? id) (re-matches #"fund\.mithril\.lib\.[a-z0-9.]+" id)
                   (= id (get descriptor "pluginId")) (= 1 (get descriptor "rpcVersion"))
                   (= (str "https://github.com/mithril-lang/" id) (get descriptor "repository"))
                   (= iri (get descriptor "iri")) (= iri (get-in artifact [:library :id]))
                   (vector? (get descriptor "operations")) (seq (get descriptor "operations"))
                   (= (mapv #(str iri "/operation/" %) (get descriptor "operations"))
                      (mapv :symbol (get-in artifact [:library :exports])))
                   (every? #(= :handler (:kind %)) (get-in artifact [:library :exports])))
      (refuse! "common ID, repository, IRI or exported operations disagree"))
    {:descriptor descriptor :source source :artifact artifact}))
(defn resolve! [config id]
  (let [descriptor (native/invoke! config {"operation" "resolve-library" "libraryId" id})]
    (binding (dissoc descriptor "source") (get descriptor "source"))))
(defn resolve-imports [doc registry]
  (when-not (map? registry) (refuse! "explicit library registry is required"))
  (update doc "imports"
          (fn [imports]
            (when-not (vector? imports) (refuse! "imports must be a vector"))
            (mapv (fn [entry]
                    (let [id (get entry "library")]
                      (if (and (string? id) (str/starts-with? id "fund.mithril.lib."))
                        (let [b (get registry id) artifact (:artifact b)
                              verified (when b (binding (:descriptor b) (:source b)))]
                          (when-not (and (= #{"library" "digest"} (set (keys entry)))
                                         (= b verified) (= id (get-in b [:descriptor "libraryId"]))
                                         (= (get entry "digest") (:graph-digest artifact)))
                            (refuse! "common library ID is absent or graph digest mismatches"))
                          (assoc entry "library" (get-in artifact [:library :id])))
                        entry))) imports))))
(defn compile-web-text [path text registry]
  (let [doc (resolve-imports (compiler/parse-source text) registry)]
    (compiler/compile-web-document path doc (mapv :artifact (vals registry)))))
