
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

async function inspectDb() {
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

  console.log("--- SEARCHING FOR CHURCH (st-paul-methodist) ---");
  const churchSnap = await db.collection("churches").get();
  let foundChurchId = null;
  churchSnap.forEach(doc => {
    const data = doc.data();
    if (data.slug === "st-paul-methodist" || data.name?.toLowerCase().includes("st paul")) {
      console.log("Found Church:", doc.id, "=>", JSON.stringify(data.subscription || {}, null, 2));
      console.log("Status:", data.status, "Plan:", data.plan);
      foundChurchId = doc.id;
    }
  });

  if (!foundChurchId) {
    console.log("Church 'st-paul-methodist' not found in this DB.");
  }

  console.log("\n--- LATEST TRANSACTIONS ---");
  const transSnap = await db.collection("transactions").orderBy("createdAt", "desc").limit(10).get();
  if (transSnap.empty) {
    console.log("No transactions found.");
  } else {
    transSnap.forEach(doc => {
      console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2));
    });
  }

  console.log("\n--- ALL RECENT LOGS (Last 20) ---");
  const logsSnap = await db.collection("logs").orderBy("timestamp", "desc").limit(20).get();
  if (logsSnap.empty) {
    console.log("No logs found.");
  } else {
    logsSnap.forEach(doc => {
      const data = doc.data();
      console.log(doc.id, "=>", data.timestamp, `[${data.level}]`, data.message);
    });
  }
}

inspectDb().catch(console.error);
