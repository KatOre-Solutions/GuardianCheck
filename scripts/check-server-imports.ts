/**
 * Asserts that every relative import reachable from `server.ts` spells out its
 * file extension.
 *
 *   npm run check:server-imports     # runs as part of `npm run build`
 *
 * Why this exists: the API is `server.ts` deployed through @vercel/node, and
 * package.json says `"type": "module"`. Vercel loads each source file as its
 * own ES module, and Node's ESM loader does not guess extensions, so
 *
 *   import { COMPANY } from "./company";
 *
 * throws ERR_MODULE_NOT_FOUND the moment the function starts. The function then
 * exits before it can serve anything, so every /api route returned a 500, from
 * check-in to the PayFast ITN, until the imports were fixed.
 *
 * Nothing else in the build catches this. `vite build` and the esbuild bundle
 * of server.ts both resolve extensionless paths themselves, and `tsc` is
 * configured with `moduleResolution: bundler`, which allows them. The deployed
 * function is the only place the bare form fails, so this check reads the same
 * import graph the function loads and rejects it before it ships.
 *
 * Only files reachable from server.ts matter. Browser-only files can keep
 * extensionless imports, but once a file is shared with the server (as
 * legalContent.ts and planPricing.ts are) it needs the extension too. Pointing
 * a `.js` specifier at a `.ts` file is what server.ts already does, and Vite
 * and tsc both accept it.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENTRY = "server.ts";

// Static `import ... from "x"`, `export ... from "x"`, side-effect
// `import "x"`, and dynamic `import("x")` with a string literal.
const IMPORT_PATTERNS = [
  /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g,
  /(?:^|\n)\s*import\s+["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

const HAS_EXTENSION = /\.(?:[cm]?js|json|node)$/;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js"];

function fail(message: string): never {
  console.error(`check:server-imports: ${message}\n`);
  process.exit(1);
}

function relativeImports(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (match[1].startsWith("./") || match[1].startsWith("../")) {
        found.add(match[1]);
      }
    }
  }
  return [...found];
}

// A `.js` specifier names the compiled file; the source is the `.ts` beside it.
// A bare specifier is still followed, so one bad import does not hide the ones
// behind it and the whole list is reported in a single run.
function resolveSource(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const stem = base.replace(/\.js$/, "");
  const candidates = HAS_EXTENSION.test(specifier)
    ? [stem + ".ts", stem + ".tsx", base]
    : [
        ...SOURCE_EXTENSIONS.map((ext) => base + ext),
        ...SOURCE_EXTENSIONS.map((ext) => path.join(base, "index" + ext)),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

// What to write instead of a bare specifier. A directory import needs the index
// file named, so `./sub` becomes `./sub/index.js`, not the nonexistent `./sub.js`.
function withExtension(specifier: string, resolved: string | null): string {
  const isIndex =
    resolved !== null && /^index\.(?:ts|tsx|js)$/.test(path.basename(resolved));
  return isIndex && !specifier.endsWith("/index")
    ? `${specifier}/index.js`
    : `${specifier}.js`;
}

const entry = path.join(ROOT, ENTRY);
if (!existsSync(entry)) {
  fail(`${ENTRY} not found in ${ROOT}. Run this from the repository root.`);
}

const visited = new Set<string>();
const queue = [entry];
const offenders: string[] = [];
const unresolved: string[] = [];

while (queue.length > 0) {
  const file = queue.shift() as string;
  if (visited.has(file)) continue;
  visited.add(file);

  const shown = path.relative(ROOT, file).split(path.sep).join("/");

  for (const specifier of relativeImports(readFileSync(file, "utf8"))) {
    const resolved = resolveSource(file, specifier);

    if (!HAS_EXTENSION.test(specifier)) {
      const fixed = withExtension(specifier, resolved);
      offenders.push(`  ${shown}: "${specifier}"  ->  "${fixed}"`);
    }

    if (!resolved) {
      unresolved.push(`  ${shown}: "${specifier}"`);
    } else if (/\.(?:ts|tsx)$/.test(resolved)) {
      queue.push(resolved);
    }
  }
}

if (offenders.length > 0) {
  fail(
    "these relative imports have no file extension. Vercel loads server.ts as " +
      "native ES modules, where they throw ERR_MODULE_NOT_FOUND at startup and " +
      "take down every /api route:\n\n" +
      offenders.join("\n") +
      "\n\nAdd the .js extension shown above (it resolves to the .ts file).",
  );
}

if (unresolved.length > 0) {
  fail(
    "these relative imports point at files that do not exist:\n\n" +
      unresolved.join("\n"),
  );
}

console.log(
  `server imports: ${visited.size} files reachable from ${ENTRY}, all extensions explicit`,
);
