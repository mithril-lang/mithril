# Checked guest closure vocabulary

The maintained runner includes six new tests and passes 65/351 using candidate
source/test mounts and frozen published dependencies in offline Node bootstrap.
The same runner against an archive of published 7d855a source reports 6 failures
and 3 errors (65/342). This is actual refusal evidence, not an entry-point error.

Fresh lowering of examples/module-guest-closures.mith produces eight exports and
exactly the Kotoba source used in normal Amu qualification. Amu candidate PR1250
uses published Sema PR100, Osaho D1 and Script ed36; both explicit JS targets
compile with --jvm-free and pass 112 opaque identities, zero Proxy reads, 2,000
fresh instances and budget traps on frozen offline Node. Non-JS targets refuse
without artifacts or JVM markers. Amu/main publication is still pending.

The pure public facade refuses guest callable signatures/closure vocabulary.
No escaping host callback bridge, unbounded lifetime, native selfhost, actual
browser execution, package replacement or full harness API/plugin parity is
claimed. System One made no model attempt; source is operator-authored.

Frozen export-alias controls separately pass 7/25. The frozen legacy string-IR
control script also exits zero; it is not counted as part of the registered suite.
