import {readA,count} from './a.mjs';
export const b=readA();
const mark=globalThis.record('b');
export function readB(){return b}
export function getA(){return count}
export {count as forwardA};
export function defaultA(value=count){return value}
