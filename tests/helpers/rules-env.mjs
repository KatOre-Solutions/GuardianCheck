import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

// Previous suites can still be disconnecting when the next suite clears data.
export async function clearFirestoreWithRetry(env, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await env.clearFirestore();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250 * i));
    }
  }
}

/** Each suite owns its counters, while output and failure handling stay shared. */
export function createRulesReporter() {
  let pass = 0;
  let fail = 0;
  return {
    async check(label, mode, fn) {
      try {
        await (mode === "deny" ? assertFails(fn()) : assertSucceeds(fn()));
        console.log(`  PASS  [${mode.toUpperCase()}] ${label}`);
        pass++;
      } catch (e) {
        console.log(`  FAIL  [${mode.toUpperCase()}] ${label}\n        ${String(e.message).split("\n")[0]}`);
        fail++;
      }
    },
    report() { console.log(`\n${pass} passed, ${fail} failed\n`); },
    get exitCode() { return fail === 0 ? 0 : 1; },
  };
}
