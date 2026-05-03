
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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

async function checkUserStatus() {
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
  
  const auth = getAuth();
  const db = getFirestore(firebaseConfig.firestoreDatabaseId);
  const email = "oreutlwilediutlwileng@gmail.com";
  
  try {
    const userRecord = await auth.getUserByEmail(email);
    console.log("Auth User:", JSON.stringify({
      uid: userRecord.uid,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified
    }, null, 2));
    
    const userDoc = await db.collection("users").doc(userRecord.uid).get();
    if (userDoc.exists) {
      console.log("User Document:", JSON.stringify(userDoc.data(), null, 2));
    } else {
      console.log("No User Document found for UID:", userRecord.uid);
    }
  } catch (error: any) {
    console.error("Error checking user status:", error.message);
  }
}

checkUserStatus().catch(console.error);
