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

async function inspectEmailLogs() {
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
  const email = "jojeraja@denipl.net";
  
  console.log(`--- Fetching email logs for ${email} ---`);
  const logsSnap = await db.collection("email_logs")
    .where("recipientEmail", "==", email)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();
    
  if (logsSnap.empty) {
    console.log("No deep email logs found specifically for this email.");
  } else {
    logsSnap.forEach(doc => {
      console.log(`[${doc.data().timestamp}] Event: ${doc.data().eventType} | Status: ${doc.data().status} | Error: ${doc.data().errorMessage || "none"}`);
      console.log("Details:", JSON.stringify(doc.data(), null, 2));
    });
  }

  console.log("\n--- Fetching recent failed email logs ---");
  const failedSnap = await db.collection("email_logs")
    .where("status", "==", "failed")
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();
    
  if (failedSnap.empty) {
    console.log("No recent failed email logs found.");
  } else {
    failedSnap.forEach(doc => {
      console.log(`[${doc.data().timestamp}] Email: ${doc.data().recipientEmail} | Event: ${doc.data().eventType} | Status: ${doc.data().status} | Error: ${doc.data().errorMessage || "none"}`);
    });
  }
}

inspectEmailLogs().catch(console.error);
