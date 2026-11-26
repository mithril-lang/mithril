# WASM spike (Item 224 §C, docs only)

Question: can Mithril modules (`mithril.module` → `mithril.module-lower`) gain a
WebAssembly backend, and what would `module_lower_wasm` require?

## What exists in-repo

Search (`grep -ri wasm src/ docs/ spec/ README.md vendor/`, plus `ls` for
`*wasm*`): **no Amu→WASM backend exists**. `src/mithril/{artifact,program,web}_lower.cljk`
all lower to Amu Kotoba source (`.cljk` emitter strings) consumed by Amu's
native selfhost compiler (`--jvm-free`, JS targets only). The only "wasm" hits
are `.mith` string literals (`examples/native-js-loader-internal-complete-types.mith :value "wasm"`)
and qualification prose (`wasm32-browser` target REFUSE, exit 65). Vendored
tree (`vendor/PROVENANCE.md`) ships no WASM backend.

So `module_lower_wasm` must be written against a **new** backend surface
the Amu toolchain does not yet provide. This spike records the design and the
go/no-go, without inventing any `js_*` mapping.

## Proposed `module_lower_wasm` contract

Emitter: `mithril.module-lower/lower-wasm-text` → `{:format :mithril.module/wasm-v1,
:module <name>, :wat <text>, :abi [...], :imports {...}, :exports [...]}`.

### Memory model (linear memory imports)

- One **imported** `memory` (`(import "mithril" "memory" (memory 1))`), grown only
  through an explicit `mithril.memory.grow` import with a compile-time cap
  (e.g. `max = 16` pages). The module never allocates a table of its own.
- Strings and i64 live in a **bump allocator** region `[heap_base, heap_base+size)`
  carved out of linear memory at instantiation; `free` is a no-op (module
  instances are short-lived, mirroring the Amu `instantiateKotoba` facade).
- i64 arithmetic maps 1:1 to `i64.add/sub/mul`, `i64.eq`, `i32.eqz` for `not`.
  Signed overflow: `i64` wraps (document: differs from nbb `Long`; callers must
  not rely on overflow refusal).

### Stdlib surface (imports)

| Import | Signature | Purpose |
| --- | --- | --- |
| `mithril.print` | `(func (param i32 i32))` | print UTF-8 `(ptr,len)` |
| `mithril.fuel` | `(func (param i32))` | decrement fuel, trap on exhaust |
| `mithril.clock` | `(func (result i64))` | monotonic nanoseconds |
| `mithril.memory.grow` | `(func (param i32) (result i32))` | bounded linear-memory growth |

Fuel mirrors `library-budgets` (`:fuel`/`:frames`) already derived by
`mithril.module-lower/library-budgets`; the WASM emitter reuses that walk.

### `js-value` boundary — must reject

Opaque `:js-value` and every `js_*` intrinsic (`js_nullish`, `js_truthy`,
`js_strict_equal`, `js_typeof`, `js_array`, `js_bool_value`, `js_undefined`)
have **no** WASM representation. Fail-closed with
`:mithril.module/guest-js-value` (same code as the §B guest re-target), emitted
before any WAT text. Guest callables (`:fn` types) are likewise refused —
WASM cannot host-ClojureScript closures without the JS bridge; that bridge
is out of scope for the spike.

### WASI shim proposal

Where Clang/LLVM emits WASI calls (e.g. `fd_write`, `clock_time_get`), provide a
**deny-by-default shim**: every WASI function traps unless the host explicitly
registers it. `fd_write` maps only to `mithril.print` (stdout, no files);
`clock_time_get` maps only to `mithril.clock`. No filesystem, no sockets,
no `proc_exit` (trap instead). This keeps the WASM module hermetic and
auditable from the `.wat` text alone.

### Non-goals

No `js_*` mapping invention, no WASM backend code, no Amu toolchain changes,
no binary artifact, no `wasm-bindgen`/`wit` dependency in this repo.

## Go / no-go

**GO** for a 4–8d follow-up `module_lower_wasm` behind a feature branch, gated on:

1. Amu toolchain ships or accepts a `wasm32` target (or the WAT is consumed by
   an external, pinned `wat2wasm` in CI).
2. Fuel/frames budgets reuse `library-budgets` unchanged (no new accounting).
3. `js-value`/`js_*` refusal lands first (this PR's `:mithril.module/guest-js-value`).
4. Byte-determinism: WAT is canonicalized text (sorted imports/exports) so
   downstream `wat2wasm` output is reproducible.

**NO-GO** for merging any WASM emitter in this PR — spike is docs only.
