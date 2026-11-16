// Independently authored native JavaScript oracle, not an upstream Harness file.
export class Counter {
  #x = 1
  #values = []
  static #s = 4
  get(o = this) { return o.#x }
  read(o) { return o.#x }
  set(value) { return this.#x = value }
  post() { return this.#x++ }
  pre() { return ++this.#x }
  compound(o, rhs) { return o().#x += rhs() }
  logical(rhs) { return this.#x ||= rhs() }
  optional(o) { return o?.#x }
  optionalMethod(o) { return o?.#method?.() }
  arrow() { return () => this.#x }
  ordinary() { return function(o = this) { return o.#x } }
  object() { return { read(o) { return o.#x } } }
  nested() { return class Inner { #x = 9; get(o) { return o.#x }; outer(o) { return o.#values } } }
  #method() { return this.#x }
  method(o) { return o.#method() }
  spreadMethod(o, values) { return o.#method(...values) }
  detached() { return this.#method }
  static read() { return this.#s }
}
export class Other { #x = 1 }
export class Derived extends Counter {}
export class MethodFirst { #x = this.#read(); #read() { return 7 }; get() { return this.#x } }
export class FieldTooEarly { #x = this.#y; #y = 7 }
export class Pair {
  #v = 1
  trace = []
  get #x() { this.trace.push('get'); return this.#v }
  set #x(v) { this.trace.push('set'); this.#v = v }
  inc() { return this.#x++ }
}
export class ComputedNames { #x; [((o) => o.#x).name]() {} }
export class PrivateNames { #$value = 2; #π = 3; get() { return this.#$value + this.#π } }
export class StaticBlock {
  static #x = 2
  static { this.#x += 3 }
  static get() { return this.#x }
}
export function computedWithReceiver() {
  return class Inner { #x; [this.key]() { return 7 } }
}
