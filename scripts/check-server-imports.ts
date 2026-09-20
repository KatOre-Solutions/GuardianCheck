/**
 * Asserts that every import reachable from `server.ts` is one Node's ESM loader
 * can resolve on its own.
 *
 *   npm run check:server-imports     # runs as part of `npm run build`
 *
 * Why this exists: the API is `server.ts` deployed through @vercel/node, and
 * package.json says `"type": "module"`. Vercel loads each source file as its
 * own ES module, and Node's ESM loader does no guessing, so
 *
 *   import { COMPANY } from "./company";
 *
 * throws ERR_MODULE_NOT_FOUND the moment the function starts. The function then
 * exits before it can serve anything, so every /api route returned a 500, from
 * check-in to the PayFast ITN, until the imports were fixed.
 *
 * Nothing else in the build catches this. `vite build` and the esbuild bundle
 * of server.ts both resolve these forms themselves, and `tsc` is configured
 * with `moduleResolution: bundler`, which allows them. The deployed function is
 * the only place they fail, so this check reads the same import graph the
 * function loads and rejects it before it ships.
 *
 * Three things fail at startup, and each is reported separately:
 *
 *   1. A relative import with no extension, or with a `.ts` extension that
 *      `allowImportingTsExtensions` permits but Node cannot load. Node needs
 *      the `.js` form, which Vite and tsc resolve back to the `.ts` source.
 *   2. An `@/...` alias import. The alias is a bundler and tsc convention, so
 *      Node sees a bare specifier and looks for a package by that name.
 *   3. A JSON import without `with { type: "json" }`, which Node refuses with
 *      ERR_IMPORT_ATTRIBUTE_MISSING.
 *
 * Only files reachable from server.ts matter. Browser-only files can keep
 * extensionless and aliased imports, but once a file is shared with the server
 * (as legalContent.ts and planPricing.ts are) it plays by Node's rules too.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENTRY = "server.ts";

// tsconfig paths maps "@/*" to "./*" from the repo root, and vite.config.ts
// mirrors it. Node knows about neither.
const ALIAS_PREFIX = "@/";

// Static `import ... from "x"`, `export ... from "x"`, side-effect
// `import "x"`, and dynamic `import("x")` with a string literal. The dynamic
// form allows a second argument so that an import attribute is still matched.
const IMPORT_PATTERNS = [
  /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g,
  /(?:^|\n)\s*import\s+["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*[,)]/g,
];

// What Node can load as written. A `.json` specifier is deliberately absent:
// it resolves, but only loads with an import attribute, checked separately.
const HAS_RUNTIME_EXTENSION = /\.(?:[cm]?js|node)$/;
const HAS_TS_EXTENSION = /\.(?:ts|tsx)$/;
const IS_JSON = /\.json$/;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js"];

// Both the static `with { type: "json" }` and the dynamic second-argument form
// spell the attribute this way. The window keeps the search on this statement.
const JSON_ATTRIBUTE = /type\s*:\s*["']json["']/;
const ATTRIBUTE_WINDOW = 120;

type ImportRef = { specifier: string; jsonAttribute: boolean };

function fail(sections: string[]): never {
  console.error(`check:server-imports:\n\n${sections.join("\n\n")}\n`);
  process.exit(1);
}

// Comments go before the patterns run, so a specifier named in prose (a note
// about a module that has since moved, say) cannot fail the build. The `[^:]`
// guard leaves "https://..." inside a string alone.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function isAlias(specifier: string): boolean {
  return specifier.startsWith(ALIAS_PREFIX);
}

function importRefs(source: string): ImportRef[] {
  const code = stripComments(source);
  const found = new Map<string, ImportRef>();

  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (!isRelative(specifier) && !isAlias(specifier)) continue;

      const from = (match.index ?? 0) + match[0].length;
      const jsonAttribute = JSON_ATTRIBUTE.test(
        code.slice(from, from + ATTRIBUTE_WINDOW),
      );

      // The same specifier imported twice counts as attributed only when every
      // occurrence carries the attribute, since one bare import is enough to
      // kill the function.
      const seen = found.get(specifier);
      if (!seen) found.set(specifier, { specifier, jsonAttribute });
      else seen.jsonAttribute = seen.jsonAttribute && jsonAttribute;
    }
  }

  return [...found.values()];
}

// A `.js` specifier names the compiled file; the source is the `.ts` beside it.
// A specifier Node would reject is still resolved and followed, so one bad
// import does not hide the ones behind it and the whole list is reported in a
// single run.
function resolveSource(fromFile: string, specifier: string): string | null {
  const base = isAlias(specifier)
    ? path.resolve(ROOT, specifier.slice(ALIAS_PREFIX.length))
    : path.resolve(path.dirname(fromFile), specifier);

  if (IS_JSON.test(specifier) || HAS_TS_EXTENSION.test(specifier)) {
    return existsSync(base) ? base : null;
  }

  const candidates = HAS_RUNTIME_EXTENSION.test(specifier)
    ? [base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), base]
    : [
        ...SOURCE_EXTENSIONS.map((ext) => base + ext),
        ...SOURCE_EXTENSIONS.map((ext) => path.join(base, "index" + ext)),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

// What to write instead. A directory import needs the index file named, so
// `./sub` becomes `./sub/index.js`, not the nonexistent `./sub.js`. A `.ts`
// specifier has its extension swapped rather than appended to, since
// `./x.ts.js` resolves to nothing.
function withExtension(specifier: string, resolved: string | null): string {
  const stem = specifier.replace(HAS_TS_EXTENSION, "");
  const isIndex =
    resolved !== null && /^index\.(?:ts|tsx|js)$/.test(path.basename(resolved));
  return isIndex && !stem.endsWith("/index")
    ? `${stem}/index.js`
    : `${stem}.js`;
}

// The relative path the alias was standing in for, so the message says what to
// write instead of only what is wrong.
function asRelative(
  fromFile: string,
  specifier: string,
  resolved: string | null,
): string {
  const target =
    resolved ?? path.resolve(ROOT, specifier.slice(ALIAS_PREFIX.length));
  const rel = path
    .relative(path.dirname(fromFile), target)
    .split(path.sep)
    .join("/");
  const withDot = rel.startsWith(".") ? rel : `./${rel}`;
  return withDot.replace(HAS_TS_EXTENSION, ".js");
}

const entry = path.join(ROOT, ENTRY);
if (!existsSync(entry)) {
  fail([`${ENTRY} not found in ${ROOT}. Run this from the repository root.`]);
}

const visited = new Set<string>();
const queue = [entry];
const offenders: string[] = [];
const aliased: string[] = [];
const jsonOffenders: string[] = [];
const unresolved: string[] = [];

while (queue.length > 0) {
  const file = queue.shift() as string;
  if (visited.has(file)) continue;
  visited.add(file);

  const shown = path.relative(ROOT, file).split(path.sep).join("/");

  for (const { specifier, jsonAttribute } of importRefs(
    readFileSync(file, "utf8"),
  )) {
    const resolved = resolveSource(file, specifier);

    if (isAlias(specifier)) {
      aliased.push(
        `  ${shown}: "${specifier}"  ->  "${asRelative(file, specifier, resolved)}"`,
      );
    } else if (IS_JSON.test(specifier)) {
      if (!jsonAttribute) {
        jsonOffenders.push(`  ${shown}: "${specifier}"`);
      }
    } else if (!HAS_RUNTIME_EXTENSION.test(specifier)) {
      offenders.push(
        `  ${shown}: "${specifier}"  ->  "${withExtension(specifier, resolved)}"`,
      );
    }

    if (!resolved) {
      unresolved.push(`  ${shown}: "${specifier}"`);
    } else if (/\.(?:ts|tsx|js)$/.test(resolved)) {
      // `.js` is followed too: allowJs is on, so a plain JavaScript module can
      // sit in the server graph and carry broken imports of its own.
      queue.push(resolved);
    }
  }
}

const sections: string[] = [];

if (offenders.length > 0) {
  sections.push(
    "these relative imports are not loadable by Node. Vercel loads server.ts as\n" +
      "native ES modules, where they throw ERR_MODULE_NOT_FOUND at startup and\n" +
      "take down every /api route. Write the .js form shown (it resolves to the\n" +
      ".ts file):\n\n" +
      offenders.join("\n"),
  );
}

if (aliased.length > 0) {
  sections.push(
    "these imports use the @/ alias, which only a bundler and tsc understand.\n" +
      "Node reads it as a package name and throws ERR_MODULE_NOT_FOUND at\n" +
      "startup. Use the relative path shown:\n\n" +
      aliased.join("\n"),
  );
}

if (jsonOffenders.length > 0) {
  sections.push(
    "these JSON imports have no import attribute, so Node refuses them with\n" +
      'ERR_IMPORT_ATTRIBUTE_MISSING at startup. Add `with { type: "json" }`,\n' +
      "or read the file with fs at runtime:\n\n" +
      jsonOffenders.join("\n"),
  );
}

if (unresolved.length > 0) {
  sections.push(
    "these imports point at files that do not exist:\n\n" +
      unresolved.join("\n"),
  );
}

// Every category is reported together, so fixing one does not reveal the next
// on the following run.
if (sections.length > 0) {
  fail(sections);
}

console.log(
  `server imports: ${visited.size} files reachable from ${ENTRY}, all loadable by Node`,
);
