// Offline TypeScript-erased original loop observation oracle.
export function reference({validateVolatileSchema,String}){
function list(schema, path, seen) {
    for (let index = 0; index < schema.list.length; index++) {
        validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
    }
}

return {list};}
