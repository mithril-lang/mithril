(ns mithril.runtime.compiler-api
  "Pure entrypoints for bin/mithril-native-* CLIs (Item 224 §C.2).

  Boundary rule (verified against shadow-cljs 3.5.1 behavior, not guessed).
  See build notes in packages/runtime/README.md and bin/compiler/README.md.

  * Text args are plain strings.
  * `sources`/`programs`/`manifests` maps are {basename(string) -> text(string)}
    and MUST cross with plain js->clj (string keys). The checkers compare
    (set (keys sources)) against string basenames. Keywordizing these maps
    breaks every multi-file package check with
    :mithril.native-package/source \"Exact bounded source set required\".
  * Checked `runtime` maps cross the boundary and back. They use KEYWORD
    keys at the top level (:format, :name, :modules, :order, :exports) and
    heterogeneous keys deeper: module entries use keyword keys (:name,
    :checked, :exports…) while nested :document / :checked values use
    string keys (\"name\", \"@type\") from the JSON-LD Form model.
    cljs `clj->js` strips namespaces from keyword VALUES (\"checked-v1\")
    and turns every key into a string. To restore a map the declaration
    checkers can traverse with (get-in runtime [:modules n :checked …]),
    migrate-runtime keywordizes the top level and the :modules entries,
    keeps string keys everywhere else, and repairs :format.

  WARNING: do NOT \"simplify\" this to a blanket (:keywordize-keys true).
  That turns string keys inside :document into keywords and breaks
  (get doc \"name\") lookups. Version 3 of this file did that and the
  esm/package/declaration CLIs all REFUSED valid inputs."
  (:require [mithril.native-js :as native]
            [mithril.native-esm :as esm]
            [mithril.native-package :as package]
            [mithril.native-declarations :as declarations]
            [mithril.native-declaration-emit :as emit]
            [mithril.native-declaration-program :as program]
            [mithril.native-declaration-composition :as composition]
            [mithril.form :as form]
            [mithril.module :as module]
            [mithril.module-lower :as lower]
            [mithril.runtime.api :as api]))

(defn- error->js [error]
  (let [data (ex-data error)
        refused (js/Error. (or (.-message error) "compile-error"))]
    (set! (.-code refused) (name (or (:mithril/error data) :mithril/compile-error)))
    (set! (.-detail refused) (or (:detail data) (.-message error)))
    (set! (.-cause refused) error)
    refused))

(defn- bound
  "Run f with fixed args; errors become JS Error{code,detail}."
  [f & fixed]
  (try (apply f fixed)
       (catch :default error (throw (error->js error)))))

(def ^:private format-words
  {"checked-v1" :mithril.native-esm/checked-v1
   "checked-v2" :mithril.native-esm/checked-v2})

(defn- keywordize-top
  "Keywordize keys of a string-keyed map one level deep; nested values kept."
  [m]
  (if (map? m)
    (into {} (map (fn [[k v]] [(if (string? k) (keyword k) k) v]) m))
    m))

(defn- migrate-runtime
  "Restore a checked-runtime map after its JS round-trip.

  Structure (verified, not guessed): top-level and :modules ENTRY maps use
  KEYWORD keys (:format, :name, :modules, :checked…); :modules' KEYS are
  STRING module names (\"cordis.service\") — the checker looks them up with
  string `n` via (get-in runtime [:modules n]). Nested :document / :checked
  values use STRING keys (JSON-LD Form model, (get doc \"name\)).

  So: keywordize top level only; keywordize each :modules entry's keys;
  KEEP module-name keys as strings; keep all other nested maps string-keyed.
  :format is repaired to its namespaced keyword.

  Both package and ESM checkers accept :mithril.native-esm/checked-v1|v2,
  and the declaration checker accepts all three formats, so the ESM tag
  is safe for every consumer of this bundle."
  [m]
  (if (map? m)
    (let [top (keywordize-top m)
          modules (:modules top)
          modules (if (map? modules)
                    (into {} (map (fn [[k v]] [k (keywordize-top v)]) modules))
                    modules)
          f (:format top)]
      (cond-> (assoc top :modules modules)
        (and (string? f) (contains? format-words f))
        (assoc :format (get format-words f))))
    m))

;; --- native-js ---

(defn ^:export compileNativeJs [text]
  (clj->js (bound native/compile-text (str text))))

(defn ^:export checkNativeJs [text]
  (clj->js (bound native/check-text (str text))))

;; --- native-esm (sources: string keys, plain js->clj) ---

(defn ^:export compileNativeEsm [text sources]
  (clj->js (bound esm/compile-text (str text) (js->clj sources))))

(defn ^:export checkNativeEsm [text sources]
  (clj->js (bound esm/check-text (str text) (js->clj sources))))

(defn ^:export esmSourceBasenames [text]
  (clj->js (bound esm/source-basenames (str text))))

;; --- native-package (sources: string keys, plain js->clj) ---

(defn ^:export compileNativePackage [text sources]
  (clj->js (bound package/compile-library-text (str text) (js->clj sources))))

(defn ^:export checkNativePackage [text sources]
  (clj->js (bound package/check-text (str text) (js->clj sources))))

(defn ^:export packageSourceBasenames [text]
  (clj->js (bound package/source-basenames (str text))))

;; --- declarations ---

(defn ^:export compileNativeDeclarations [text checkedRuntime]
  (clj->js (bound emit/compile-text (str text)
                 (migrate-runtime (js->clj checkedRuntime)))))

(defn ^:export declarationsRuntimeBasename [text]
  (clj->js (bound declarations/runtime-basename (str text))))

(defn ^:export parseForm [text]
  (clj->js (bound form/parse (str text))))

;; --- declaration program ---

(defn ^:export compileDeclarationProgram [text sources runtime]
  (clj->js (bound program/compile-text (str text) (js->clj sources)
                 (migrate-runtime (js->clj runtime)))))

(defn ^:export readDeclarationPlan [text]
  (clj->js (bound program/read-plan (str text))))

;; --- declaration composition ---

(defn ^:export compileDeclarationComposition [text sources]
  (clj->js (bound composition/compile-text (str text) (js->clj sources))))

(defn ^:export readCompositionPlan [text]
  (clj->js (bound composition/read-plan (str text))))

(defn ^:export readCompositionSourcePlan [text programs manifests]
  (clj->js (bound composition/read-source-plan (str text) (js->clj programs) (js->clj manifests))))

;; --- guest module ---

(defn ^:export lowerNativeText [text]
  (clj->js (bound lower/lower-native-text (str text))))

(defn ^:export lowerText [text]
  (clj->js (bound lower/lower-text (str text))))

(defn ^:export checkModuleText [text]
  (clj->js (bound module/check-text (str text))))

(defn ^:export version [] api/version)
(defn ^:export sourceSha [] api/source-sha)
