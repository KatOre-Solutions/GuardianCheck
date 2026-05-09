
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

function formatPrivateKey(key: string) {
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

async function seedPerfUsers() {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  
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

  console.log("Preparing 50 performance test users in Firestore...");

  const batch = db.batch();

  for (let i = 0; i < 50; i++) {
    const userId = `perf-user-${i}`;
    const userRef = db.collection("users").doc(userId);
    const policyRef = db.collection("policy_acceptance").doc(userId);
    const volRef = db.collection("volunteers").doc(userId);

    // 1. User Profile
    batch.set(userRef, {
      email: `perf-user-${i}@example.com`,
      role: "volunteer",
      churchId: CHURCH_ID,
      status: "active",
      firstName: "Perf",
      lastName: `User ${i}`,
      createdAt: new Date().toISOString()
    });

    // 2. Policy Acceptance
    batch.set(policyRef, {
      userId,
      email: `perf-user-${i}@example.com`,
      lastAcceptedVersion: POLICY_VERSION,
      acceptedAt: new Date().toISOString(),
      userAgent: "Performance Script"
    });

    // 3. Volunteer Entry (required by some business logic)
    batch.set(volRef, {
      churchId: CHURCH_ID,
      email: `perf-user-${i}@example.com`,
      userId: userId,
      status: "active",
      createdAt: new Date().toISOString()
    });
  }

  await batch.commit();

  console.log("Successfully seeded 50 test users with policies and roles.");
}

seedPerfUsers().catch(console.error);
