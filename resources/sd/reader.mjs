/* Mithril .mith source reader for the system dynamics lane. Pure JS.
 *
 * Reads exactly one inert Mithril S-expression and lowers the `rdf/*`
 * surface to the JSON-LD document model that `resources/sd/runtime.cjs`
 * consumes. This is the Node-side equivalent of `mithril.form/parse` for
 * the RDF subset the SD lane declares: the token, IRI and lowering rules
 * mirror `src/mithril/form.cljk` (reader, `rdf-id!`, `lower-rdf-data`,
 * `lower-literal`) so the identical .mith file lowers to the identical
 * document on the Clojure and Node paths. No eval, no I/O: refusal is the
 * only error path.
 */
const IRI_RE=/^[A-Za-z][A-Za-z0-9+.-]*:/;
const BLANK_RE=/^_:[A-Za-z0-9_.-]+$/;
const KW='__mithril_keyword__';
const kw=n=>{const o={};o[KW]=n;return o;};
const kwName=x=>x&&typeof x==='object'&&typeof x[KW]==='string'?x[KW]:undefined;
const fail=(code,message)=>{const e=new Error(message);e.code=code;return e;};
const STRING_ESCAPES={'n':'\n','t':'\t','r':'\r','b':'\b','f':'\f','"':'"','\\':'\\','[':'[',']':']','(':')',')':')','{':'{','}':'}',',':',','_':'_'};
function readAll(text){
  const forms=[];
  let i=0;
  const n=text.length;
  function skipWhitespace(){
    for(;;){
      while(i<n&&/\s/.test(text[i]))i++;
      if(i<n&&text[i]===';'){while(i<n&&text[i]!=='\n')i++;continue;}
      break;
    }
  }
  function readString(){
    let out='';
    i++;
    for(;;){
      if(i>=n)throw fail('mithril.mith.reader/unclosed-string','unclosed Mithril string');
      const c=text[i];
      if(c==='"'){i++;return out;}
      if(c==='\\'){
        const e=text[i+1];
        if(e===undefined)throw fail('mithril.mith.reader/bad-escape','truncated Mithril escape');
        if(e==='u'){
          const hex=text.slice(i+2,i+6);
          if(!/^[0-9a-fA-F]{4}$/.test(hex))throw fail('mithril.mith.reader/bad-escape','invalid \\u escape in Mithril string');
          out+=String.fromCharCode(parseInt(hex,16));
          i+=6;
        }else if(e in STRING_ESCAPES){
          out+=STRING_ESCAPES[e];
          i+=2;
        }else{
          throw fail('mithril.mith.reader/bad-escape','unsupported Mithril escape: \\'+e);
        }
      }else{
        out+=c;
        i++;
      }
    }
  }
  function readAtom(){
    let out='';
    while(i<n){
      const c=text[i];
      if(/\s/.test(c)||c==='('||c===')'||c===';')break;
      out+=c;
      i++;
    }
    if(out==='nil')return null;
    if(out==='true')return true;
    if(out==='false')return false;
    if(out.startsWith(':'))return kw(out.slice(1));
    if(/^-?\d+$/.test(out))return parseInt(out,10);
    return out;
  }
  function readForm(){
    skipWhitespace();
    if(i>=n)return undefined;
    const c=text[i];
    if(c==='('){
      i++;
      const items=[];
      for(;;){
        skipWhitespace();
        if(i>=n)throw fail('mithril.mith.reader/unclosed-form','unclosed Mithril form');
        if(text[i]===')'){i++;return items;}
        items.push(readForm());
      }
    }
    if(c==='"')return readString();
    return readAtom();
  }
  for(;;){
    skipWhitespace();
    if(i>=n)break;
    forms.push(readForm());
  }
  return forms;
}
function rdfId(value,blankAllowed){
  if(!(typeof value==='string'
    &&!/[\s<>\u0000-\u001f]/.test(value)
    &&((blankAllowed&&BLANK_RE.test(value))||IRI_RE.test(value))))
    throw fail('mithril.mith.reader/invalid-rdf-iri','RDF data requires an absolute IRI or admitted blank node');
  return value;
}
function requireAll(items,expected,tag){
  if(!items.every(c=>Array.isArray(c)&&typeof c[0]==='string'&&c[0]===expected))
    throw fail('mithril.mith.reader/invalid-rdf-data',tag+' requires '+expected+' children');
  return items;
}
function lowerLiteral(form){
  const [tag,lexical,...opts]=form;
  if(typeof lexical!=='string')throw fail('mithril.mith.reader/invalid-literal','rdf/literal takes a lexical string first');
  if(opts.length%2!==0)throw fail('mithril.mith.reader/field-arity','rdf/literal options are keyword/value pairs');
  const options={};
  for(let k=0;k<opts.length;k+=2){
    const name=kwName(opts[k]),value=opts[k+1];
    if(name!=='datatype'&&name!=='language')throw fail('mithril.mith.reader/unknown-field','rdf/literal accepts only :datatype or :language');
    options[name]=value;
  }
  const datatype=options.datatype,language=options.language;
  if(datatype!==undefined&&language!==undefined)throw fail('mithril.mith.reader/invalid-literal','a literal has a datatype or a language, not both');
  if(!(datatype===undefined||typeof datatype==='string'))throw fail('mithril.mith.reader/invalid-literal','rdf/literal :datatype / :language are strings');
  if(!(language===undefined||typeof language==='string'))throw fail('mithril.mith.reader/invalid-literal','rdf/literal :datatype / :language are strings');
  const out={'@value':lexical};
  if(datatype!==undefined)out['@type']=datatype;
  if(language!==undefined)out['@language']=language;
  return out;
}
function lowerRdfData(form){
  const tag=form[0],args=form.slice(1);
  switch(tag){
    case 'rdf/dataset':{
      const graphs=requireAll(args,'rdf/graph',tag).map(lowerRdfData);
      const out=[];
      for(const g of graphs)out.push(...(g['@id']?[g]:g['@graph']));
      return out;
    }
    case 'rdf/graph':{
      if(args.length===0)throw fail('mithril.mith.reader/invalid-rdf-data','rdf/graph needs a graph identity or nil');
      const [identity,...nodes]=args;
      const out={'@graph':requireAll(nodes,'rdf/description',tag).map(lowerRdfData)};
      if(identity!==null&&identity!==undefined)out['@id']=rdfId(identity,true);
      return out;
    }
    case 'rdf/description':{
      const [identity,...props]=args;
      rdfId(identity,true);
      requireAll(props,'rdf/property',tag);
      const node={'@id':identity};
      for(const p of props){
        const predicate=p[1],values=p.slice(2);
        rdfId(predicate,false);
        if(values.some(v=>!Array.isArray(v)||(v[0]!=='rdf/iri'&&v[0]!=='rdf/literal'))||values.length===0)
          throw fail('mithril.mith.reader/invalid-rdf-data','rdf/property needs explicit RDF terms');
        if(Object.prototype.hasOwnProperty.call(node,predicate))throw fail('mithril.mith.reader/invalid-rdf-data','duplicate RDF property');
        node[predicate]=values.map(lowerValue);
      }
      return node;
    }
    case 'rdf/property':{
      const [predicate,...values]=args;
      rdfId(predicate,false);
      if(values.length===0||values.some(v=>!Array.isArray(v)||(v[0]!=='rdf/iri'&&v[0]!=='rdf/literal')))
        throw fail('mithril.mith.reader/invalid-rdf-data','rdf/property needs explicit RDF terms');
      return values.map(lowerValue);
    }
    case 'rdf/iri':{
      if(args.length!==1)throw fail('mithril.mith.reader/invalid-rdf-data','rdf/iri takes exactly one identity');
      return {'@id':rdfId(args[0],true)};
    }
    default:
      throw fail('mithril.mith.reader/unknown-rdf-tag','unknown Mithril RDF tag: '+tag);
  }
}
function lowerValue(form){
  if(!Array.isArray(form)||typeof form[0]!=='string')
    throw fail('mithril.mith.reader/invalid-rdf-data','RDF terms are rdf/iri or rdf/literal forms');
  if(form[0]==='rdf/literal')return lowerLiteral(form);
  return lowerRdfData(form);
}
function lowerForm(form){
  if(!Array.isArray(form)||typeof form[0]!=='string')
    throw fail('mithril.mith.reader/invalid-form','Mithril source must be one tagged S-expression');
  if(form[0]==='rdf/literal')return lowerLiteral(form);
  return lowerRdfData(form);
}
function parseMith(text){
  if(typeof text!=='string')throw fail('mithril.mith.reader/read-error','Mithril source must be a string');
  const forms=readAll(text);
  if(forms.length!==1)throw fail('mithril.mith.reader/form-count','Mithril source must contain exactly one form');
  try{
    return lowerForm(forms[0]);
  }catch(error){
    if(error&&typeof error.code==='string'&&error.code.startsWith('mithril.mith.reader/'))throw error;
    throw fail('mithril.mith.reader/read-error',(error&&error.message)||'invalid Mithril form');
  }
}
export{parseMith,readAll};
