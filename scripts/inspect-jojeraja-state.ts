import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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

async function inspectJojerajaState() {
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
  const email = "jojeraja@denipl.net";
  
  console.log(`=== Inspecting jojeraja@denipl.net Firestore / Auth State ===`);

  // 1. Firebase Auth State
  try {
    const userAuthObj = await getAuth(adminApp).getUserByEmail(email);
    console.log("Firebase Auth:", {
      uid: userAuthObj.uid,
      email: userAuthObj.email,
      emailVerified: userAuthObj.emailVerified,
      disabled: userAuthObj.disabled,
      displayName: userAuthObj.displayName,
      tokensValidAfterTime: userAuthObj.tokensValidAfterTime
    });
  } catch (err: any) {
    console.log("Firebase Auth User error:", err.message);
  }

  // 2. Invitations state
  const invites = await db.collection("invitations").where("email", "==", email).get();
  console.log(`\nInvitations (Count: ${invites.size}):`);
  invites.forEach(doc => {
    console.log(`Invite ${doc.id}:`, JSON.stringify(doc.data(), null, 2));
  });

  // 3. User Document state
  const users = await db.collection("users").where("email", "==", email).get();
  console.log(`\nUser Profiles (Count: ${users.size}):`);
  users.forEach(doc => {
    console.log(`User Doc ${doc.id}:`, JSON.stringify(doc.data(), null, 2));
  });
}

inspectJojerajaState().catch(console.error);
