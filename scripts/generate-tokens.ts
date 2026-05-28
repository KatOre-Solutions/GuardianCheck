
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// Use the web API key for your Firebase project
const API_KEY = process.env.VITE_FIREBASE_API_KEY || "YOUR_WEB_API_KEY";

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

async function getTokens() {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: firebaseConfig.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY!),
      }),
    });
  }

  // Load the test users we generated earlier
  const usersPath = path.join(process.cwd(), "test-users.json");
  if (!fs.existsSync(usersPath)) {
    console.error("Please run prepare-perf-data.ts first!");
    return;
  }
  const users = JSON.parse(fs.readFileSync(usersPath, "utf-8"));

  console.log(`Generating ID Tokens for ${users.length} users...`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      // 1. Create a custom token for the UID
      const customToken = await getAuth().createCustomToken(user.uid);

      // 2. Exchange custom token for an ID token via REST API
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
        {
          token: customToken,
          returnSecureToken: true,
        }
      );

      users[i].token = response.data.idToken;
      console.log(`[${i+1}/${users.length}] Token generated for ${user.email}`);
    } catch (err: any) {
      console.error(`Failed for ${user.email}:`, err.response?.data?.error?.message || err.message);
    }
  }

  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  console.log("\nSuccess! test-users.json has been updated with real ID Tokens.");
}

getTokens().catch(console.error);
