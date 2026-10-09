// Exact original source patterns. Schema.resolve is an explicit observation grant.
export function instantiateSchemaBindingReference(Schema) {
    function lexical0(data, inner, options, strict, meta, key, schema) { const [value, adapted] = Schema.resolve(data, inner, options, strict); return [value, adapted]; }
    const parameter0 = ({ value }) => [value];
    function lexical1(data, inner, options, strict, meta, key, schema) { const { max = Infinity, min = -Infinity } = meta; return [max, min]; }
    const parameter1 = ({ meta }) => [meta];
    const parameter2 = ({ meta }) => [meta];
    function lexical2(data, inner, options, strict, meta, key, schema) { const { step } = meta; return [step]; }
    const parameter3 = ({ bits, meta }) => [bits, meta];
    const parameter4 = ({ constructor }) => [constructor];
    function lexical3(data, inner, options, strict, meta, key, schema) {
        const [value, adapted] = Schema.resolve(data[key], schema, {
            ...options,
            path: [...options.path || [], key],
        });
        return [value, adapted];
    }
    const parameter5 = ({ inner, meta }) => [inner, meta];
    const parameter6 = ({ inner, sKey }) => [inner, sKey];
    const parameter7 = ({ list }) => [list];
    const parameter8 = ({ dict }) => [dict];
    const parameter9 = ({ list, toString }) => [list, toString];
    const parameter10 = ({ list, toString }) => [list, toString];
    const parameter11 = ({ inner, callback, preserve }) => [inner, callback, preserve];
    function lexical4(data, inner, options, strict, meta, key, schema) { const [result, adapted = data] = Schema.resolve(data, inner, options, true); return [result, adapted]; }
    const parameter12 = ({ constructor }) => [constructor];
    const parameter13 = ({ value }) => [value];
    const parameter14 = ({ inner }) => [inner];
    const parameter15 = ({ inner, sKey }) => [inner, sKey];
    const parameter16 = ({ list }) => [list];
    const parameter17 = ({ dict }) => [dict];
    const parameter18 = ([key, inner]) => [key, inner];
    const parameter19 = ({ list }) => [list];
    const parameter20 = ({ toString: format }) => [format];
    const parameter21 = ({ list }) => [list];
    const parameter22 = ({ inner }) => [inner];
    return { lexical0, parameter0, lexical1, parameter1, parameter2, lexical2, parameter3, parameter4, lexical3, parameter5, parameter6, parameter7, parameter8, parameter9, parameter10, parameter11, lexical4, parameter12, parameter13, parameter14, parameter15, parameter16, parameter17, parameter18, parameter19, parameter20, parameter21, parameter22 };
}
