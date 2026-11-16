// Offline TypeScript-erased qualification oracle from both original switch nodes.
export function reference({Schema,valueMap,String,Number,Boolean,Function}){
function from(source) {
    switch (source) {
        case String: return Schema.string().required();
        case Number: return Schema.number().required();
        case Boolean: return Schema.boolean().required();
        case Function: return Schema.function().required();
        default: return Schema.is(source).required();
    }
}

function factory(key, schema, args, index) {
    switch (key) {
        case 'sKey':
            schema.sKey = args[index] ?? Schema.string();
            break;
        case 'inner':
            schema.inner = Schema.from(args[index]);
            break;
        case 'list':
            schema.list = args[index].map(Schema.from);
            break;
        case 'dict':
            schema.dict = valueMap(args[index], Schema.from);
            break;
        case 'bits': {
            schema.bits = {};
            for (const key in args[index]) {
                if (typeof args[index][key] !== 'number')
                    continue;
                schema.bits[key] = args[index][key];
            }
            break;
        }
        case 'callback': {
            const callback = schema.callback = args[index];
            callback['toJSON'] ||= () => callback.toString();
            break;
        }
        case 'constructor': {
            const constructor = schema.constructor = args[index];
            if (typeof constructor === 'function') {
                ;
                constructor['toJSON'] ||= () => constructor['name'];
            }
            break;
        }
        default: schema[key] = args[index];
    }
    return schema;
}

return {from,factory};}
