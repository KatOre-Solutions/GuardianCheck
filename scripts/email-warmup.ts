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

async function warmupEmail() {
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
  console.log(`[WARM-UP] Starting Warm-Up email delivery to ${targetEmail}...`);
  
  try {
    // Override isDev for verbose logging
    (process.env as any).VITE_DEV_MODE = "true";
    
    // Check if key is available
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "re_...") {
      throw new Error("RESEND_API_KEY environment variable is not defined or is placeholder. Please check your settings.");
    }
    
    await emailService.sendVerificationEmail(
      targetEmail, 
      "Demo Owner", 
      "GuardianCheck Demo Center", 
      "https://guardiancheck.co.za/verify?token=demo-warmup-token"
    );
    console.log("-----------------------------------------");
    console.log("SUCCESS: Warm-Up email was sent successfully to " + targetEmail);
    console.log("Your Resend API is warm, and the connection is active and ready for the demo!");
    console.log("-----------------------------------------");
  } catch (error: any) {
    console.error("-----------------------------------------");
    console.error("WARM-UP FAILURE:");
    console.error(error.message || error);
    console.error("Please ensure RESEND_API_KEY is correctly set in your environment variables / Settings configuration.");
    console.error("-----------------------------------------");
    process.exit(1);
  }
}

warmupEmail().catch(console.error);
