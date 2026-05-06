
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

async function fixChurchData() {
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
  const churchId = "aeZ8BIL4njwzJKglkWEX";
  const churchRef = db.collection("churches").doc(churchId);
  const doc = await churchRef.get();

  if (doc.exists) {
    const data = doc.data()!;
    const trialEndsAt = data.subscription?.trialEndsAt;
    
    if (trialEndsAt) {
      const trialEndDate = new Date(trialEndsAt);
      const nextBillingDate = new Date(trialEndDate);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      
      console.log(`Fixing church ${churchId}`);
      console.log(`Trial Ends: ${trialEndsAt}`);
      console.log(`New Next Billing Date: ${nextBillingDate.toISOString()}`);
      
      await churchRef.update({
        nextBillingDate: nextBillingDate.toISOString(),
        "subscription.billingDate": nextBillingDate.toISOString(),
        "subscription.status": "active",
        status: "active"
      });
      
      console.log("Update successful.");
    } else {
      console.log("No trialEndsAt found for this church.");
    }
  } else {
    console.log("Church not found.");
  }
}

fixChurchData().catch(console.error);
