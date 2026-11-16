import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const repo=fileURLToPath(new URL('../../../../',import.meta.url)),fixture=join(repo,'test/fixtures/crypto-timeout-sdk');
export async function toolchain(compiler){
 const ts=(await import(pathToFileURL(compiler))).default;assert.equal(ts.version,'6.0.3');
 const proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
 for(const[file,sha]of Object.entries(proof.fixtures)){const bytes=readFileSync(join(fixture,file));assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);if(proof.originalGitBlobs[file])assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),proof.originalGitBlobs[file]);}
 for(const[file,sha]of Object.entries(proof.mithrilSources))assert.equal(createHash('sha256').update(readFileSync(join(repo,'examples',file))).digest('hex'),sha);
 return ts;
}
