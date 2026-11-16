/** Return true for non-null objects and functions. */
export function isObject(value) {
    return value && (typeof value === 'object' || typeof value === 'function');
}
function handleError(info, reason, getOuterStack) {
    const innerLines = info.error.stack.split('\n');
    // malformed error
    if (typeof reason?.stack !== 'string') {
        const outerError = new Error(reason);
        const lines = outerError.stack.split('\n');
        lines.splice(1, Infinity, ...getOuterStack());
        outerError.stack = lines.join('\n');
        throw outerError;
    }
    // long stack trace
    const lines = reason.stack.split('\n');
    let index = lines.indexOf(innerLines[2]);
    if (index === -1)
        throw reason;
    index -= info.offset;
    while (index > 0) {
        if (!lines[index - 1].endsWith(' (<anonymous>)'))
            break;
        index -= 1;
    }
    lines.splice(index, Infinity, ...getOuterStack());
    reason.stack = lines.join('\n');
    throw reason;
}
/** Run a callback and splice outer call-site frames into thrown async errors. */
export function composeError(callback, getOuterStack = buildOuterStack()) {
    const info = { offset: 1, error: new Error() };
    try {
        const result = callback(info);
        if (isObject(result) && 'then' in result) {
            return result.then(undefined, (reason) => handleError(info, reason, getOuterStack));
        }
        else {
            return result;
        }
    }
    catch (reason) {
        handleError(info, reason, getOuterStack);
    }
}
/** Capture a lazy stack-frame supplier for later error composition. */
export function buildOuterStack(offset = 0) {
    const outerError = new Error();
    return () => outerError.stack.split('\n').slice(3 + offset);
}
