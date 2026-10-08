import {readB} from './b.mjs';
export let count=1;
const mark=globalThis.record('a');
export const snapshot=count+0;
export class A {read(){return readB()}}
export function readA(){return 7}
export function inc(){return count=count+1}
