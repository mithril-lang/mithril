# Native declaration AST admission contract

Root `mithril/native-js-declarations` parses to exact string keys `@context`, `@type`, `name`, `runtime-source`, `ambient-types`, `ambient-values`, `declarations`; context `https://mithril.fund/context/native-js-declarations/v1`, type `NativeJsDeclarations`. `rdf/node` supplies nested data. The AST data field is **datatype**, because Form's `:type` means `@type`. Every node has exact fields; raw JavaScript/TypeScript, unknown operations and extra fields are refused.

Compiler public APIs: `parse-text(text)` (source budget then Form parse), `runtime-basename(text)` (bounded local read plan), `check-document(doc,checked-runtime)`, `check-text(text,checked-runtime)`. Runtime is a real `mithril.native-package/check-text` record with format `:mithril.native-package/checked-v1`, `:name`, `:exports` entries `{:name name :module module}`. Declaration name must match. Runtime source is local `[A-Za-z0-9][A-Za-z0-9_-]*\.mith`, no path/URI.

Checked return: `{:format :mithril.native-declarations/checked-v1 :name string :runtime-source string :declarations original-admitted-vector :exports vector-of-public-runtime-names :type-exports vector-of-public-alias/interface-names}`. Preserve declaration order. Overloads collapse in export names. Public runtime names must match the real runtime exactly; for CosmoKit 40 values, 11 public type bindings, 2 dual type/value names (49 unique public names). Type-only private Letter does not create a runtime value; Binary and Time namespaces do.

Declarations:
- `kind=function`: name,exported,type-params,params,returns.
- `kind=const`: name,exported,datatype.
- `kind=alias`: name,exported,type-params,datatype.
- `kind=interface`: name,exported,type-params,members.
- `kind=namespace`: name,exported,declarations.
- `kind=export-alias`: name,target, top level only, target must exist.

Generic entries exact name,constraint,default (nullable). Constraints see all generic names, defaults only earlier names. Required generic cannot follow a default. Type parameter binding cannot be a primitive keyword. Parameters exact name,optional,rest,datatype; booleans, unique names, rest final/nonoptional, required cannot follow optional unless rest. Function/method return predicates refine only own parameters. Methods retain method shape.

Members: kind=property,name,optional,readonly,datatype; or kind=method,name,optional,type-params,params,returns. Name is bounded literal text, escaped by emitter. No duplicate members. Declaration identifiers use `[A-Za-z_][A-Za-z0-9_]*`, JS reserved bindings forbidden; contextual type keywords such as `object` remain valid **value parameter** names. Qualified names are dot-separated identifiers. Register declarations before checking bodies for forward/recursive type references. Reject duplicate symbols except consistent-visibility function overloads and dual const/type-alias names. Keep type/value/namespace spaces separate. Type bindings include min/max generic arity; ambient-types entries exact name,min,max, explicit arity bounds. Ambient-values explicit names. Private namespace children are visible inside their namespace, not outside; private top-level helpers remain usable inside this module. Resolve nearest scope then ancestors/global. `typeof` needs a value or value-bearing namespace; a type-only namespace is not a value.

Type operations (each includes op):
- keyword:name from any,unknown,never,string,number,boolean,void,undefined,object,symbol;
- name:name,args (resolve type or scoped generic/infer/mapped binding; exact generic arity);
- literal:value (finite JSON primitive); array:item; tuple:items;
- union/intersection:items nonempty; keyof/readonly:datatype (readonly only array/tuple);
- typeof:name; index:object,key;
- conditional:test,extends,then,else; infer:name,constraint;
- function/constructor:abstract,type-params,params,returns (abstract only constructor);
- predicate:name,datatype;
- object:members;
- mapped:name,keys,remap,readonly,optional,value;
- template:head,spans, span exact datatype,tail.

Infer occurs only in conditional extends patterns (including function/constructor, template and nested type expressions); its bindings enter only the true branch. Generic defaults, mapped keys and false branches cannot use future/new bindings. Mapped binding enters remap/value only. Primitive/unknown refs, wrong arity, leaked infer/mapped names and invalid predicates refuse.

Budgets: namespace depth8; type depth64/nodes16384; declarations256 per scope, ambient types/values64, generics32, params64, members256, type argument32, collection/template span128; identifiers128 chars, qualified names256, literal/template/member text4096; source budget via module/check-source-text!. Booleans exact. Throw ex-info with :mithril/error. Pure compiler: no filesystem/network/eval or original-source parsing. This is AST/scope/arity admission, not a replacement for TypeScript semantic checking; independent pinned strict TSC controls check emitted public types.
