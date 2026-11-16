// Qualification oracle: TypeScript erased offline from eight pinned original loop nodes.
export function reference({Schema,property,isNullable}){
function refs(refs, getRef, valueMap) {
    for (const key in refs) {
        const options = refs[key];
        options.sKey = getRef(options.sKey);
        options.inner = getRef(options.inner);
        options.list = options.list && options.list.map(getRef);
        options.dict = options.dict && valueMap(options.dict, getRef);
    }
    return refs;
}

function mergeDesc(messages) {
    const result = {};
    for (const locale in messages) {
        const value = messages[locale];
        if (value?.$description || value?.$desc) {
            result[locale] = value.$description || value.$desc;
        }
        else if (typeof value === 'string') {
            result[locale] = value;
        }
    }
    return result;
}

function simplify(value) {
    const result = {};
    for (const key in value) {
        const schema = this.type === 'object' ? this.dict[key] : this.inner;
        const item = schema?.simplify(value[key]);
        if (this.type === 'dict' || !isNullable(item))
            result[key] = item;
    }
    return result;
}

function bitset(data, bits) {
    const keys = [];
    for (const key in bits) {
        if (data & bits[key]) {
            keys.push(key);
        }
    }
    return keys;
}

function dict(data, sKey, options, strict, inner) {
    const result = {};
    for (const key in data) {
        let rKey;
        try {
            rKey = Schema.resolve(key, sKey, options)[0];
        }
        catch (error) {
            if (strict)
                continue;
            throw error;
        }
        result[rKey] = property(data, key, inner, options);
        data[rKey] = data[key];
        if (key !== rKey)
            delete data[key];
    }
    return { result, data };
}

function merge(data, result) {
    for (const key in data) {
        if (key in result)
            continue;
        result[key] = data[key];
    }
    return result;
}

function object(dict, data, options) {
    const result = {};
    for (const key in dict) {
        const value = property(data, key, dict[key], options);
        if (!isNullable(value) || key in data) {
            result[key] = value;
        }
    }
    return result;
}

function factoryBits(args, index, schema) {
    for (const key in args[index]) {
        if (typeof args[index][key] !== 'number')
            continue;
        schema.bits[key] = args[index][key];
    }
    return schema;
}

return {refs,mergeDesc,simplify,bitset,dict,merge,object,factoryBits};}
