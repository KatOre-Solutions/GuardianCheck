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

async function preparePerfData() {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  
  if (getApps().length === 0) {
    const options: any = { projectId: firebaseConfig.projectId };
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      options.credential = cert({
        projectId: firebaseConfig.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      });
    }
    initializeApp(options);
  }
  
  const db = getFirestore(firebaseConfig.firestoreDatabaseId);
  
  console.log("Fetching volunteers for performance test pool...");
  const snapshot = await db.collection("users")
    .where("role", "in", ["volunteer", "admin"])
    .limit(50)
    .get();

  const testUsers = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      uid: doc.id,
      email: data.email,
      churchId: "perf-test-church",
      volunteerId: doc.id,
      childId: "perf-test-child", 
      roomId: "perf-test-room",
      serviceId: "perf-test-service",
      token: "PLACEHOLDER_TOKEN"
    };
  });

  // If we don't have enough users, fill with dummies
  while (testUsers.length < 50) {
    testUsers.push({
      uid: `dummy-${testUsers.length}`,
      email: `dummy-${testUsers.length}@example.com`,
      churchId: "perf-test-church",
      volunteerId: `dummy-vol-${testUsers.length}`,
      childId: "perf-test-child",
      roomId: "perf-test-room",
      serviceId: "perf-test-service",
      token: "PLACEHOLDER_TOKEN"
    });
  }

  const outputPath = path.join(process.cwd(), "test-users.json");
  fs.writeFileSync(outputPath, JSON.stringify(testUsers, null, 2));
  console.log(`Successfully generated ${testUsers.length} test user entries in ${outputPath}`);
  console.log("IMPORTANT: You must replace 'PLACEHOLDER_TOKEN' with valid Firebase ID Tokens.");
}

preparePerfData().catch(console.error);
