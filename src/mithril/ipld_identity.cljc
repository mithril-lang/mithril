(ns mithril.ipld-identity
  "Identity per docs/language/spec/ipld-identity.md: semantic canonicalization,
  then the IPLD Data Model (§3), then DAG-CBOR bytes, then CIDv1 (dag-cbor 0x71,
  sha2-256 0x12). The DAG-CBOR codec, the CID assembly and the decoder are the
  vendored `ipld.core` / `multiformats.core`, the same code that
  `checkpoint_ipld` and `reason_ipld` use. Nothing here hashes printed text.

  Three entry points:

  - `term->ipld`: the one S-form term encoding (§3). Symbols are `{\"sym\" …}`,
    IRI atoms and keywords (after desugaring, sform-canonical.md §3.4) are
    `{\"iri\" …}`, sets and maps become sorted lists headed by `set` / `map`.
  - `definition-cid`: the code-tier Definition CID (§6.1) of one checked
    definition, after α-normalization of its local binders (§2.1).
  - `dataset-identity`: the data-tier pair (§5). `graph-digest` is the
    unchanged RDFC-1.0 SHA-256 digest; `dataset-cid` is the CIDv1 of the
    canonical `(dataset (quad …) …)` term, both from one RDFC-1.0 run."
  (:require [clojure.string :as str]
            [ipld.core :as ipld]
            [rdf-canon.core :as rdf-canon]
            [nquads.core :as nq]))

(defn- refuse! [code detail data]
  (throw (ex-info detail (merge {:mithril/error code :detail detail} data))))

;; ── §3 atoms ─────────────────────────────────────────────────────────────────

(def base-iri
  "The default base of an unprefixed keyword (sform-canonical.md §3.4)."
  "https://mithril.fund/ns/v1#")

(def builtin-prefixes
  "sform-canonical.md §3.4.1. A file MUST NOT redefine these."
  {"rdf" "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   "rdfs" "http://www.w3.org/2000/01/rdf-schema#"
   "xsd" "http://www.w3.org/2001/XMLSchema#"
   "owl" "http://www.w3.org/2002/07/owl#"
   "sh" "http://www.w3.org/ns/shacl#"
   "mith" "https://mithril.fund/ns/v1#"})

