(ns mithril.ipld-identity-test
  "ipld-identity.md: the §3 term encoding, the §6.1 Definition CID and the §5
  data-tier pair, checked against the vendored DAG-CBOR codec and corpus."
  (:require [cljs.test :refer [deftest is testing]]
            [cljs.reader :as reader]
            [clojure.string :as str]
            [ipld.core :as ipld]
            [multiformats.core :as mf]
            [nquads.core :as nq]
            [rdf-canon.core :as rdf-canon]
            [mithril.compiler :as compiler]
            [mithril.ipld-identity :as id]
            [mithril.module :as module]))

(defn- read-text [path] (.readFileSync (js/require "fs") path "utf8"))
(defn- bytes [node] (mapv #(bit-and % 0xff) (seq (ipld/encode node))))
(defn- code [f]
  (try (f) nil (catch :default e (:mithril/error (ex-data e)))))

(def corpus (reader/read-string (read-text "vendor/resources/ipld/dag-cbor-corpus.edn")))

;; ── §3: one encoding for symbols, IRIs, keywords, sets and maps ─────────────

(deftest term-encoding-is-the-section-3-table
  (is (= {"sym" "filter"} (id/term->ipld 'filter)))
  (is (= {"sym" "mithril/function"} (id/term->ipld 'mithril/function)))
  (testing "keywords desugar to IRI atoms (sform-canonical.md §3.4)"
    (is (= {"iri" "https://mithril.fund/ns/v1#a"} (id/term->ipld :a)))
    (is (= {"iri" "http://www.w3.org/2001/XMLSchema#integer"} (id/term->ipld :xsd/integer)))
    (is (= (id/term->ipld :xsd/integer)
           (id/term->ipld '(iri "http://www.w3.org/2001/XMLSchema#integer"))))
    (is (= {"iri" "https://ex.org/v#x"} (id/term->ipld :ex/x {:prefixes {"ex" "https://ex.org/v#"}})))
    (is (= {"iri" "https://ex.org/base/x"} (id/term->ipld :x {:base "https://ex.org/base/"}))))
  (testing "sform-canonical.md §4 examples"
    (is (= [{"sym" "set"} 1 2 3] (id/term->ipld (set [3 1 2]))))
    (is (= [{"sym" "map"} [{"iri" "https://mithril.fund/ns/v1#a"} 1] [{"iri" "https://mithril.fund/ns/v1#b"} 2]]
           (id/term->ipld {:b 2 :a 1})))
    (is (= [{"sym" "vec"} {"iri" "http://www.w3.org/2001/XMLSchema#string"} "x"]
           (id/term->ipld [:xsd/string "x"]))))
  (testing "sets are sorted by encoding and deduplicated after desugaring"
    (is (= [{"sym" "set"} "zz" "aaa"] (id/term->ipld #{"aaa" "zz"})) "shorter string sorts first")
    (is (= [{"sym" "set"} {"iri" "https://mithril.fund/ns/v1#a"}]
           (id/term->ipld #{:a :mith/a})) ":a and :mith/a are one IRI"))
  (testing "lists, strings, ints, booleans and nil map to themselves"
    (is (= [{"sym" "f"} "s" -5 true false nil] (id/term->ipld '(f "s" -5 true false nil)))))
  (testing "refusals by name"
    (is (= :mithril.sform/duplicate-key (code #(id/term->ipld {:a 1 :mith/a 2}))))
    (is (= :mithril.sform/unknown-prefix (code #(id/term->ipld :nope/x))))
    (is (= :mithril.sform/prefix-redefined (code #(id/term->ipld :a {:prefixes {"xsd" "https://x/"}}))))
    (is (= :mithril.sform/not-absolute-iri (code #(id/term->ipld '(iri "relative")))))
    (is (= :mithril.sform/reserved-head (code #(id/term->ipld '(iri "https://a" "https://b")))))
    (is (= :mithril.ipld/float (code #(id/term->ipld 1.5))))))

(deftest term-blocks-admit-only-atom-maps
  (let [node (id/term->ipld '(f :a #{1 2} {:k "v"}))
        decoded (ipld/decode (ipld/encode node))]
    (is (= node (id/check-term! decoded)))
    (is (= :mithril.ipld/invalid-term (code #(id/check-term! [{"op" "x"}]))))
    (is (= :mithril.ipld/invalid-term (code #(id/check-term! {"sym" "a" "iri" "https://a"}))))
    (is (= :mithril.ipld/float (code #(id/check-term! [1.5]))))))

;; ── DAG-CBOR bytes against the vendored corpus ───────────────────────────────

(deftest term-bytes-match-the-dag-cbor-corpus
  (let [rows (into {} (map (juxt :name identity)) (:canonical corpus))]
    (testing "every term-reachable corpus kind encodes to the corpus bytes"
      (doseq [k [:null :false :true :int-0 :int-1 :int-23 :int-24 :int-neg
                 :string-empty :string :list-empty :list]]
        (let [{:keys [node] expected :bytes} (get rows k)]
          (is (= expected (bytes (id/term->ipld (if (vector? node) (apply list node) node)))) (str k)))))
    (testing "atoms are one-key maps; map rows fix the key order the records use"
      (is (= (:bytes (get rows :map)) (bytes {"a" 1})))
      (is (= (:bytes (get rows :map-key-order)) (bytes {"b" 1 "aa" 2})))
      ;; {"sym": "a"}: a1, text(3) "sym", text(1) "a"
      (is (= [0xa1 0x63 0x73 0x79 0x6d 0x61 0x61] (bytes (id/term->ipld 'a))))
      ;; {"iri": "a:b"}
      (is (= [0xa1 0x63 0x69 0x72 0x69 0x63 0x61 0x3a 0x62] (bytes (id/term->ipld '(iri "a:b"))))))
    (testing "the link row: a link in a block is tag 42"
      (let [{:keys [link-node] expected :bytes} (get rows :link)]
        (is (= expected (bytes (ipld/link link-node))))))
    (testing "the float row exists in the corpus but is refused in Mithril terms"
      (is (some? (get rows :float)))
      (is (= :mithril.ipld/float (code #(id/check-term! (ipld/decode (js/Uint8Array.from (clj->js (:bytes (get rows :float))))))))))
    (testing "every invalid corpus row is refused by the decoder the CIDs rely on"
      (doseq [{:keys [name] invalid :bytes} (:invalid corpus)]
        (is (thrown? :default (ipld/decode (js/Uint8Array.from (clj->js invalid)))) (str name))))))

(deftest i64-boundaries-encode-exactly
  (testing "beyond 2^53 the IPLD int is exact (BigInt on this host), shortest form below it"
    (is (= [0x1b 0x7f 0xff 0xff 0xff 0xff 0xff 0xff 0xff] (bytes (id/i64->ipld "9223372036854775807"))))
    (is (= [0x3b 0x7f 0xff 0xff 0xff 0xff 0xff 0xff 0xff] (bytes (id/i64->ipld "-9223372036854775808"))))
    (is (= [0x1b 0x00 0x20 0x00 0x00 0x00 0x00 0x00 0x00] (bytes (id/i64->ipld "9007199254740992"))))
    (is (= [0x01] (bytes (id/i64->ipld "1")))))
  (testing "decode returns the exact value and re-encodes to the same bytes"
    (doseq [d ["9223372036854775807" "-9223372036854775808" "9007199254740993" "-9007199254740993"]]
      (let [b (ipld/encode (id/i64->ipld d))]
        (is (= d (str (ipld/decode b))))
        (is (= (vec b) (vec (ipld/encode (ipld/decode b))))))))
  (testing "out-of-range and non-canonical decimals are refused"
    (is (= :mithril.ipld/invalid-ir (code #(id/i64->ipld "9223372036854775808"))))
    (is (= :mithril.ipld/invalid-ir (code #(id/i64->ipld "01"))))))

;; ── §6.1 Definition CID ─────────────────────────────────────────────────────

(defn- module-text [functions]
  (str "(mithril/module :name \"example\" :exports [\"main\"] :functions [" functions "])"))
(defn- cids [text] (mapv :cid (:definition-cids (module/check-text text))))
(defn- cid-of [text] (first (cids text)))

(deftest definition-cid-is-a-cidv1-dag-cbor-sha2-256
  (let [checked (module/check-text (module-text "(mithril/function :name \"main\" :params [] :returns \"i64\" :body (mithril/literal :datatype \"i64\" :value 1))"))
        {:keys [name cid]} (first (:definition-cids checked))
        node (id/definition-node (first (:functions checked)))
        {block-cid :cid block-bytes :bytes} (id/block node)
        parts (mf/cid->parts cid)]
    (is (= "main" name))
    (is (str/starts-with? cid "bafyrei"))
    (is (= 1 (:version parts)))
    (is (= mf/codec-dag-cbor (:codec parts)))
    (is (= block-cid cid))
    (is (= (mf/cidv1-dag-cbor block-bytes) cid) "CID = CIDv1(0x71, sha2-256(bytes))")
    (is (= (vec (mf/multihash-sha256 block-bytes)) (vec (mf/cid->multihash cid))))
    (testing "the block round-trips through the vendored verifying decoder"
      (let [store {cid block-bytes}
            decoded (ipld/get-node store cid)]
        (is (= node decoded))
        (is (= cid (id/cid decoded)))))
    (testing "the identity block names neither the definition nor its locals"
      (is (= {"op" "lambda" "params" [] "returns" "i64"
              "body" {"op" "literal" "type" "i64" "value" 1}}
             node)))))

(def add-one-x "(mithril/function :name \"main\" :params [(rdf/node :name \"x\" :datatype \"i64\")] :returns \"i64\" :body (mithril/call :name \"add\" :args [(mithril/local :name \"x\") (mithril/literal :datatype \"i64\" :value 1)]))")

(deftest definition-cid-is-stable-under-key-order-and-alpha-renaming
  (let [base (cid-of (module-text add-one-x))]
    (testing "ipld-identity.md §9.1: (fn [x] (add x 1)) and (fn [y] (add y 1))"
      (is (= base (cid-of (module-text (str/replace add-one-x "\"x\"" "\"y\""))))))
    (testing "source field order and whitespace"
      (is (= base (cid-of (module-text "(mithril/function   :returns \"i64\" :body (mithril/call :args [(mithril/local :name \"x\") (mithril/literal :value 1 :datatype \"i64\")] :name \"add\") :params [(rdf/node :datatype \"i64\" :name \"x\")] :name \"main\")")))))
    (testing "host map key order of the checked IR"
      (let [decl (first (:functions (module/check-text (module-text add-one-x))))
            reordered (into (array-map) (reverse (seq decl)))]
        (is (= base (id/definition-cid decl) (id/definition-cid reordered)))))
    (testing "the definition's own name is not identity (§6.3)"
      (is (= base (cid-of (str/replace (module-text add-one-x) "\"main\"" "\"other\"")))))
    (testing "a different literal, type or operation is a different CID"
      (is (not= base (cid-of (module-text (str/replace add-one-x ":value 1" ":value 2")))))
      (is (not= base (cid-of (module-text (str/replace add-one-x "\"add\"" "\"sub\"")))))))
  (testing "let and lambda binders, including shadowing"
    (let [let-fn (fn [a b] (module-text (str "(mithril/function :name \"main\" :params [(rdf/node :name \"" a "\" :datatype \"i64\")] :returns \"i64\" :body (mithril/let :bindings [(rdf/node :name \"" b "\" :value (mithril/call :name \"add\" :args [(mithril/local :name \"" a "\") (mithril/literal :datatype \"i64\" :value 1)]))] :body (mithril/call :name \"mul\" :args [(mithril/local :name \"" b "\") (mithril/local :name \"" a "\")])))")))]
      (is (= (cid-of (let-fn "x" "y")) (cid-of (let-fn "p" "q"))))
      (is (not= (cid-of (let-fn "x" "y")) (cid-of (let-fn "x" "x")))
          "shadowing x changes which binder the body's second x refers to"))))

(deftest definition-cid-self-recursion-and-callees
  (let [rec (fn [n] (module-text (str "(mithril/function :name \"" n "\" :params [(rdf/node :name \"k\" :datatype \"i64\")] :returns \"i64\" :body (mithril/call :name \"" n "\" :args [(mithril/local :name \"k\")]))")))
        node (id/definition-node (first (:functions (module/check-text (rec "main")))))]
    (is (= [{"sym" "self"}] (get-in node ["body" "callee"])) "§6.2 step 3: a self-call is (self)")
    (is (= (cid-of (rec "main")) (cid-of (str/replace (rec "loop") "[\"main\"]" "[\"loop\"]")))
        "renaming a self-recursive definition keeps its CID")))

(def outcome {"@type" "SumType" "name" "Outcome" "cases" ["ok" "err"]})
(defn- doc-cid [body]
  (-> (module/check-document
        {"@context" "https://mithril.fund/context/module/v1" "@type" "Module" "name" "example"
         "functions" [{"@type" "Function" "name" "main" "params" [] "returns" "i64" "body" body}]
         "exports" ["main"]})
      :definition-cids first :cid))

(deftest definition-cid-match-cases-are-a-map
  (let [match (fn [cases] {"@type" "VariantMatch"
                           "scrutinee" {"@type" "EnumCase" "sum" outcome "case" "ok"}
                           "cases" cases})
        lam (fn [p] {"@type" "Invoke"
                     "function" {"@type" "Lambda" "params" [{"name" p "datatype" "i64"}] "returns" "i64"
                                 "body" {"@type" "Local" "name" p}}
                     "args" [{"@type" "Literal" "datatype" "i64" "value" 1}]})
        ok {"case" "ok" "body" (lam "a")}
        err {"case" "err" "body" (lam "b")}]
    (is (= (doc-cid (match [ok err])) (doc-cid (match [err ok])))
        "case order is not identity, and binder indices follow the sorted order")
    (is (not= (doc-cid (match [ok err]))
              (doc-cid (match [ok (assoc-in err ["body" "args" 0 "value"] 2)]))))))

(deftest definition-cid-i64-boundaries
  (let [lit (fn [v] (module-text (str "(mithril/function :name \"main\" :params [] :returns \"i64\" :body (mithril/literal :datatype \"i64\" :value \"" v "\"))")))
        hi (cid-of (lit "9223372036854775807"))
        lo (cid-of (lit "-9223372036854775808"))]
    (is (id/cid? hi))
    (is (not= hi lo))
    (is (= hi (cid-of (lit "9223372036854775807"))))))

;; ── §5 data tier: dataset CID next to the unchanged graph-digest ────────────

(deftest dataset-cid-sits-next-to-an-unchanged-graph-digest
  (let [baseline (reader/read-string (read-text "test/fixtures/digest-baseline.edn"))]
    (is (= 36 (count baseline)))
    (doseq [[path digest] baseline]
      (let [{:keys [graph-digest dataset-cid]} (compiler/graph-identity (compiler/parse-source (read-text path)))]
        (is (= digest graph-digest) path)
        (is (id/cid? dataset-cid) path)))))

(def alice
  (str "_:b0 <http://xmlns.com/foaf/0.1/age> \"42\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n"
       "<https://ex.org/alice> <http://xmlns.com/foaf/0.1/name> \"Alice\"@en .\n"
       "<https://ex.org/alice> <http://xmlns.com/foaf/0.1/knows> _:b0 .\n"))

(deftest dataset-term-is-the-canonical-quad-list
  (let [{:keys [graph-digest dataset-cid dataset]} (id/dataset-identity (nq/parse alice))
        swapped (str/join "\n" (reverse (str/split-lines (str/replace alice "_:b0" "_:other"))))]
    (testing "rdf-owl-shacl-sform.md §2.3 example: RDFC-1.0 labels, N-Quads line order"
      (is (= [{"sym" "dataset"}
              [{"sym" "quad"} {"iri" "https://ex.org/alice"} {"iri" "http://xmlns.com/foaf/0.1/knows"}
               [{"sym" "bnode"} "c14n0"] {"sym" "default"}]
              [{"sym" "quad"} {"iri" "https://ex.org/alice"} {"iri" "http://xmlns.com/foaf/0.1/name"}
               [{"sym" "lit"} "Alice" [{"sym" "lang"} "en"]] {"sym" "default"}]
              [{"sym" "quad"} [{"sym" "bnode"} "c14n0"] {"iri" "http://xmlns.com/foaf/0.1/age"}
               [{"sym" "lit"} "42" {"iri" "http://www.w3.org/2001/XMLSchema#integer"}] {"sym" "default"}]]
             dataset)))
    (is (= graph-digest (str "sha256:" (rdf-canon/canonical-hash alice))))
    (testing "blank node labels and quad order do not move either identity"
      (let [other (id/dataset-identity (nq/parse (str swapped "\n")))]
        (is (= graph-digest (:graph-digest other)))
        (is (= dataset-cid (:dataset-cid other)))))
    (testing "the dataset block round-trips and is a valid term block"
      (let [{:keys [cid bytes]} (id/block dataset)]
        (is (= dataset-cid cid))
        (is (= dataset (id/check-term! (ipld/get-node {cid bytes} cid))))))
    (testing "a different dataset is a different CID"
      (is (not= dataset-cid (:dataset-cid (id/dataset-identity (nq/parse (str/replace alice "42" "43")))))))))
