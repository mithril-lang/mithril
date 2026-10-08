import {Inject,read,set} from "./reference-a.mjs";
export const early=Inject;
export const before=read();
export const invoked=Inject();
const reset=globalThis.force?set(undefined):undefined;
const recorded=(0,globalThis.record)("b",early);
export function probe(){return early;}
