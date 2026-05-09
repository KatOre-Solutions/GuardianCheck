
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";

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

async function testAcceptInvite() {
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
  const testEmail = `test-volunteer-${Date.now()}@example.com`;
  const token = crypto.randomBytes(32).toString("hex");
  
  console.log(`Creating test invitation for ${testEmail}...`);
  await db.collection("invitations").add({
    email: testEmail,
    firstName: "Test",
    lastName: "Volunteer",
    role: "volunteer",
    roles: ["volunteer"],
    churchId: "9HuAV8EUTom5SRvm5uQr", // People Church
    churchSlug: "people-church",
    churchName: "People Church",
    status: "pending",
    token,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString()
  });

  console.log(`Simulating invite acceptance via API...`);
  try {
    const response = await axios.post("http://localhost:3000/api/accept-invite", {
        token,
        password: "Password123!"
    });
    console.log("Response:", response.data);
    
    console.log("Waiting 5 seconds for async email process...");
    await new Promise(r => setTimeout(r, 5000));
    
    console.log("Checking logs for the new test user...");
    const logs = await db.collection("email_logs")
        .where("recipientEmail", "==", testEmail)
        .get();
        
    if (logs.empty) {
        console.log("FAIL: No email logs found for test user.");
    } else {
        logs.forEach(doc => {
            console.log("Email Log Found:", JSON.stringify(doc.data(), null, 2));
        });
    }

    const generalLogs = await db.collection("logs")
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();
    
    console.log("Recent General Logs:");
    generalLogs.forEach(doc => {
        const data = doc.data();
        if (JSON.stringify(data).includes(testEmail)) {
            console.log("Found Log matching email:", JSON.stringify(data, null, 2));
        } else {
            console.log(`[${data.timestamp}] ${data.level}: ${data.message}`);
        }
    });

  } catch (err: any) {
    console.error("API Error:", err.response?.data || err.message);
  }
}

testAcceptInvite().catch(console.error);
