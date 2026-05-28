
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

async function seedPerfData() {
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
  
  console.log("Seeding performance test data...");

  // 1. Create Test Church
  const churchRef = db.collection("churches").doc("perf-test-church");
  await churchRef.set({
    name: "Performance Test Church",
    slug: "perf-test",
    status: "active",
    planTier: "premium",
    createdAt: new Date().toISOString(),
    settings: {
        checkinEnabled: true,
        allowMoveRoom: true
    }
  });

  // 2. Create Test Room
  const roomRef = db.collection("rooms").doc("perf-test-room");
  await roomRef.set({
    churchId: "perf-test-church",
    name: "Main Auditorium",
    capacity: 1000,
    isActive: true,
    createdAt: new Date().toISOString()
  });

  // 3. Create Test Service/Event
  const serviceRef = db.collection("services").doc("perf-test-service");
  await serviceRef.set({
    churchId: "perf-test-church",
    name: "Sunday Morning Service",
    startTime: "09:00",
    isActive: true,
    days: ["Sunday"],
    createdAt: new Date().toISOString()
  });

  // 4. Create Test Child
  const childRef = db.collection("children").doc("perf-test-child");
  await childRef.set({
    churchId: "perf-test-church",
    firstName: "Test",
    lastName: "Child",
    dateOfBirth: "2020-01-01",
    parentId: "system",
    status: "active",
    createdAt: new Date().toISOString()
  });

  console.log("Successfully seeded test data.");
  console.log("- Church ID: perf-test-church");
  console.log("- Room ID: perf-test-room");
  console.log("- Service ID: perf-test-service");
  console.log("- Child ID: perf-test-child");
}

seedPerfData().catch(console.error);
