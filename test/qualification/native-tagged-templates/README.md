# Native tagged template qualification

Stage 33 admits `mithril/host-tagged-template` with a checked tag expression,
a `raw` vector of one to 65 lexical template parts and a `values` vector of
zero to 64 checked substitutions. The raw vector must contain exactly one more
part than substitutions. Raw parts preserve source escapes, including invalid
cooked escapes permitted by tagged templates, and use well-formed Unicode with
LF line endings. Admission rejects unescaped backticks/interpolation delimiters,
incomplete trailing escapes, carriage returns, isolated UTF-16 surrogates,
missing/extra fields, invalid values and collection overflow. Source, AST,
package and process budgets remain unchanged.

The backend emits native JavaScript tagged syntax. It preserves native
TemplateStringsArray descriptors and freezing, raw/cooked values, per-site
identity across calls and factory instances, property-reference receivers,
getter/substitution evaluation order, uncoerced substitutions, Unicode, line
continuations and exception identity. Seven admissions and 17 exact-code
refusals qualify the lexical boundary. Each actual CLI label produces exact
checked bytes and passes 31 independently authored JavaScript-paired groups;
invalid source refuses before writing the first artifact. Both labels execute
under Node, including `js-browser`.

This compiler prerequisite preserves `String.raw` patterns in the complete
original LLM error source. It does not establish the complete LLM SDK, public
types, plugin/profile/API parity, browser/native execution or package publication.
System One did not author this patch or perform a new inference; no measured
model performance gain is claimed.
