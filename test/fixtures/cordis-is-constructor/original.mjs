const GeneratorFunction = function* () { }.constructor;
const AsyncGeneratorFunction = async function* () { }.constructor;
/** Return true when a plugin callback should be constructed with `new`. */
export function isConstructor(func) {
    // async function or arrow function
    if (!func.prototype)
        return false;
    // generator function or malformed definition
    // we cannot use below check because `mock.fn()` is proxied
    // if (func.prototype.constructor !== func) return false
    if (func instanceof GeneratorFunction)
        return false;
    // polyfilled AsyncGeneratorFunction === Function
    if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction)
        return false;
    return true;
}
