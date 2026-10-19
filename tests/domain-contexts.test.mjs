import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = process.cwd();
let passed = 0;

async function loadFixture(mode, contents, routeMocks = false) {
  const result = await build({
    stdin: { contents, loader: "tsx", resolveDir: root },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [{
      name: "domain-context-fixtures",
      setup(builder) {
        builder.onResolve({ filter: /(?:siteMode|lib\/firebase|lib\/firestore)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
        if (routeMocks) {
          builder.onResolve({ filter: /(?:hooks\/useAuth|contexts\/TenantContext)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
        }
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => {
          if (args.path.endsWith("siteMode")) return { contents: `export const SITE_MODE = ${JSON.stringify(mode)};` };
          if (args.path.endsWith("useAuth")) return { contents: "export const useAuth = () => globalThis.__gcRouteAuth;" };
          if (args.path.endsWith("TenantContext")) return { contents: "export const useTenant = () => globalThis.__gcRouteTenant;" };
          if (args.path.endsWith("firestore")) return { contents: "export const subscribeToDocument = () => { throw new Error('Unexpected user subscription'); };" };
          return { contents: "export const db = {}; export const auth = { currentUser: { uid: 'persisted-apex-user' } };" };
        });
      },
    }],
  });
  const fixture = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, fixture, fixture.exports);
  return fixture.exports;
}

const providerFixture = `
  import React from 'react';
  import { renderToString } from 'react-dom/server';
  import { MemoryRouter } from 'react-router-dom';
  import { AuthProvider } from './src/contexts/AuthContext';
  import { TenantProvider, useTenant } from './src/contexts/TenantContext';
  import { useAuth } from './src/hooks/useAuth';
  export function renderProviders() {
    let result;
    function Probe() { result = { auth: useAuth(), tenant: useTenant() }; return <span>ready</span>; }
    renderToString(<AuthProvider><MemoryRouter initialEntries={['/about']}><TenantProvider><Probe /></TenantProvider></MemoryRouter></AuthProvider>);
    return result;
  }
`;

for (const mode of ["marketing", "combined", "app"]) {
  const { renderProviders } = await loadFixture(mode, providerFixture);
  const state = renderProviders();
  assert.equal(state.auth.user, null);
  assert.equal(state.auth.token, null);
  assert.equal(state.auth.userData, null);
  assert.deepEqual(state.auth.roles, []);
  assert.equal(state.tenant.church, null);
  assert.equal(state.auth.loading, mode !== "marketing");
  assert.equal(state.tenant.loading, mode !== "marketing");
  passed++;
  console.log(`ok: ${mode} providers expose the expected initial context with a persisted SDK user`);
}

const { renderRoute } = await loadFixture("app", `
  import React from 'react';
  import { renderToString } from 'react-dom/server';
  import { MemoryRouter } from 'react-router-dom';
  import { ProtectedRoute } from './src/components/ProtectedRoute';
  export function renderRoute(allowedRoles) {
    return renderToString(<MemoryRouter initialEntries={['/profile']}><ProtectedRoute allowedRoles={allowedRoles}><span>profile-content</span></ProtectedRoute></MemoryRouter>);
  }
`, true);

const approved = {
  user: { uid: "no-role-user", emailVerified: true, providerData: [{ providerId: "password" }] },
  userData: { roles: [], status: "approved" },
  roles: [], role: null, status: "approved", loading: false,
};
const previousWindow = globalThis.window;
globalThis.window = { location: { pathname: "/profile" } };
globalThis.__gcRouteTenant = { church: null, loading: false, error: null };

function checkRoute(name, auth, allowedRoles, expectedContent) {
  globalThis.__gcRouteAuth = auth;
  const html = renderRoute(allowedRoles);
  assert.equal(html.includes("profile-content"), expectedContent, name);
  passed++;
  console.log(`ok: ${name}`);
}

try {
  checkRoute("verified role-less account can reach profile", approved, undefined, true);
  checkRoute("unsupported role can still reach its own profile", { ...approved, roles: ["legacy"] }, undefined, true);
  checkRoute("anonymous visitors cannot reach profile", { ...approved, user: null }, undefined, false);
  checkRoute("unverified password users cannot reach profile", { ...approved, user: { ...approved.user, emailVerified: false } }, undefined, false);
  checkRoute("incomplete profiles still wait for onboarding", { ...approved, status: "incomplete_profile" }, undefined, false);
  checkRoute("rejected users cannot reach profile", { ...approved, status: "rejected" }, undefined, false);
  checkRoute("pending auth cannot reveal profile", { ...approved, loading: true }, undefined, false);
  checkRoute("role-less users cannot reach admin routes", approved, ["admin"], false);
  checkRoute("parents cannot reach admin routes", { ...approved, roles: ["parent"] }, ["admin"], false);
  checkRoute("admins retain dashboard access", { ...approved, roles: ["admin"] }, ["admin"], true);
  globalThis.__gcRouteTenant = { church: { id: "other-church", slug: "other" }, loading: false };
  checkRoute("cross-tenant access remains blocked", { ...approved, roles: ["parent"], userData: { churchId: "own-church" } }, undefined, false);
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  delete globalThis.__gcRouteAuth;
  delete globalThis.__gcRouteTenant;
}

console.log(`\n${passed} context and route cases passed`);
