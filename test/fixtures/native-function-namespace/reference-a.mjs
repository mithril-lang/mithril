import {probe} from "./reference-b.mjs";
export function Inject(value=undefined){return value===undefined?Inject:Inject=value;}
export function read(){return Inject;}
export function set(value){return Inject=value;}
export function call(){return Inject();}
export function setFromHost(){return Inject=(0,globalThis.candidate)();}
export function throwSet(){throw globalThis.failure;}
export function attach(){(function (Inject) {
    /**
     * Convert array/object/class-inherited inject metadata into a plain map.
     *
     * @param inject — the declaration to normalize; `null`/`undefined` add nothing.
     * @param result — the map to fill (service name → intercept config or `null`).
     * @returns `result`.
     */
    function resolve(inject, result = Object.create(null)) {
        if (!inject)
            return result;
        if (Array.isArray(inject)) {
            for (const name of inject) {
                result[name] = null;
            }
        }
        else if (Reflect.has(inject, globalThis.symbols.checkProto)) {
            Object.assign(result, resolve(Object.getPrototypeOf(inject)));
            for (const name of Object.keys(inject)) {
                result[name] = inject[name] ?? null;
            }
        }
        else {
            for (const name of Object.keys(inject)) {
                result[name] = inject[name] ?? null;
            }
        }
        return result;
    }
    Inject.resolve = resolve;
})(Inject || (Inject = {}));}
export function snapshot(value){return function(){return value;};}
export function setter(){return function(value){return Inject=value;};}
export function selfReplace(value){return Inject=value;}
const initial=probe();
(function (Inject) {
    /**
     * Convert array/object/class-inherited inject metadata into a plain map.
     *
     * @param inject — the declaration to normalize; `null`/`undefined` add nothing.
     * @param result — the map to fill (service name → intercept config or `null`).
     * @returns `result`.
     */
    function resolve(inject, result = globalThis.Object.create(null)) {
        if (!inject)
            return result;
        if (globalThis.Array.isArray(inject)) {
            for (const name of inject) {
                result[name] = null;
            }
        }
        else if (globalThis.Reflect.has(inject, globalThis.symbols.checkProto)) {
            globalThis.Object.assign(result, resolve(globalThis.Object.getPrototypeOf(inject)));
            for (const name of globalThis.Object.keys(inject)) {
                result[name] = inject[name] ?? null;
            }
        }
        else {
            for (const name of globalThis.Object.keys(inject)) {
                result[name] = inject[name] ?? null;
            }
        }
        return result;
    }
    Inject.resolve = resolve;
})(Inject || (Inject = {}));
export {Inject as alias};
export {early,before,invoked} from './reference-b.mjs';
