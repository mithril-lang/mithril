(ns mithril.runtime.system-one
  "Pure entrypoints for Fund system-one, ported from its former nbb glue
  (services/system-one/runtime/mithril-batch.cljk, mithril-security-batch.cljk
  and mithril-module.cljk). Same computations and the same JSON shapes; the
  callers keep stdin/stdout, sessions and process isolation themselves."
  (:require [mithril.compiler :as compiler]
            [mithril.native-js :as native]
            [mithril.reason :as reason]
            [mithril.shacl :as shacl]
            [oak.semantic :as oak]))

(defn safe-json
  "The batch glue's JSON projection: keywords become their name (namespace dropped)."
  [v]
  (cond (keyword? v) (name v)
        (map? v) (into {} (map (fn [[k x]] [(safe-json k) (safe-json x)]) v))
        (or (sequential? v) (set? v)) (mapv safe-json v)
        :else v))

(def timing-keys
  {:compile_seconds 0 :data_parse_seconds 0 :reason_seconds 0 :reason_engine_seconds 0
   :ontology_prepare_seconds 0 :ontology_decode_seconds 0 :entail_seconds 0
   :schema_seconds 0 :shacl_seconds 0
   :compile_calls 0 :reason_calls 0 :ontology_prepare_calls 0
   :entail_calls 0 :ontology_decode_hits 0 :ontology_decode_misses 0})

(defn- measured [times key f]
  (if times
    (let [start (.now js/performance)]
      (when-let [calls ({:compile_seconds :compile_calls :reason_seconds :reason_calls
                         :ontology_prepare_seconds :ontology_prepare_calls :entail_seconds :entail_calls} key)]
        (swap! times update calls inc))
      (try (f) (finally (swap! times update key + (/ (- (.now js/performance) start) 1000)))))
    (f)))

(defn- reason-stage [times active key f]
  ;; oak/entail is recursive; inner calls belong to their outer phase.
  (if @active (f)
      (do (reset! active key)
          (try (measured times key f) (finally (reset! active nil))))))

(defn- around
  "A replacement for `f` that runs each call through `(wrap thunk)`. Compiled
  callers dispatch on fixed arities (`cljs$core$IFn$_invoke$arity$N`), so the
  replacement declares them; a bare `(fn [& args])` only worked under nbb."
  [f wrap]
  (fn
    ([] (wrap #(f)))
    ([a] (wrap #(f a)))
    ([a b] (wrap #(f a b)))
    ([a b c] (wrap #(f a b c)))
    ([a b c d] (wrap #(f a b c d)))
    ([a b c d & more] (wrap #(apply f a b c d more)))))

(defn- traced-reason [artifact data times]
  (if times
    (let [active (atom nil) prepare reason/compile-ontology entail oak/entail
          schema reason/schema-closure validate shacl/validate decode compiler/ontology-quads]
      (with-redefs [compiler/ontology-quads (around decode #(measured times :ontology_decode_seconds %))
                    reason/compile-ontology (around prepare #(reason-stage times active :ontology_prepare_seconds %))
                    oak/entail (around entail #(reason-stage times active :entail_seconds %))
                    reason/schema-closure (around schema #(reason-stage times active :schema_seconds %))
                    shacl/validate (around validate #(reason-stage times active :shacl_seconds %))]
        (measured times :reason_engine_seconds #(reason/reason artifact data {}))))
    (reason/reason artifact data {})))

(defn- with-batch-quads [reuse? artifact times f]
  (if (or reuse? times)
    (let [decode compiler/ontology-quads empty-value (js-obj) cached (atom empty-value)]
      (with-redefs [compiler/ontology-quads
                    (fn [actual]
                      (if (and reuse? (identical? actual artifact)
                               (not (identical? @cached empty-value)))
                        (do (when times (swap! times update :ontology_decode_hits inc)) @cached)
                        (let [result (vec (decode actual))]
                          (when times (swap! times update :ontology_decode_misses inc))
                          (when (and reuse? (identical? actual artifact)) (reset! cached result))
                          result)))]
        (f)))
    (f)))

(defn execute-batches [batches reuse? times]
  (mapv
   (fn [{:keys [source cases]}]
     (let [artifact (measured times :compile_seconds
                              #(compiler/compile-ontology-text "candidate.mith" source))]
       {:graph-digest (:graph-digest artifact)
        :cases (with-batch-quads reuse? artifact times
                 (fn [] (mapv (fn [{:keys [id data]}]
                                (let [r (measured times :reason_seconds
                                                  #(let [parsed (measured times :data_parse_seconds (fn [] (reason/parse-data "state.nq" data)))]
                                                     (traced-reason artifact parsed times)))]
                                  {:id id :status (:status r) :types (:types r)
                                   :violations (:violations r) :counts (:counts r)
                                   :consistent (:consistent? r)})) cases)))}))
   batches))

(defn ^:export runBatch
  "runBatch({batches}, {timing, reuseOntologyQuads}) → {results} or, with timing,
  {results, timings}. Same values the --worker glue printed (safe-json projected)."
  [input opts]
  (let [{:keys [batches]} (js->clj input :keywordize-keys true)
        opts (js->clj (or opts #js {}) :keywordize-keys true)
        times (when (:timing opts) (atom timing-keys))
        results (execute-batches batches (boolean (:reuseOntologyQuads opts)) times)]
    (clj->js (safe-json (cond-> {:results results} times (assoc :timings @times))))))

(defn ^:export runSecurityBatch
  "runSecurityBatch({batches}) → [{compile-ms, graph-digest, cases, case-ms}], as the
  security glue printed."
  [input]
  (let [{:keys [batches]} (js->clj input :keywordize-keys true)]
    (clj->js
     (safe-json
      (mapv (fn [{:keys [source cases]}]
              (let [started (.now js/performance)
                    artifact (compiler/compile-ontology-text "candidate.mith" source)
                    compile-ms (- (.now js/performance) started)
                    times (atom [])]
                {:compile-ms compile-ms :graph-digest (:graph-digest artifact)
                 :cases (mapv (fn [{:keys [id data]}]
                                (let [began (.now js/performance)
                                      r (reason/reason artifact (reason/parse-data "state.nq" data) {})]
                                  (swap! times conj (- (.now js/performance) began))
                                  {:id id :status (:status r) :types (:types r)
                                   :violations (:violations r) :counts (:counts r)
                                   :consistent (:consistent? r)})) cases)
                 :case-ms @times}))
            batches)))))

(defn ^:export compileNative
  "compileNative(source) → the native-js artifact, :format as text without the colon."
  [source]
  (let [artifact (native/compile-text (str source))]
    (clj->js (assoc artifact :format (subs (str (:format artifact)) 1)))))
