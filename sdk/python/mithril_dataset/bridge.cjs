'use strict';
const fs = require('node:fs');
const R = require('./runtime.cjs');
try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  let result;
  if (request.op === 'pack') result = R.pack(request.data, request.options || {});
  else if (request.op === 'unpack') result = R.unpack(request.data, request.options || {});
  else if (request.op === 'subject') result = R.open(request.data, request.options || {}).querySubject(request.subject);
  else throw new Error('unsupported operation');
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(String(error.message) + '\n'); process.exitCode = 1;
}
