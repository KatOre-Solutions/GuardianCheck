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

async function inspectAllTypesOfLogs() {
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
  const todayStr = "2026-05-22";
  
  console.log(`--- SYSTEM LOGS FOR ${todayStr} ---`);
  const logsSnap = await db.collection("logs")
    .where("timestamp", ">=", todayStr)
    .orderBy("timestamp", "desc")
    .limit(200)
    .get();
    
  if (logsSnap.empty) {
    console.log("No system logs found for today.");
  } else {
    for (const doc of logsSnap.docs) {
      const data = doc.data();
      const time = data.timestamp;
      console.log(`[${time}] ${data.level || "INFO"}: ${data.message}`);
      if (data.context) {
        console.log("  Context:", JSON.stringify(data.context, null, 2));
      }
    }
  }

  console.log(`\n--- EMAIL LOGS FOR ${todayStr} ---`);
  const emailLogsSnap = await db.collection("email_logs")
    .where("timestamp", ">=", todayStr)
    .orderBy("timestamp", "desc")
    .limit(50)
    .get();
    
  if (emailLogsSnap.empty) {
    console.log("No email logs found for today.");
  } else {
    for (const doc of emailLogsSnap.docs) {
      const data = doc.data();
      console.log(`[${data.timestamp}] Event: ${data.eventType} | Recipient: ${data.recipientEmail} | Status: ${data.status} | Error: ${data.errorMessage || "None"}`);
      if (data.metadata) {
        console.log("  Metadata:", JSON.stringify(data.metadata));
      }
    }
  }
}

inspectAllTypesOfLogs().catch(console.error);
