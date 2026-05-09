
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

async function inspectRecentErrors() {
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
  
  console.log("--- Logs from the last 30 minutes ---");
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  const snapshot = await db.collection("logs")
    .where("timestamp", ">=", thirtyMinutesAgo)
    .orderBy("timestamp", "desc")
    .get();
  
  if (snapshot.empty) {
    console.log("No recent logs found.");
  } else {
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`[${data.timestamp}] ${data.level}: ${data.message}`);
      if (data.context) console.log("Context:", JSON.stringify(data.context, null, 2));
    });
  }

  console.log("\n--- Email Logs from the last 30 minutes ---");
  const emailSnapshot = await db.collection("email_logs")
    .where("timestamp", ">=", thirtyMinutesAgo)
    .orderBy("timestamp", "desc")
    .get();

  if (emailSnapshot.empty) {
    console.log("No recent email logs.");
  } else {
    emailSnapshot.forEach(doc => {
        console.log("Email Log:", JSON.stringify(doc.data(), null, 2));
    });
  }
}

inspectRecentErrors().catch(console.error);
