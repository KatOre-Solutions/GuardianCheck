import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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

async function testResendJojeraja() {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  
  let adminApp: any;
  if (getApps().length === 0) {
    const options: any = { projectId: firebaseConfig.projectId };
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      options.credential = cert({
        projectId: firebaseConfig.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      });
    }
    adminApp = initializeApp(options);
  } else {
    adminApp = getApps()[0];
  }
  
  const db = getFirestore(firebaseConfig.firestoreDatabaseId);
  const emailService = new EmailService(db);
  
  const email = "jojeraja@denipl.net";
  const uid = "Cfvb1FxhnjfM2gWmBWHUZt1S32D3"; // Active UID
  
  console.log(`[DIAGNOSTIC] Running resend verification code simulation for:`);
  console.log(`  UID: ${uid}`);
  console.log(`  Email: ${email}`);

  try {
    // 1. Fetch user data to get firstName
    console.log("Step 1: Fetching users doc...");
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new Error(`User doc with UID ${uid} does not exist in Firestore!`);
    }
    const userData = userDoc.data() || {};
    const firstName = userData.firstName || "there";
    console.log(`  Found firstName: "${firstName}"`);
    
    // 2. Fetch church name
    console.log("Step 2: Fetching church name...");
    let churchName = "GuardianCheck";
    if (userData.churchId) {
      const churchDoc = await db.collection("churches").doc(userData.churchId).get();
      if (churchDoc.exists) {
        churchName = churchDoc.data().name;
      }
    }
    console.log(`  Found churchName: "${churchName}"`);

    // 3. Generate Link
    console.log("Step 3: Generating Firebase Auth Email Verification Link...");
    const actionCodeSettings = {
      url: "https://guardiancheck.co.za/login"
    };
    const verificationLink = await getAuth(adminApp).generateEmailVerificationLink(email, actionCodeSettings);
    console.log(`  Generated Link successfully: ${verificationLink}`);

    // 4. Send via Resend
    console.log("Step 4: Sending via Resend client...");
    await emailService.sendVerificationEmail(email, firstName, churchName, verificationLink);
    console.log("=== SUCCESS: Verification email resent successfully in diagnostic script! ===");
  } catch (error: any) {
    console.error("=== DIAGNOSTIC FAILURE ===");
    console.error(`Error Code: ${error.code || "N/A"}`);
    console.error(`Error Message: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testResendJojeraja().catch(console.error);
