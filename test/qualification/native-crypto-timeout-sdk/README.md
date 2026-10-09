# Complete crypto and timeout SDK qualification

Stage 30 retains both complete original source files, eleven declarations,
eight runtime exports and four public type exports. Both actual CLI labels
compile their own Mithril ESM and declaration modules. Runtime evidence is
under Node, not a real browser or another native backend.

Pinned original source and the unchanged upstream tests are verified with Git
blob IDs and SHA-256. Original declaration fixtures and all Mithril sources
have SHA-256 provenance. TypeScript 6.0.3 is an original-source declaration
oracle, test eraser and strict consumer checker only; the candidate compiler
does not delegate runtime or declarations to TypeScript. Full original strict
re-emission and normalized declaration structure are checked, including the
UUID template and timer limit's exact numeric literal type.

Crypto has three positive and three negative strict consumers, plus fourteen
original-paired runtime groups. Timeout has six positive and eight negative
strict consumers, plus thirty original-paired deterministic-timer groups.
All thirty unchanged upstream tests execute separately against original and
candidate runtimes. Descriptors, cancellation precedence, timer cleanup,
watchdog pulses, disposal and iterator failures preserve original behavior.

Real NodeNext package exports, bare imports, self-reference and duplicate
installs are checked against original and candidate owners at equal and
different versions. These public types are structurally compatible even across
versions; actual TimeoutReason constructors remain separate runtime owners,
and timeoutOf rejects foreign-copy instances. The standard disposable library
is explicitly included for Symbol.dispose consumers. Each package matrix case
uses a bounded process and reports plain diagnostic records, preserving all
cases without retaining library ASTs in failure output. Compiler budgets and
per-stage limits remain unchanged.

The ports and controls are operator authored. No System One model request,
model-authored candidate or model performance gain is claimed.
