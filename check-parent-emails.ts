
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

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

async function checkParentEmails() {
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
  const parentId = "8gMG1k7tZ2YeBpOF0sQ1fKxRIRE2";
  
  const parentDoc = await db.collection("users").doc(parentId).get();
  if (!parentDoc.exists) {
    console.log("Parent not found.");
    return;
  }
  
  const email = parentDoc.data().email;
  console.log(`Parent Email: ${email}`);
  
  const logs = await db.collection("email_logs")
    .where("recipientEmail", "==", email)
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();
    
  if (logs.empty) {
    console.log("No logs found for this email.");
  } else {
    logs.forEach(doc => {
      const data = doc.data();
      console.log(`[${data.timestamp}] Event: ${data.eventType} | Status: ${data.status} ${data.errorMessage ? '| Error: ' + data.errorMessage : ''}`);
    });
  }
}

checkParentEmails().catch(console.error);
