import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = await initializeTestEnvironment({
  projectId: "gc-rules-test",
  storage: {
    rules: readFileSync(path.join(root, "storage.rules"), "utf8"),
    host: "127.0.0.1",
    port: 9199,
  },
});

try {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.storage("gs://gc-rules-test.firebasestorage.app");
    for (const objectPath of [
      "children/123TestChurch/parent-a/photo.jpg",
      "children/parent-a/old.jpg",
      "guardians/parent-a/old.jpg",
      "profiles/parent-a/photo.jpg",
      "churches/123TestChurch/logo_public.png",
      "churches/123TestChurch/private.txt",
    ]) {
      await admin.ref(objectPath).put(new Uint8Array([1, 2, 3]), { contentType: "image/png" });
    }
  });
  const anonymous = env.unauthenticatedContext().storage("gs://gc-rules-test.firebasestorage.app");
  const parent = env.authenticatedContext("parent-a").storage("gs://gc-rules-test.firebasestorage.app");
  const adminUser = env.authenticatedContext("admin-a").storage("gs://gc-rules-test.firebasestorage.app");
  for (const storage of [anonymous, parent, adminUser]) {
    for (const objectPath of ["children/123TestChurch/parent-a/photo.jpg", "children/parent-a/old.jpg", "guardians/parent-a/old.jpg", "profiles/parent-a/photo.jpg", "churches/123TestChurch/private.txt"]) {
      await assertFails(storage.ref(objectPath).getMetadata());
      await assertFails(storage.ref(objectPath).put(new Uint8Array([4]), { contentType: "image/png" }));
    }
    await assertSucceeds(storage.ref("churches/123TestChurch/logo_public.png").getMetadata());
    await assertFails(storage.ref("churches/123TestChurch/logo_new.png").put(new Uint8Array([4]), { contentType: "image/png" }));
  }
  console.log("Storage Rules private denial and public logo tests passed");
} finally {
  await env.cleanup();
}
