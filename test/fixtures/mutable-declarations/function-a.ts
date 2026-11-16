// Operator-authored mechanics; Schema is an explicit type observation helper.
type Schema = { value: number };
declare namespace globalThis {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  export let __schemastery_index__: number
  export let __schemastery_refs__: Record<number, Schema> | undefined
}

globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = undefined;
let counter = 0;
export { counter as count, counter as alias };
export let bump: () => number = function bump() { return ++counter; };
export namespace State { export let count = 0; export let refs: Record<number, Schema> | undefined; export const fixed = 11; }
export namespace OnlyMutable { export let slot = 1; }
export function globalState(refs: Record<number, Schema> | undefined): [number, Record<number, Schema> | undefined] { globalThis.__schemastery_refs__ = refs; return [++globalThis.__schemastery_index__, globalThis.__schemastery_refs__]; }
export type GlobalCounter = typeof globalThis.__schemastery_index__;
export type GlobalRefs = typeof globalThis.__schemastery_refs__;
export type StateRefs = typeof State.refs;
