
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

function formatPrivateKey(key: string) {
  if (!key) return "";
  let privateKey = key.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
  if (privateKey.startsWith("'") && privateKey.endsWith("'")) privateKey = privateKey.slice(1, -1);
  privateKey = privateKey.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    const rawKey = privateKey.replace(/\s/g, "");
    let formattedKey = "-----BEGIN PRIVATE KEY-----\n";
    for (let i = 0; i < rawKey.length; i += 64) {
      formattedKey += rawKey.substring(i, i + 64) + "\n";
    }
    formattedKey += "-----END PRIVATE KEY-----";
    privateKey = formattedKey;
  }
  return privateKey;
}

async function ensurePerfUsers() {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const usersPath = path.join(process.cwd(), "test-users.json");
  if (!fs.existsSync(usersPath)) {
    console.error("ERROR: test-users.json not found. Run prepare-perf-data.ts first.");
    process.exit(1);
  }

  const testUsers = JSON.parse(fs.readFileSync(usersPath, "utf8"));
  
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: firebaseConfig.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY!),
      }),
    });
  }
  
  const db = getFirestore(firebaseConfig.firestoreDatabaseId);
  const CHURCH_ID = "perf-test-church";
  const POLICY_VERSION = "1.0";

  console.log(`Synchronizing ${testUsers.length} performance test users with Firestore...`);

  let count = 0;
  const chunk = (arr: any[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
      arr.slice(i * size, i * size + size)
    );

  const userChunks = chunk(testUsers, 100);

  for (const users of userChunks) {
    const batch = db.batch();
    for (const user of users) {
      if (!user.uid || user.uid === "PLACEHOLDER") continue;

      const userRef = db.collection("users").doc(user.uid);
      const policyRef = db.collection("policy_acceptance").doc(user.uid);
      const volRef = db.collection("volunteers").doc(user.uid);

      // 1. User Profile
      batch.set(userRef, {
        email: user.email,
        role: "volunteer",
        churchId: CHURCH_ID,
        status: "active",
        firstName: "Perf",
        lastName: `VU`,
        createdAt: new Date().toISOString()
      }, { merge: true });

      // 2. Policy Acceptance
      batch.set(policyRef, {
        userId: user.uid,
        email: user.email,
        lastAcceptedVersion: POLICY_VERSION,
        acceptedAt: new Date().toISOString(),
        userAgent: "Performance Sync Script"
      }, { merge: true });

      // 3. Volunteer Entry
      batch.set(volRef, {
        churchId: CHURCH_ID,
        email: user.email,
        userId: user.uid,
        status: "active",
        createdAt: new Date().toISOString()
      }, { merge: true });
      
      count++;
    }
    await batch.commit();
    console.log(`...processed ${count} users`);
  }

  console.log("Successfully synchronized test users with Firestore.");
}

ensurePerfUsers().catch(console.error);
