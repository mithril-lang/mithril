# Complete independent Cordis declaration graph

The checked Mithril program in `examples/native-js-cordis-complete-type-program.mith`
contains all nine pinned original Cordis declaration modules: Context, Events,
Fiber, Logger, Reflect, Registry, Service, Utils and the public index. The complete
CosmoKit and Standard Schema dependency forms are also checked Mithril declarations.
The eleven-module program has no external type adapters. It compiles beside the
actual fifteen-module native Cordis runtime, selecting all original 26 root values.
No original TS/JS source is delegated at compile or runtime. TypeScript is an
independent qualification tool, not a production compiler dependency.

Both actual CLI targets (`js`, `js-browser`) run in Node. Each passes the original
16 positive and 15 negative logical strict consumer groups, for 62 original-paired
groups total. TypeScript 6.0.3 has strict checking and skipLibCheck:false. An additional
candidate-only strict program removes package path adapters and refuses any original
oracle source in its closure. Consumer Context/Events augmentation targets the actual
candidate modules. All nine original module structures, imports/reexports and all
five augmentation blocks are compared against hashed original declarations. CosmoKit
and Standard Schema complete dependency forms are also compared. Fingerprints ignore
formatting, redundant parentheses and ambient export/declare spelling, normalize
const initializer literal types, and compare augmentations separately from own forms
because the emitter places them after own declarations. Original overload order is
retained. Full module public symbols and the root public type/value surface match.

The root has exactly 50 names, 35 type bindings and 28 TypeScript value bindings;
LoggerLevel/FiberState are erased const enums, leaving 26 actual runtime values.
All eight core leaf runtime export surfaces and root binding origins are inspected;
ReflectService remains reachable through Context but intentionally absent from the
public index, matching the original. Actual TypeScript-emitted consumer JavaScript
folds enum constants without enum objects and runs against the genuine Context.
Original-paired Context events/provide/disposal, Fiber/Registry/Logger/Reflect class
identity, ValidationError/CordisError and Inject.resolve behavior are exercised.
Existing full runtime, compiler refusal, CLI output preservation and type controls
remain part of the source/package/declaration CI qualification.

This establishes the independent Cordis public declaration graph in the finite
qualified scope. It does not establish complete Harness API/plugin/profile/Session
parity, a whole repository build, actual browser/native/Q9 execution or System One
performance. Operator authored; zero new System One inference/adoption/measured gain.
Readiness of the published Code provider is a separate external dependency.

Run `node scripts/test-native-declarations.mjs --engine <engine> --typescript
<typescript.js> --type-roots <@types>`. Every child compiler uses explicit offline
configuration and preserves the no-JVM/dependency-launcher guard.
