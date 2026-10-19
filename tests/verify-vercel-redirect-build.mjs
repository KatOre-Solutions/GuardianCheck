import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build as bundle } from "esbuild";

const cliRoot = process.argv[2];
if (!cliRoot) throw new Error("Pass the installed Vercel CLI directory as the first argument");
const require = createRequire(path.join(path.resolve(cliRoot), "package.json"));
const { build } = require("@vercel/node");
const { FileFsRef, FileBlob } = require("@vercel/build-utils");
const { EdgeRuntime } = require("edge-runtime");
const root = process.cwd();
const files = Object.fromEntries([
  "domain-redirect.ts", "src/constants/site.ts", "src/constants/appRoutes.ts",
].map((name) => [name, new FileFsRef({ fsPath: path.join(root, name) })]));
files["package.json"] = new FileBlob({ data: JSON.stringify({ type: "module" }) });
const result = await build({
  files,
  entrypoint: "domain-redirect.ts",
  workPath: path.join(root, "dist", "redirect-runtime-check"),
  config: { projectSettings: { installCommand: "" } },
  meta: {},
  considerBuildCommand: true,
});
assert.equal(result.output.type, "EdgeFunction");
const bundled = await bundle({
  stdin: {
    contents: `import handler from './${result.output.entrypoint}'; addEventListener('fetch', event => event.respondWith(handler(event.request)));`,
    sourcefile: "runtime.js",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  plugins: [{
    name: "vercel-edge-output",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => ({
        path: path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path)), namespace: "edge-output",
      }));
      builder.onLoad({ filter: /.*/, namespace: "edge-output" }, async (args) => {
        const file = result.output.files[args.path] ?? result.output.files[args.path.replaceAll("/", path.sep)];
        if (!file) throw new Error(`Missing emitted file: ${args.path}; available: ${Object.keys(result.output.files).join(", ")}`);
        return { contents: file.type === "FileBlob" ? String(file.data) : await readFile(file.fsPath, "utf8") };
      });
    },
  }],
});
const runtime = new EdgeRuntime({ initialCode: bundled.outputFiles[0].text });
const response = await runtime.dispatchFetch("https://app.guardiancheck.co.za/about?source=app&value=a%2Bb&tag=one&tag=two", {
  headers: { "x-forwarded-host": "app.guardiancheck.co.za", "x-forwarded-proto": "https", "x-forwarded-port": "443" },
});
assert.equal(response.status, 308);
assert.equal(response.headers.get("location"), "https://guardiancheck.co.za/about?source=app&value=a%2Bb&tag=one&tag=two");
assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
const live = process.argv[3] === "live";
if (live) {
  for (const requestPath of [
    "/accept-invite?token=a%2Bb%2Fc%3D&next=%2Fgrace%2Fparent",
    "/admin?payment=success&plan=growth",
    "/admin?payment=cancelled&plan=growth",
    "/register-church?plan=growth&tag=one&tag=two&empty=",
  ]) {
    const apex = await runtime.dispatchFetch(`https://guardiancheck.co.za${requestPath}`);
    assert.equal(apex.status, 308);
    assert.equal(apex.headers.get("location"), `https://app.guardiancheck.co.za${requestPath}`);
    const firstHop = await runtime.dispatchFetch(`https://www.guardiancheck.co.za${requestPath}`);
    assert.equal(firstHop.status, 308);
    assert.equal(firstHop.headers.get("location"), `https://guardiancheck.co.za${requestPath}`);
    const secondHop = await runtime.dispatchFetch(firstHop.headers.get("location"));
    assert.equal(secondHop.status, 308);
    assert.equal(secondHop.headers.get("location"), `https://app.guardiancheck.co.za${requestPath}`);
  }
} else {
  const unchanged = await runtime.dispatchFetch("https://guardiancheck.co.za/login?next=test");
  assert.equal(unchanged.status, 404);
}
console.log(`Vercel EdgeFunction runtime checks passed (${live ? "live" : "off"}): full encoded queries, expected host/phase behavior and noindex header`);
