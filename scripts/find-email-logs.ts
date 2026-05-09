
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

async function findEmailLogs() {
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
  
  const email = process.argv[2] || "ryzyfody@forexzig.com";
  console.log(`Checking all logs for ${email}...`);
  
  const snapshot = await db.collection("email_logs")
    .where("recipientEmail", "==", email)
    .get();
    
  if (snapshot.empty) {
    console.log("No email logs found.");
  } else {
    snapshot.forEach(doc => {
      console.log("Email Log:", JSON.stringify(doc.data(), null, 2));
    });
  }

  console.log("\nChecking general logs for this email...");
  const logsSnapshot = await db.collection("logs")
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();

  logsSnapshot.forEach(doc => {
    const data = doc.data();
    if (JSON.stringify(data).toLowerCase().includes(email.toLowerCase())) {
        console.log("General Log:", JSON.stringify({ id: doc.id, ...data }, null, 2));
    }
  });
}

findEmailLogs().catch(console.error);
