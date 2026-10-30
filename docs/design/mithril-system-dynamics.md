# Mithril system dynamics

Mithril has a bounded system dynamics model over stock-and-flow diagrams. A
model is inert JSON: stocks with initial values, parameters, constants, rates
and auxiliaries. Rates and auxiliaries are bounded arithmetic expressions over
declared stocks, parameters, constants, auxiliaries and `time`; rate identifiers are not expression inputs in v1. The identifier `time` is reserved. The recursive-descent expression parser is
the only path from text to computation. There is no eval and no I/O. Stocks
integrate the net of their declared inflows and outflows with the classic
midpoint (improved Euler) step:

```text
S(t+dt) = S(t) + dt * net(S(t) + dt/2 * net(S(t)))
```

This is continuous-time complement to the discrete graph computation models:
the graph model propagates states across a graph in bounded supersteps, while
the system dynamics model integrates stocks in bounded time steps. Auxiliary
systems (auxiliaries that reference each other) are solved by bounded
fixed-point iteration; a system that does not converge within its budget is
refused, never looped forever. All budgets — identifiers, steps, samples and
finite values — are enforced by refusal, not truncation.

## .mith contracts

`ontology/sd-v1.mith` declares Program, Run, Stock, Rate and Auxiliary classes
and a Program shape. A Program has one `sd:key`, `sd:model` (`sd`) and
`sd:specification`. The specification is an inert JSON literal with a `model`
(stocks, parameters, constants, rates, auxiliaries) and a run envelope
(`dt`, `horizon`, `maxSamples`). RDF and SHACL describe the envelope; the host
validates operational semantics.

See `examples/sd/programs.mith` for three runnable demonstrations: exponential
growth, a bathtub with constant flows, and logistic growth toward a carrying
capacity.

The lane is .mith and pure JS end to end — there is no Clojure in the path.
`bin/mithril-sd.mjs` reads the .mith source directly with
`resources/sd/reader.mjs` (the Node-side equivalent of `mithril.form/parse`
for the RDF subset the SD lane declares: the same token, IRI and lowering
rules, so the identical .mith file lowers to the identical document model)
and hands it to `resources/sd/runtime.cjs`:

```sh
node bin/mithril-sd.mjs run examples/sd/programs.mith growth
node bin/mithril-sd.mjs run examples/sd/programs.mith bathtub
node bin/mithril-sd.mjs run examples/sd/programs.mith logistic
```

A fourth argument sets the sample budget, e.g. `... growth 32` records at most
32 interior samples plus the initial and final states. The run result is canonical JSON
(`mithril.sd/run-v1`) with the admitted `times`, per-stock `stocks` series, the
real `dt`, `horizon` and `steps`. Unknown identifiers, unsafe identifiers,
unparseable expressions, non-finite values and overflowing steps are errors.

## Verification

`node --test scripts/test-sd.mjs` covers the analytic cases: exponential and
logistic growth against their closed-form solutions, the exact bathtub, the
midpoint integration of a quadratic (ramp in `time`), expression grammar
(precedence, power, unary minus, parentheses), fail-closed refusals (unknown
identifiers, bad directions, missing targets, duplicate and unsafe IDs,
overflow, non-convergence), the RDF program envelope (duplicate keys and
non-`sd` models are refused), and the .mith source path: the pure-JS reader
lowers `examples/sd/programs.mith` to the same document as the Clojure
`form/parse` oracle, fails closed on malformed RDF data, and an end-to-end
run goes from .mith text through the reader and the runtime.

`.github/workflows/system-dynamics.yml` re-runs that suite on Node 24 for
pushes and pull requests touching the SD lane.

This is a local implementation; native Amu, distributed execution and
release are separate verification gates.
