import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { addMonths, format, parseISO } from "date-fns";

// Initialize Firebase Admin
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

let db: any;

if (!getApps().length) {
  try {
    const hasServiceAccount = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
    
    const options: any = {
      projectId: firebaseConfig.projectId,
    };

    if (hasServiceAccount) {
      options.credential = cert({
        projectId: firebaseConfig.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      });
    }
    
    initializeApp(options);
    db = getFirestore(firebaseConfig.firestoreDatabaseId);
  } catch (error) {
    console.warn("Firebase Admin initialization failed. Server-side Firestore operations may fail.", error);
    // Fallback to uninitialized db to prevent crash, but operations will fail later if called
  }
} else {
  db = getFirestore(firebaseConfig.firestoreDatabaseId);
}

const app = express();

// PayFast Helper: Generate Signature
function generateSignature(data: any, passphrase?: string) {
  let queryString = "";
  Object.keys(data).forEach((key) => {
    if (key !== "signature" && data[key] !== "") {
      queryString += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, "+")}&`;
    }
  });

  if (passphrase) {
    queryString += `passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  } else {
    queryString = queryString.substring(0, queryString.length - 1);
  }

  return crypto.createHash("md5").update(queryString).digest("hex");
}

async function startServer() {
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // PayFast ITN Webhook
  app.post("/api/payfast-itn", async (req, res) => {
    const data = req.body;
    console.log("PayFast ITN Received:", data);

    try {
      // 1. Validate Signature
      const passphrase = process.env.PAYFAST_PASSPHRASE;
      const signature = generateSignature(data, passphrase);
      
      if (signature !== data.signature) {
        console.error("Invalid PayFast Signature");
        return res.status(400).send("Invalid Signature");
      }

      // 2. Ping-back to PayFast to verify data
      const sandbox = process.env.PAYFAST_SANDBOX === "true";
      const pfHost = sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za";
      const validateUrl = `https://${pfHost}/eng/query/validate`;
      
      const params = new URLSearchParams();
      Object.keys(data).forEach(key => params.append(key, data[key]));
      
      const validationResponse = await axios.post(validateUrl, params.toString());
      
      if (validationResponse.data !== "VALID") {
        console.error("PayFast Data Validation Failed:", validationResponse.data);
        return res.status(400).send("Validation Failed");
      }

      // 3. Process Payment
      if (data.payment_status === "COMPLETE") {
        const churchId = data.custom_str1; // We passed churchId here
        const plan = data.custom_str2; // We passed plan here
        
        if (!churchId) {
          console.error("Missing churchId in ITN data");
          return res.status(400).send("Missing churchId");
        }

        const churchRef = db.collection("churches").doc(churchId);
        const churchDoc = await churchRef.get();

        if (churchDoc.exists) {
          const now = new Date();
          // Correctly handle month lengths using date-fns
          const nextBilling = addMonths(now, 1);

          await churchRef.update({
            status: "active",
            plan: plan || churchDoc.data()?.plan || "starter",
            lastPaymentDate: now.toISOString(),
            nextBillingDate: nextBilling.toISOString(),
            updatedAt: now.toISOString(),
            payfast_m_payment_id: data.m_payment_id,
            payfast_pf_payment_id: data.pf_payment_id
          });

          // Log transaction
          await db.collection("transactions").add({
            churchId,
            amount: data.amount_gross,
            plan,
            payfast_pf_payment_id: data.pf_payment_id,
            status: "complete",
            createdAt: now.toISOString()
          });

          console.log(`Church ${churchId} subscription updated to active.`);
        }
      }

      res.status(200).send("OK");
    } catch (error) {
      console.error("Error processing PayFast ITN:", error);
      res.status(500).send("Internal Error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only listen if not on Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