(defn absolute-iri?
  "An RFC 3987 absolute IRI at the level this layer can check without a full
  IRI parser: a scheme, a colon, and no whitespace or characters N-Quads and
  RFC 3987 exclude."
  [s]
  (and (string? s)
       (boolean (re-matches #"[A-Za-z][A-Za-z0-9+.\-]*:[^\s<>\"{}|\\^`]*" s))))

(defn sym
  "The §3 symbol atom."
  [name]
  {"sym" name})

(defn iri
  "The §3 IRI atom. The string MUST be an absolute IRI."
  [value]
  (when-not (absolute-iri? value)
    (refuse! :mithril.sform/not-absolute-iri "An IRI atom must hold an absolute IRI"
             {:iri value}))
  {"iri" value})

(defn- atom-map? [value]
  (and (map? value) (= 1 (count value))
       (or (string? (get value "sym")) (string? (get value "iri")))))

;; ── term order (sform-canonical.md §2.3) ─────────────────────────────────────

(defn encode
  "Canonical DAG-CBOR bytes of an IPLD node (vendored `ipld.core/encode`)."
  [node]
  (ipld/encode node))

(defn- unsigned-bytes [bytes] (mapv #(bit-and % 0xff) (seq bytes)))

(defn compare-encoded
  "§2.3: compare two IPLD nodes by their DAG-CBOR bytes, unsigned, lexicographic."
  [a b]
  (compare (unsigned-bytes (encode a)) (unsigned-bytes (encode b))))

(defn- sorted-dedup [nodes]
  ;; Sort by encoding, then drop byte-equal neighbours (the §2.3 definition of
  ;; a duplicate).
  (->> nodes
       (map (fn [node] [(unsigned-bytes (encode node)) node]))
       (sort-by first compare)
       (partition-by first)
       (mapv (comp second first))))

;; ── S-form term → IPLD Data Model (§3) ───────────────────────────────────────

(defn- safe-integer? [n]
  #?(:cljs (js/Number.isSafeInteger n)
     :clj (and (integer? n) (<= -9007199254740991 n 9007199254740991))))

(defn- bigint? [n]
  #?(:cljs (identical? js/BigInt (type n)) :clj false))

(defn- expand-keyword [kw {:keys [prefixes base]}]
  (doseq [p (keys prefixes)]
    (when (contains? builtin-prefixes p)
      (refuse! :mithril.sform/prefix-redefined "A file must not redefine a built-in prefix"
               {:prefix p})))
  (if-let [p (namespace kw)]
    (if-let [expansion (or (get builtin-prefixes p) (get prefixes p))]
      (iri (str expansion (name kw)))
      (refuse! :mithril.sform/unknown-prefix "Keyword prefix is neither declared nor built in"
               {:keyword (str kw)}))
    (iri (str (or base base-iri) (name kw)))))

(defn term->ipld
  "Encode one S-form term (host reader data: lists, symbols, strings, integers,
  booleans, nil, plus the sugar of sform-canonical.md §3) as an IPLD node, with
  exactly the §3 encoding.

  - symbol → `{\"sym\" name}`;
  - `(iri \"…\")` and every keyword → `{\"iri\" absolute-iri}`;
  - vector → `[{\"sym\" \"vec\"} e…]`, order kept;
  - set → `[{\"sym\" \"set\"} e…]`, sorted by encoding and deduplicated;
  - map → `[{\"sym\" \"map\"} [k v]…]`, pairs sorted by key encoding; a key that
    repeats after desugaring is refused (`:mithril.sform/duplicate-key`);
  - floats are refused: the IPLD float kind MUST NOT appear in v1 blocks.

  `opts` may carry `:prefixes` (declared prefix → expansion) and `:base`."
  ([term] (term->ipld term nil))
  ([term opts]
   (letfn [(enc [t]
             (cond
               (nil? t) nil
               (boolean? t) t
               (string? t) t
               (bigint? t) t
               (integer? t) (if (safe-integer? t)
                              t
                              (refuse! :mithril.ipld/int-out-of-host-range
                                       "Integer is outside the host codec's exact range"
                                       {:value (str t)}))
               (number? t) (refuse! :mithril.ipld/float
                                    "Floats are not v1 Mithril terms; use (f64-from-bits n)"
                                    {:value t})
               (symbol? t) (sym (str t))
               (keyword? t) (expand-keyword t opts)
               (map? t)
               (let [pairs (mapv (fn [[k v]] [(enc k) (enc v)]) t)
                     sorted (sort-by first compare-encoded pairs)]
                 (doseq [[[a _] [b _]] (partition 2 1 sorted)]
                   (when (zero? (compare-encoded a b))
                     (refuse! :mithril.sform/duplicate-key "Two map keys are equal after desugaring"
                              {:key a})))
                 (into [(sym "map")] (map vec) sorted))
               (set? t) (into [(sym "set")] (sorted-dedup (map enc t)))
               (vector? t) (into [(sym "vec")] (map enc) t)
               (seq? t)
               (if (= 'iri (first t))
                 (let [args (rest t)]
                   (when-not (and (= 1 (count args)) (string? (first args)))
                     (refuse! :mithril.sform/reserved-head
                              "iri takes exactly one string" {}))
                   (iri (first args)))
                 (mapv enc t))
               :else (refuse! :mithril.ipld/invalid-term "Value is not an S-form term"
                              {:value (pr-str t)})))]
     (enc term))))

(defn check-term!
  "Refuse a decoded term-encoded block that the §3 encoding could not have
  produced: any map other than a one-key `sym` / `iri` atom, any float, any
  bytes. Returns the node."
  [node]
  (letfn [(walk [n path]
            (cond
              (or (nil? n) (boolean? n) (string? n) (ipld/link? n)) nil
              (or (integer? n) (bigint? n)) nil
              (number? n) (refuse! :mithril.ipld/float "Float in a v1 Mithril block" {:path path})
              (map? n) (when-not (atom-map? n)
                         (refuse! :mithril.ipld/invalid-term
                                  "Only sym and iri atoms are maps in a term block" {:path path}))
              (sequential? n) (doseq [[i e] (map-indexed vector n)] (walk e (conj path i)))
              :else (refuse! :mithril.ipld/invalid-term "Non-term IPLD kind in a term block"
                             {:path path})))]
    (walk node [])
    (when-let [i (get node "iri")] (iri i))
    node))

(defn block
  "`{:cid \"bafyrei…\" :bytes …}` for an IPLD node: DAG-CBOR, CIDv1 dag-cbor
  sha2-256, via the vendored `ipld.core/node->block`."
  [node]
  (ipld/node->block node))

(defn cid
  "The CIDv1 string of an IPLD node."
  [node]
  (:cid (block node)))

;; ── code tier: checked IR → α-normalized definition node (§2.1, §6.1, §7) ───

(defn- type->ipld
  "§7: scalar types are their short names, function types are
  `{\"fn\" [[param…] return]}`. Sum types (not yet named by the spec) follow
  the same shape: `{\"sum\" [name [case…]]}`, cases in declared order because
  the checker compares sum types by that order."
  [t]
  (cond
    (keyword? t) (name t)
    (and (vector? t) (= :fn (first t)))
    (let [[params returns] (second t)]
      {"fn" [(mapv type->ipld params) (type->ipld returns)]})
    (and (vector? t) (= :sum (first t)))
    {"sum" [(nth t 1) (vec (nth t 2))]}
    :else (refuse! :mithril.ipld/invalid-ir "Unknown checked IR type" {:type (pr-str t)})))

(defn i64->ipld
  "An i64 literal (the checked IR keeps the canonical decimal string) as an
  IPLD int (§3; open point 1 chooses int over #180's decimal string). On
  :cljs a value outside ±(2^53 − 1) becomes a js/BigInt, which the vendored
  codec writes exactly (vendor/PROVENANCE.md, local modifications)."
  [decimal]
  (when-not (and (string? decimal) (re-matches #"(?:0|-?[1-9][0-9]{0,18})" decimal))
    (refuse! :mithril.ipld/invalid-ir "i64 literal is not a canonical decimal" {:value decimal}))
  #?(:cljs (let [n (js/BigInt decimal)]
             (when-not (= n (js/BigInt.asIntN 64 n))
               (refuse! :mithril.ipld/invalid-ir "i64 literal is outside signed bounds" {:value decimal}))
             (if (<= (js/BigInt (- js/Number.MAX_SAFE_INTEGER)) n (js/BigInt js/Number.MAX_SAFE_INTEGER))
               (js/Number n)
               n))
     :clj (Long/parseLong decimal)))

(defn- bind
  "Introduce one local binder: the next positional index in pre-order."
  [ctx binder-name]
  (let [index (:next ctx)]
    [(-> ctx (assoc-in [:env binder-name] index) (update :next inc)) index]))

(declare ^:private project)

(defn- project-all [ctx nodes]
  (reduce (fn [[c out] node]
            (let [[c' n] (project c node)] [c' (conj out n)]))
          [ctx []] nodes))

(defn- callee [ctx callee-name]
  ;; §6.2 step 3: a self-call is (self). A call to another definition will be
  ;; a link (§2.1 step 2) once callees are hashed first; until then it is the
  ;; callee's symbol atom.
  (if (= callee-name (:self ctx)) [(sym "self")] (sym callee-name)))

(defn- project
  "Returns `[ctx node]`. The context threads the pre-order binder counter
  through siblings, so the walk is the single source of binder indices."
  [ctx ir]
  (let [t (some-> (:type ir) type->ipld)]
    (case (:op ir)
      :literal
      [ctx {"op" "literal" "type" t
            "value" (if (= :i64 (:type ir)) (i64->ipld (:value ir)) (:value ir))}]
      :local
      (let [index (get-in ctx [:env (:name ir)])]
        (when-not (integer? index)
          (refuse! :mithril.ipld/invalid-ir "Local is not bound" {:name (:name ir)}))
        [ctx {"op" "local" "index" index "type" t}])
      :intrinsic
      (let [[ctx args] (project-all ctx (:args ir))]
        [ctx {"op" "intrinsic" "name" (:name ir) "type" t "args" args}])
      :call
      (let [[ctx args] (project-all ctx (:args ir))]
        [ctx {"op" "call" "callee" (callee ctx (:name ir)) "type" t "args" args}])
      :function-ref
      [ctx {"op" "function-ref" "callee" (callee ctx (:name ir)) "type" t}]
      :lambda
      (let [outer (:env ctx)
            ctx (reduce (fn [c p] (first (bind c (:name p)))) ctx (:params ir))
            [ctx body] (project ctx (:body ir))]
        [(assoc ctx :env outer)
         {"op" "lambda" "params" (mapv (fn [p] {"type" (type->ipld (:type p))}) (:params ir))
          "returns" (type->ipld (:returns ir)) "body" body}])
      :invoke
      (let [[ctx f] (project ctx (:function ir))
            [ctx args] (project-all ctx (:args ir))]
        [ctx {"op" "invoke" "function" f "function-type" (type->ipld (:function-type ir))
              "args" args "type" t}])
      :let
      (let [outer (:env ctx)
            [ctx bindings] (reduce (fn [[c out] b]
                                     ;; The binder comes into scope after its value.
                                     (let [[c v] (project c (:value b))
                                           [c _] (bind c (:name b))]
                                       [c (conj out {"value" v "type" (type->ipld (:type b))})]))
                                   [ctx []] (:bindings ir))
            [ctx body] (project ctx (:body ir))]
        [(assoc ctx :env outer) {"op" "let" "bindings" bindings "body" body "type" t}])
      :sequence
      (let [[ctx es] (project-all ctx (:expressions ir))]
        [ctx {"op" "sequence" "expressions" es "type" t}])
      :if
      (let [[ctx c] (project ctx (:condition ir))
            [ctx a] (project ctx (:then ir))
            [ctx b] (project ctx (:else ir))]
        [ctx {"op" "if" "condition" c "then" a "else" b "type" t}])
      :enum-case
      [ctx {"op" "enum-case" "sum" (type->ipld (:sum ir)) "case" (:case ir) "type" t}]
      :variant-match
      ;; Cases are a map from case name to body: sorted by the case's encoding
      ;; BEFORE the walk, so binder indices do not depend on source case order.
      (let [[ctx s] (project ctx (:scrutinee ir))
            cases (sort-by :case compare-encoded (:cases ir))
            [ctx cs] (reduce (fn [[c out] {case-name :case body :body}]
                               (let [[c b] (project c body)]
                                 [c (conj out {"case" case-name "body" b})]))
                             [ctx []] cases)
            [ctx d] (if-let [d (:default ir)] (project ctx d) [ctx nil])]
        [ctx {"op" "variant-match" "scrutinee" s "cases" cs "default" d "type" t}])
      (refuse! :mithril.ipld/invalid-ir "Unknown checked IR op" {:op (:op ir)}))))

(defn definition-node
  "The identity block of one checked definition (§6.1): an α-normalized
  `lambda` record. The definition's own name and every local name are absent
  (§2.1 step 3); parameters take indices 0…n-1, later binders continue the
  pre-order count; a reference to a local is `{\"op\" \"local\" \"index\" i}`."
  [declaration]
  (let [ctx {:env {} :next 0 :self (:name declaration)}
        ctx (reduce (fn [c p] (first (bind c (:name p)))) ctx (:params declaration))
        [_ body] (project ctx (:body declaration))]
    {"op" "lambda"
     "params" (mapv (fn [p] {"type" (type->ipld (:type p))}) (:params declaration))
     "returns" (type->ipld (:returns declaration))
     "body" body}))

(defn definition-cid
  "Definition CID (§6.1): CIDv1 dag-cbor sha2-256 of `definition-node`."
  [declaration]
  (cid (definition-node declaration)))

;; ── data tier: canonical (dataset (quad …)) term and the identity pair (§5) ──

(def ^:private xsd-string "http://www.w3.org/2001/XMLSchema#string")

(defn- rdf-term->ipld [{:keys [type value datatype language]}]
  (case type
    :iri (iri value)
    :blank [(sym "bnode") value]
    :literal [(sym "lit") value (if language
                                  [(sym "lang") language]
                                  (iri (or datatype xsd-string)))]
    (refuse! :mithril.ipld/invalid-term "Unknown RDF term type" {:type type})))

(defn- quad->ipld [{:keys [subject predicate object graph]}]
  [(sym "quad") (rdf-term->ipld subject) (rdf-term->ipld predicate)
   (rdf-term->ipld object) (if graph (rdf-term->ipld graph) (sym "default"))])

(defn dataset-identity
  "Run RDFC-1.0 once over `statements` (an RDF dataset as N-Quads statements)
  and return both data-tier identities (§5):

  - `:graph-digest` `\"sha256:\" ++ hex(SHA-256(canonical N-Quads))`, computed
    exactly as `rdf-canon/canonical-hash` computes it, so it never moves;
  - `:dataset-cid` the CIDv1 of `(dataset (quad s p o g)…)`, quads in canonical
    N-Quads line order, duplicates removed (rdf-owl-shacl-sform.md §2.2);
  - `:dataset` the IPLD node itself."
  [statements]
  (let [{canonical :statements} (rdf-canon/canonicalize-dataset (vec statements))
        lines (->> canonical
                   (map (fn [s] [(nq/serialize-statement s) s]))
                   (sort-by first rdf-canon/compare-code-points))
        digest (rdf-canon/sha256-hex (apply str (map first lines)))
        quads (->> lines (map (comp quad->ipld second)) distinct)
        node (into [(sym "dataset")] quads)]
    {:graph-digest (str "sha256:" digest)
     :dataset-cid (cid node)
     :dataset node}))

(defn cid?
  "True for a CIDv1 dag-cbor string."
  [value]
  (and (string? value) (str/starts-with? value "b")
       (try (= 0x71 (ipld/cid-codec value)) (catch #?(:cljs :default :clj Exception) _ false))))
