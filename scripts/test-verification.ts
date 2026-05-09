
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { EmailService } from "../emailService.js";

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

async function testVerificationEmail() {
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
  const emailService = new EmailService(db);
  
  const targetEmail = "oreutlwilediutlwileng@gmail.com";
  console.log(`Sending test verification email to ${targetEmail}...`);
  
  try {
    // We override isDev to see internal logs
    (process.env as any).VITE_DEV_MODE = "true";
    
    await emailService.sendVerificationEmail(
      targetEmail, 
      "TestUser", 
      "Test Church", 
      "https://guardiancheck.co.za/verify?token=test-token"
    );
    console.log("Success! Verification email sent.");
  } catch (error: any) {
    console.error("FAILURE:");
    console.error(error.message);
  }
}

testVerificationEmail().catch(console.error);
