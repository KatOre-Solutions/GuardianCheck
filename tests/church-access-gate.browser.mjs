// Local browser fixture: real gate, expiry hook and lock screen, with controlled
// authentication/document results. No Firebase connection or payments.
import { build } from 'esbuild';
import http from 'node:http';

const fixture = `
import React, { createContext, useContext } from 'react';
export const Fixture = createContext(null);
export const useAuth = () => useContext(Fixture).auth;
export const useLiveDocument = () => useContext(Fixture).document;
`;

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Fixture } from 'gate-fixture';
import { ChurchAccessGate } from './src/components/ChurchAccessGate';

const root = createRoot(document.getElementById('fixture'));
let mounts = 0;
function Dashboard() { mounts++; return <h2>Protected dashboard</h2>; }
const expired = { name: 'Test church', status: 'trialing', accessUntil: new Date('2020-01-01') };
const auth = { loading: false, userData: { churchId: 'church-a' }, roles: ['admin'] };
const results = document.getElementById('results');
function run(name, status, data, expected, authState = auth) {
  const before = mounts;
  flushSync(() => root.render(
    <Fixture.Provider value={{ auth: authState, document: { status, data } }}>
      <ChurchAccessGate><Dashboard /></ChurchAccessGate>
    </Fixture.Provider>
  ));
  const text = document.getElementById('fixture').textContent;
  const pass = text.includes(expected) && (expected === 'Protected dashboard' || mounts === before);
  const row = document.createElement('li');
  row.textContent = (pass ? 'PASS: ' : 'FAIL: ') + name;
  results.append(row);
  if (!pass) throw new Error(name + ': ' + text);
}
async function main() {
  run('Refresh waits for access without mounting dashboard', 'loading', null, 'Checking your church');
  await new Promise(resolve => setTimeout(resolve, 3000));
  run('Delayed expired result goes directly to lockout', 'ready', expired, 'Your free trial has ended');
  flushSync(() => root.render(<p>Volunteer route fixture</p>));
  run('Returning from Volunteer waits again', 'loading', null, 'Checking your church');
  run('Returning from Volunteer resolves to lockout', 'ready', expired, 'Your free trial has ended');
  run('Failed read blocks dashboard and offers retry', 'error', null, 'Unable to verify');
  run('Missing church blocks dashboard', 'ready', null, 'Unable to verify');
  run('Active access renders dashboard', 'ready', { ...expired, accessUntil: new Date('2099-01-01') }, 'Protected dashboard');
  run('Switching church waits for new result', 'loading', null, 'Checking your church', { ...auth, userData: { churchId: 'church-b' } });
  run('Existing unmetered church remains supported', 'ready', {}, 'Protected dashboard');
  run('Master admin bypass is preserved', 'loading', null, 'Protected dashboard', { ...auth, roles: ['master_admin'] });
  run('Authentication loading never renders dashboard', 'ready', {}, 'Checking your church', { ...auth, loading: true });
  run('Missing church membership blocks dashboard', 'loading', null, 'Unable to verify', { ...auth, userData: {} });
  run('Final expired state', 'ready', expired, 'Your free trial has ended');
  document.getElementById('summary').textContent = 'All 13 browser regression checks passed';
}
main().catch(error => { document.getElementById('summary').textContent = 'FAILED: ' + error.message; });
`;

const result = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{ name: 'gate-fixtures', setup(b) {
    b.onResolve({ filter: /^(gate-fixture|.*\/hooks\/useAuth|.*\/hooks\/useLiveData|\.\/useAuth)$/ }, () => ({ path: 'fixture', namespace: 'gate-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'gate-fixture' }, () => ({ contents: fixture, loader: 'jsx', resolveDir: process.cwd() }));
    b.onResolve({ filter: /\/PayFastButton$/ }, () => ({ path: 'payment', namespace: 'payment-fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'payment-fixture' }, () => ({ contents: 'export default function Payment() { return null; }', loader: 'js' }));
  } }],
});

const html = '<!doctype html><meta charset="utf-8"><title>Church access regression checks</title><style>body{font:16px system-ui;margin:32px}li{margin:8px 0}#fixture{border:1px solid #ccc;padding:24px;margin-top:24px}svg{width:40px;height:40px}</style><h1>Church access regression checks</h1><p>Local test fixture. No production data or payments.</p><h2 id="summary">Running delayed access check...</h2><ol id="results"></ol><main id="fixture"></main><script type="module" src="/test.js"></script>';
http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/test.js' ? result.outputFiles[0].text : html);
}).listen(4179, '127.0.0.1', () => console.log('Browser regression fixture: http://127.0.0.1:4179'));
