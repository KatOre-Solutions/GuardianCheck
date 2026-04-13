import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { addMonths, format, parseISO } from "date-fns";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { EmailService } from "./emailService.ts";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import NodeCache from "node-cache";
import { CURRENT_POLICY_VERSION } from "../src/constants/legalContent.ts";

// TTL Cache for Firestore reads (60 seconds default)
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

declare global {
  namespace Express {
    interface Request {
      user?: any;
      traceId: string;
      startTime: number;
      firestoreOps: { reads: number; writes: number };
    }
  }
}

// Initialize Firebase Admin
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any;
try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!firebaseConfig.projectId) {
    console.error("firebase-applet-config.json is missing projectId");
  }
} catch (error) {
  console.error("Failed to read firebase-applet-config.json:", error);
  firebaseConfig = {};
}

let db: any;
let adminApp: any;

const initializeFirebase = () => {
  try {
    console.log("Current working directory:", process.cwd());
    console.log("Firebase Config loaded:", JSON.stringify({
      projectId: firebaseConfig.projectId,
      hasDatabaseId: !!firebaseConfig.firestoreDatabaseId,
      databaseId: firebaseConfig.firestoreDatabaseId
    }));

    if (getApps().length > 0) {
      adminApp = getApps()[0];
      console.log("Using existing Firebase Admin app.");
    } else {
      const hasServiceAccount = !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
      console.log("Initializing Firebase Admin. Service Account Present:", hasServiceAccount);
      
      if (!hasServiceAccount) {
        console.warn("FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY is missing. Firebase Admin may not function correctly.");
      }
      
      const options: any = {
        projectId: firebaseConfig.projectId,
      };

      if (hasServiceAccount) {
        try {
          let privateKey = process.env.FIREBASE_PRIVATE_KEY!.trim();
          const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
          
          console.log(`Using Service Account Email: ${clientEmail}`);
          console.log(`Project ID from Config: ${firebaseConfig.projectId}`);

          // Remove surrounding quotes if present
          if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
          }
          if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
            privateKey = privateKey.slice(1, -1);
          }

          // Handle escaped newlines and carriage returns
          privateKey = privateKey.replace(/\\n/g, "\n").replace(/\\r/g, "\r");

          // Check if it's base64 encoded
          if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") && !privateKey.includes(" ")) {
            try {
              const decoded = Buffer.from(privateKey, 'base64').toString('utf8');
              if (decoded.includes("BEGIN PRIVATE KEY")) {
                console.log("Detected base64 encoded private key, decoded successfully.");
                privateKey = decoded;
              }
            } catch (e) {
              // Not base64 or failed to decode, ignore
            }
          }

          // Ensure it has the correct PEM headers
          privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").trim();
          const rawKey = privateKey.replace(/\s/g, "");
          let formattedKey = "-----BEGIN PRIVATE KEY-----\n";
          for (let i = 0; i < rawKey.length; i += 64) {
            formattedKey += rawKey.substring(i, i + 64) + "\n";
          }
          formattedKey += "-----END PRIVATE KEY-----";
          privateKey = formattedKey;
          
          console.log(`Private key processed. Length: ${privateKey.length} characters.`);

          options.credential = cert({
            projectId: firebaseConfig.projectId,
            clientEmail: clientEmail,
            privateKey: privateKey,
          });
        } catch (certError: any) {
          console.error("Failed to create Firebase credential from environment variables:", certError.message);
        }
      }

      // If no credential yet, try Application Default Credentials
      if (!options.credential) {
        try {
          console.log("No service account credentials found, attempting to use Application Default Credentials...");
          // In some environments, initializeApp() without options uses ADC automatically
        } catch (adcError: any) {
          console.warn("Failed to prepare Application Default Credentials:", adcError.message);
        }
      }
      
      adminApp = initializeApp(options);
      console.log("Firebase Admin app initialized.");
    }

    // Initialize Firestore with fallback
    try {
      const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
      db = getFirestore(adminApp, dbId);
      console.log(`Firestore initialized with database ID: ${dbId}`);
      
      // Verify access immediately
      db.listCollections().then(collections => {
        console.log(`Successfully connected to Firestore. Accessible collections: ${collections.map(c => c.id).join(", ") || "none (empty database)"}`);
      }).catch(err => {
        console.error(`CRITICAL: Firestore access check failed for database '${dbId}':`, err.message);
        if (err.message.includes("PERMISSION_DENIED")) {
          console.error("This is a service account permission issue. Please ensure the service account has 'Firebase Firestore Admin' or 'Cloud Datastore Owner' role.");
        }
      });
    } catch (fsError: any) {
      console.error("Failed to initialize Firestore reference:", fsError.message);
      db = getFirestore(adminApp);
    }

    console.log("Firebase Admin initialization complete.");
  } catch (error: any) {
    console.error("Firebase Admin initialization failed critical error:", error.message);
    if (error.stack) console.error(error.stack);
  }
};

initializeFirebase();

const emailService = new EmailService(db);

const app = express();

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now to avoid breaking the frontend assets/iframe
  crossOriginEmbedderPolicy: false
}));

// Trace ID & Structured Logging Middleware
app.use((req, res, next) => {
  // Only log API requests
  if (!req.originalUrl.startsWith("/api")) {
    return next();
  }

  req.traceId = uuidv4();
  req.startTime = Date.now();
  req.firestoreOps = { reads: 0, writes: 0 };
  
  res.setHeader("X-Trace-Id", req.traceId);
  res.setHeader('Content-Type', 'application/json');
  
  // Capture response finish to log
  res.on("finish", () => {
    const duration = Date.now() - req.startTime;
    const logData = {
      traceId: req.traceId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.uid || "unauthenticated",
      churchId: req.user?.churchId || "none",
      firestore: req.firestoreOps
    };
    
    console.log(`[API_LOG] ${JSON.stringify(logData)}`);
    
    // Cost Guardrail: Log warning for heavy requests
    if (req.firestoreOps.reads > 10 || req.firestoreOps.writes > 5) {
      console.warn(`[COST_WARNING] High Firestore usage on ${req.originalUrl}:`, req.firestoreOps);
    }
  });
  
  next();
});

// Rate Limiting
const keyGenerator = (req: any) => {
  return req.user?.uid || req.ip;
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator,
  message: { error: "Too many requests, please try again later." }
});

const peakLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // High capacity for Sunday rush
  keyGenerator,
  message: { error: "System busy, please try again in a few minutes." }
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator,
  message: { error: "Too many attempts, please try again later." }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Strict IP-based limit for registration
  keyGenerator: (req) => req.ip,
  message: { error: "Too many registration attempts. Please try again in an hour." }
});

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Very strict for PIN verification
  keyGenerator,
  message: { error: "Too many PIN attempts. Please try again later." }
});

// Validation Middleware
const validate = (schema: z.ZodObject<any>) => (req: any, res: any, next: any) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        errorType: "validation",
        traceId: req.traceId,
        details: error.issues.map(e => ({ path: e.path.join("."), message: e.message }))
      });
    }
    next(error);
  }
};

// Zod Schemas
const CheckInSchema = z.object({
  childId: z.string().min(1),
  roomId: z.string().min(1),
  serviceId: z.string().min(1),
  volunteerId: z.string().min(1),
  volunteerName: z.string().optional(), // We'll fetch this server-side but allow it for backward compat
  childName: z.string().optional(),
  roomName: z.string().optional(),
  serviceName: z.string().optional(),
  eventId: z.string().optional(),
  eventName: z.string().optional(),
  qrCode: z.string().optional(),
  checkedInBy: z.string().min(1)
});

const CheckOutSchema = z.object({
  checkinId: z.string().min(1),
  volunteerId: z.string().min(1),
  volunteerName: z.string().optional(),
  guardianId: z.string().optional(),
  guardianName: z.string().optional(),
  overrideReason: z.string().optional()
});

const InviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["parent", "volunteer", "admin", "master_admin"])
});

const RegisterChurchSchema = z.object({
  churchName: z.string().min(3).max(100),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().min(1)
});

const VerifyPinSchema = z.object({
  pin: z.string().length(4)
});

const MoveRoomSchema = z.object({
  checkinId: z.string().min(1),
  newRoomId: z.string().min(1),
  newRoomName: z.string().optional(),
  volunteerId: z.string().min(1),
  volunteerName: z.string().optional()
});

// Auth Middleware
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  if (!adminApp || !db) {
    console.log("Attempting lazy Firebase initialization in middleware...");
    initializeFirebase();
  }

  if (!adminApp || !db) {
    const missing = [];
    if (!adminApp) missing.push("adminApp");
    if (!db) missing.push("db");
    console.error(`Firebase Admin not initialized (${missing.join(", ")}). Cannot verify token.`);
    return res.status(500).json({ 
      error: "Server configuration error: Firebase not initialized.",
      details: `Missing components: ${missing.join(", ")}`
    });
  }

  try {
    const decodedToken = await getAuth(adminApp).verifyIdToken(token);
    
    // Fetch user data from Firestore to get churchId and role
    let userDoc;
    try {
      userDoc = await db.collection("users").doc(decodedToken.uid).get();
    } catch (fsError: any) {
      console.error("Firestore read failed in middleware:", fsError.message);
      
      const isPermissionDenied = fsError.message.includes("PERMISSION_DENIED");
      const isNotFound = fsError.message.includes("NOT_FOUND");

      if ((isPermissionDenied || isNotFound) && firebaseConfig.firestoreDatabaseId) {
        console.log(`Issue with database ${firebaseConfig.firestoreDatabaseId} (${isPermissionDenied ? "Permission Denied" : "Not Found"}), attempting fallback to default database...`);
        try {
          const defaultDb = getFirestore(adminApp);
          userDoc = await defaultDb.collection("users").doc(decodedToken.uid).get();
          // If successful, update the global db reference
          db = defaultDb;
          console.log("Successfully fell back to default database.");
        } catch (fallbackError: any) {
          console.error("Fallback to default database also failed:", fallbackError.message);
          
          if (fallbackError.message.includes("NOT_FOUND")) {
            throw new Error(`The database '${firebaseConfig.firestoreDatabaseId}' was not found or is inaccessible, and the default database also does not exist. This can happen if the project is new and the database hasn't been fully provisioned yet. Please wait a few minutes or check the Firebase Console.`);
          }
          
          throw new Error(`Permission denied on both named and default databases. Service Account: ${process.env.FIREBASE_CLIENT_EMAIL || "Unknown"}. Project: ${firebaseConfig.projectId}. Please ensure the service account has the 'Cloud Datastore User' role.`);
        }
      } else {
        throw fsError;
      }
    }

    if (userDoc && userDoc.exists) {
      const userData = userDoc.data();
      req.user = {
        ...decodedToken,
        churchId: userData.churchId,
        role: userData.role,
        status: userData.status
      };
    } else {
      req.user = decodedToken;
    }
    
    next();
  } catch (error: any) {
    console.error("Token verification failed:", error);
    // Ensure we return JSON even if something unexpected happens
    if (!res.headersSent) {
      return res.status(401).json({ 
        error: "Invalid token or authentication failed", 
        details: error.message,
        code: error.code || "AUTH_ERROR"
      });
    }
  }
};

// Policy Acceptance Middleware
const requirePolicyAcceptance = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const acceptanceDoc = await db.collection("policy_acceptance").doc(req.user.uid).get();
    req.firestoreOps.reads++;

    if (!acceptanceDoc.exists || acceptanceDoc.data().lastAcceptedVersion !== CURRENT_POLICY_VERSION) {
      return res.status(403).json({
        error: "Policy acceptance required",
        code: "LEGAL_ACCEPTANCE_REQUIRED",
        requiredVersion: CURRENT_POLICY_VERSION,
        traceId: req.traceId
      });
    }
    next();
  } catch (error: any) {
    console.error("Policy check failed:", error.message);
    res.status(500).json({ error: "Internal server error during policy check", traceId: req.traceId });
  }
};

// Master Admin Role Middleware
const requireMasterAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  
  if (!adminApp || !db) {
    console.log("Attempting lazy Firebase initialization in master admin middleware...");
    initializeFirebase();
  }

  if (!db) {
    return res.status(500).json({ error: "Server configuration error: Database not initialized." });
  }

  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists || (userDoc.data().role !== "master_admin" && req.user.email !== "oreutlwilediutlwileng@gmail.com")) {
      return res.status(403).json({ error: "Forbidden. Master Admin access required." });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin Role Middleware
const requireAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  
  if (req.user.role === "admin" || req.user.role === "master_admin") {
    return next();
  }
  
  res.status(403).json({ error: "Forbidden. Admin access required." });
};

// Volunteer Role Middleware
const requireVolunteer = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  
  if (req.user.role === "volunteer" || req.user.role === "admin" || req.user.role === "master_admin") {
    return next();
  }
  
  res.status(403).json({ error: "Forbidden. Volunteer access required." });
};

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

// Firestore Cost Optimization Helpers
async function getCachedDoc(req: any, collection: string, id: string, churchId: string) {
  const cacheKey = `${collection}_${id}_${churchId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const doc = await db.collection(collection).doc(id).get();
  req.firestoreOps.reads++;
  
  if (doc.exists) {
    const data = doc.data();
    if (data.churchId === churchId) {
      cache.set(cacheKey, data);
      return data;
    }
  }
  return null;
}

async function startServer() {
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.set("trust proxy", 1);
  app.use("/api/", generalLimiter);

  // API routes
  app.get("/api/legal-version", (req, res) => {
    res.json({ version: CURRENT_POLICY_VERSION });
  });

  app.get("/api/health", async (req, res) => {
    const status: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      traceId: req.traceId,
      dependencies: {
        firestore: "unknown",
        email: "unknown"
      }
    };

    try {
      if (db) {
        await db.collection("health").doc("ping").set({ lastCheck: new Date().toISOString() });
        req.firestoreOps.writes++;
        status.dependencies.firestore = "connected";
      } else {
        status.dependencies.firestore = "disconnected";
        status.status = "degraded";
      }
    } catch (e) {
      status.dependencies.firestore = "error";
      status.status = "degraded";
    }

    try {
      const emailReady = await emailService.verify();
      status.dependencies.email = emailReady ? "connected" : "disconnected";
      if (!emailReady) status.status = "degraded";
    } catch (e) {
      status.dependencies.email = "error";
      status.status = "degraded";
    }

    res.json(status);
  });

  // PIN Verification Endpoint
  app.post("/api/verify-pin", pinLimiter, authenticateToken, requireVolunteer, validate(VerifyPinSchema), async (req, res) => {
    const { pin } = req.body;
    const churchId = req.user.churchId;
    
    if (!churchId || !pin) {
      return res.status(400).json({ error: "Missing churchId or pin" });
    }

    try {
      const securityRef = db.collection("church_security").doc(churchId);
      const securityDoc = await securityRef.get();

      if (!securityDoc.exists) {
        return res.status(404).json({ error: "Security configuration not found" });
      }

      const hash = crypto.createHash("sha256").update(pin).digest("hex");
      const isValid = hash === securityDoc.data().adminOverridePinHash;

      res.json({ isValid });
    } catch (error: any) {
      console.error("Error verifying PIN:", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Server-side Audit Logging
  app.post("/api/audit", authenticateToken, async (req, res) => {
    const { action, category, details } = req.body;
    const churchId = req.user.churchId;
    const userId = req.user.uid;

    if (!churchId || !userId || !action) {
      return res.status(400).json({ error: "Missing required audit fields", traceId: req.traceId });
    }

    try {
      await db.collection("audit_logs").add({
        churchId,
        userId,
        action,
        category: category || "general",
        details: details || {},
        timestamp: new Date().toISOString(),
        source: "server",
        traceId: req.traceId
      });
      req.firestoreOps.writes++;
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error creating audit log:", error.message);
      res.status(500).json({ error: "Internal server error", traceId: req.traceId });
    }
  });

  // Atomic Check-in Endpoint
  app.post("/api/check-in", peakLimiter, authenticateToken, requirePolicyAcceptance, requireVolunteer, validate(CheckInSchema), async (req, res) => {
    const { childId, roomId, serviceId, volunteerId, checkedInBy, qrCode } = req.body;
    const churchId = req.user.churchId;

    const todayStr = format(new Date(), "yyyyMMdd");
    const checkinId = `checkin_${childId}_${serviceId}_${todayStr}`;

    try {
      // 1. Fetch Authoritative Data (Parallel)
      const [child, room, service] = await Promise.all([
        getCachedDoc(req, "children", childId, churchId),
        getCachedDoc(req, "rooms", roomId, churchId),
        getCachedDoc(req, "services", serviceId, churchId)
      ]);

      // 2. Business Logic Validation
      if (!child) return res.status(404).json({ error: "Child not found or unauthorized", traceId: req.traceId });
      if (!room) return res.status(404).json({ error: "Room not found or unauthorized", traceId: req.traceId });
      if (!service) return res.status(404).json({ error: "Service not found or unauthorized", traceId: req.traceId });

      if (service.status !== "active") {
        return res.status(400).json({ error: "Service is not active", traceId: req.traceId });
      }

      // 3. Idempotency & Conflict Check
      const activeCheckins = await db.collection("checkins")
        .where("churchId", "==", churchId)
        .where("childId", "==", childId)
        .where("status", "==", "checked-in")
        .get();
      req.firestoreOps.reads++;
      
      if (!activeCheckins.empty) {
        const existing = activeCheckins.docs[0].data();
        // If already checked into the SAME room and service, return success (idempotent)
        if (existing.roomId === roomId && existing.serviceId === serviceId) {
          return res.json({ success: true, checkinId: activeCheckins.docs[0].id, alreadyCheckedIn: true });
        }
        // If checked into a DIFFERENT room/service, return conflict
        return res.status(409).json({ 
          error: `Child is already checked into ${existing.roomName}. Please check them out first.`,
          errorType: "business",
          traceId: req.traceId 
        });
      }

      // 4. Atomic Transaction
      await db.runTransaction(async (transaction: any) => {
        const checkinRef = db.collection("checkins").doc(checkinId);
        const checkinDoc = await transaction.get(checkinRef);
        req.firestoreOps.reads++;

        if (checkinDoc.exists && checkinDoc.data().status === "checked-in") {
          return; // Already handled by idempotency check above, but safety first
        }

        transaction.set(checkinRef, {
          churchId,
          childId,
          childName: `${child.firstName} ${child.lastName}`,
          roomId,
          roomName: room.name,
          serviceId,
          serviceName: service.name,
          checkInTime: new Date().toISOString(),
          volunteerId,
          volunteerName: req.user.firstName ? `${req.user.firstName} ${req.user.lastName}` : "Volunteer",
          status: "checked-in",
          qrCode,
          checkedInBy,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
        req.firestoreOps.writes++;
      });

      // 5. Async Notifications
      const churchData = await getCachedDoc(req, "churches", churchId, churchId);
      const churchName = churchData?.name || "Church";
      
      let guardianQrToken = null;
      try {
        const guardians = await db.collection("guardians")
          .where("churchId", "==", churchId)
          .where("childIds", "array-contains", childId)
          .get();
        req.firestoreOps.reads++;
        
        if (!guardians.empty) {
          const activeGuardian = guardians.docs.find((d: any) => d.data().active);
          if (activeGuardian) {
            guardianQrToken = activeGuardian.data().qrToken;
          }
        }
      } catch (err) {
        console.error("Failed to fetch guardian QR token:", err);
      }

      emailService.sendNotification(churchId, childId, {
        childName: `${child.firstName} ${child.lastName}`,
        time: new Date().toISOString(),
        roomName: room.name,
        churchName,
        serviceName: service.name,
        eventType: 'check-in',
        guardianQrToken
      });

      res.json({ success: true, checkinId });
    } catch (error: any) {
      console.error("Check-in failed:", error.message);
      res.status(500).json({ error: "Internal server error", traceId: req.traceId });
    }
  });

  // Atomic Check-out Endpoint
  app.post("/api/check-out", peakLimiter, authenticateToken, requirePolicyAcceptance, requireVolunteer, validate(CheckOutSchema), async (req, res) => {
    const { checkinId, volunteerId, guardianId, guardianName, overrideReason } = req.body;
    const { churchId } = req.user;

    try {
      const checkinRef = db.collection("checkins").doc(checkinId);
      
      await db.runTransaction(async (transaction: any) => {
        const checkinDoc = await transaction.get(checkinRef);
        req.firestoreOps.reads++;

        if (!checkinDoc.exists) {
          throw new Error("Check-in record not found");
        }

        const cData = checkinDoc.data();
        if (cData.churchId !== churchId) {
          throw new Error("Unauthorized access to check-in record");
        }

        if (cData.status !== "checked-in") {
          throw new Error(`Cannot check out. Current status is: ${cData.status}`);
        }

        transaction.update(checkinRef, {
          checkOutTime: new Date().toISOString(),
          status: "checked-out",
          checkOutVolunteerId: volunteerId,
          checkOutVolunteerName: req.user.firstName ? `${req.user.firstName} ${req.user.lastName}` : "Volunteer",
          guardianId: guardianId || (overrideReason ? "admin_override" : "unknown"),
          guardianName: guardianName || (overrideReason ? "Admin Override" : "Guardian"),
          overrideReason: overrideReason || null,
          updatedAt: new Date().toISOString()
        });
        req.firestoreOps.writes++;
      });

      // Send Checkout Notification (Async)
      const checkinDoc = await db.collection("checkins").doc(checkinId).get();
      req.firestoreOps.reads++;
      const cData = checkinDoc.data();
      
      if (cData) {
        const churchData = await getCachedDoc(req, "churches", churchId, churchId);
        const churchName = churchData?.name || "Church";

        emailService.sendNotification(churchId, cData.childId, {
          childName: cData.childName,
          time: new Date().toISOString(),
          roomName: cData.roomName,
          churchName,
          serviceName: cData.serviceName,
          eventType: 'check-out',
          volunteerName: req.user.firstName ? `${req.user.firstName} ${req.user.lastName}` : "Volunteer",
          guardianName: guardianName || (overrideReason ? "Admin Override" : "Guardian")
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Check-out failed:", error.message);
      res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ 
        error: error.message,
        traceId: req.traceId
      });
    }
  });

  // Emergency Alert Endpoint
  app.post("/api/emergency-alert", sensitiveLimiter, authenticateToken, requireAdmin, async (req, res) => {
    const churchId = req.user.churchId;
    const adminId = req.user.uid;

    if (!churchId || !adminId) {
      return res.status(400).json({ error: "Missing churchId or adminId" });
    }

    try {
      // Verify admin status
      const userDoc = await db.collection("users").doc(adminId).get();
      if (!userDoc.exists || userDoc.data().role !== "admin") {
        return res.status(403).json({ error: "Unauthorized. Admin access required." });
      }

      const churchDoc = await db.collection("churches").doc(churchId).get();
      const churchName = churchDoc.exists ? churchDoc.data().name : "Church";

      // Trigger emergency alerts (Async)
      emailService.sendEmergencyAlert(churchId, churchName)
        .catch(err => console.error("Emergency alert failed:", err));

      // Log audit
      await db.collection("audit_logs").add({
        churchId,
        userId: adminId,
        action: "emergency_alert_triggered",
        category: "security",
        details: { timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
        source: "server"
      });

      res.json({ success: true, message: "Emergency alerts triggered successfully" });
    } catch (error: any) {
      console.error("Emergency alert failed:", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User Invitation Endpoint
  app.post("/api/invite-user", sensitiveLimiter, authenticateToken, requireAdmin, validate(InviteUserSchema), async (req, res) => {
    const { email, firstName, lastName, role } = req.body;
    const churchId = req.user.churchId;
    const inviterId = req.user.uid;

    try {
      // 1. Daily Quota Check
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dailyInvites = await db.collection("invitations")
        .where("churchId", "==", churchId)
        .where("createdAt", ">=", today.toISOString())
        .get();
      req.firestoreOps.reads++;
      
      if (dailyInvites.size >= 50) {
        return res.status(429).json({ 
          error: "Daily invitation quota exceeded (50 per day).",
          traceId: req.traceId 
        });
      }

      // 2. Get Church Data
      const churchData = await getCachedDoc(req, "churches", churchId, churchId);
      if (!churchData) {
        return res.status(404).json({ error: "Church not found", traceId: req.traceId });
      }
      const { name: churchName, slug: churchSlug } = churchData;

      // 3. Generate Token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      // 4. Determine Roles
      const roles = [role];
      if (role === "admin") roles.push("volunteer");
      if (role === "master_admin") {
        if (!roles.includes("admin")) roles.push("admin");
        if (!roles.includes("volunteer")) roles.push("volunteer");
      }

      // 5. Create Invitation Document
      const inviteData = {
        email: email.toLowerCase().trim(),
        firstName,
        lastName,
        role,
        roles,
        churchId,
        churchSlug,
        status: "pending",
        token,
        expiresAt: expiresAt.toISOString(),
        invitedBy: inviterId,
        createdAt: new Date().toISOString(),
        traceId: req.traceId
      };

      await db.collection("invitations").add(inviteData);
      req.firestoreOps.writes++;

      // 6. Send Invitation Email
      const inviteLink = `${process.env.APP_URL || req.get('origin')}/accept-invite?token=${token}`;
      
      try {
        await emailService.sendInvitation(email, {
          firstName,
          lastName,
          role,
          churchName,
          inviteLink
        });
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
        return res.json({ 
          success: true, 
          message: "Invitation created, but email failed to send. You can manually share the link.",
          inviteLink,
          emailError: true,
          traceId: req.traceId
        });
      }

      res.json({ success: true, message: "Invitation sent successfully", inviteLink });
    } catch (error: any) {
      console.error("Invitation error:", error.message);
      res.status(500).json({ error: "Internal server error", traceId: req.traceId });
    }
  });

  // Move Room Endpoint
  app.post("/api/move-room", peakLimiter, authenticateToken, requirePolicyAcceptance, requireVolunteer, validate(MoveRoomSchema), async (req, res) => {
    const { checkinId, newRoomId, volunteerId } = req.body;
    const { churchId } = req.user;

    try {
      // 1. Fetch Authoritative Data
      const room = await getCachedDoc(req, "rooms", newRoomId, churchId);
      if (!room) return res.status(404).json({ error: "Room not found or unauthorized", traceId: req.traceId });

      await db.runTransaction(async (transaction: any) => {
        const checkinRef = db.collection("checkins").doc(checkinId);
        const checkinDoc = await transaction.get(checkinRef);
        req.firestoreOps.reads++;

        if (!checkinDoc.exists) {
          throw new Error("Check-in record not found");
        }

        const cData = checkinDoc.data();
        if (cData.churchId !== churchId) {
          throw new Error("Unauthorized access to check-in record");
        }

        if (cData.status !== "checked-in") {
          throw new Error("Child is not currently checked in");
        }

        transaction.update(checkinRef, {
          roomId: newRoomId,
          roomName: room.name,
          updatedAt: new Date().toISOString(),
          lastMoveVolunteerId: volunteerId,
          lastMoveVolunteerName: req.user.firstName ? `${req.user.firstName} ${req.user.lastName}` : "Volunteer"
        });
        req.firestoreOps.writes++;
      });

      // 2. Send Move Notification (Async)
      const checkinDoc = await db.collection("checkins").doc(checkinId).get();
      req.firestoreOps.reads++;
      const cData = checkinDoc.data();
      if (cData) {
        const churchData = await getCachedDoc(req, "churches", churchId, churchId);
        const churchName = churchData?.name || "Church";

        emailService.sendNotification(churchId, cData.childId, {
          childName: cData.childName,
          time: new Date().toISOString(),
          roomName: room.name,
          churchName,
          serviceName: cData.serviceName,
          eventType: 'room_move'
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Room move failed:", error.message);
      res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ 
        error: error.message,
        traceId: req.traceId
      });
    }
  });

  // PayFast ITN Webhook
  app.post("/api/payfast-itn", async (req, res) => {
    const data = req.body;
    console.log("PayFast ITN Received:", JSON.stringify(data, null, 2));

    try {
      // 1. Validate Signature
      const passphrase = process.env.PAYFAST_PASSPHRASE;
      const signature = generateSignature(data, passphrase);
      
      if (signature !== data.signature) {
        console.error(`Invalid PayFast Signature. Calculated: ${signature}, Received: ${data.signature}`);
        return res.status(400).send("Invalid Signature");
      }

      console.log("PayFast Signature Validated.");

      // 2. Ping-back to PayFast to verify data
      const sandbox = process.env.PAYFAST_SANDBOX === "true";
      const pfHost = sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za";
      const validateUrl = `https://${pfHost}/eng/query/validate`;
      
      console.log(`Pinging back to PayFast for validation: ${validateUrl}`);
      
      const params = new URLSearchParams();
      Object.keys(data).forEach(key => params.append(key, data[key]));
      
      const validationResponse = await axios.post(validateUrl, params.toString());
      
      if (validationResponse.data !== "VALID") {
        console.error("PayFast Data Validation Failed:", validationResponse.data);
        return res.status(400).send("Validation Failed");
      }

      console.log("PayFast Data Validation Successful.");

      // 3. Process Payment
      if (data.payment_status === "COMPLETE") {
        const churchId = data.custom_str1;
        const plan = data.custom_str2;
        
        console.log(`Processing COMPLETE payment for Church: ${churchId}, Plan: ${plan}`);
        
        if (!churchId) {
          console.error("Missing churchId in ITN data");
          return res.status(400).send("Missing churchId");
        }

        const churchRef = db.collection("churches").doc(churchId);
        const churchDoc = await churchRef.get();

        if (churchDoc.exists) {
          const now = new Date();
          const nextBilling = addMonths(now, 1);

          console.log(`Updating church ${churchId} to active status.`);

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

          console.log(`Church ${churchId} subscription updated to active successfully.`);
        } else {
          console.error(`Church document not found: ${churchId}`);
        }
      } else {
        console.log(`Payment status is not COMPLETE: ${data.payment_status}`);
      }

      res.status(200).send("OK");
    } catch (error: any) {
      console.error("Error processing PayFast ITN:", error.message, error.stack);
      res.status(500).send("Internal Error");
    }
  });

  // Church Registration Endpoint
  app.post("/api/register-church", registrationLimiter, authenticateToken, validate(RegisterChurchSchema), async (req, res) => {
    const { churchName, adminFirstName, adminLastName } = req.body;
    const { uid, email } = req.user;

    if (!db || !adminApp) {
      console.error(`[REGISTRATION_ERROR] Firebase not initialized [Trace: ${req.traceId}]`);
      return res.status(500).json({ error: "System configuration error: Firebase not initialized.", traceId: req.traceId });
    }

    if (!email) {
      console.error(`[REGISTRATION_ERROR] No email found for user ${uid} [Trace: ${req.traceId}]`);
      return res.status(400).json({ error: "Email is required for registration. Please ensure your account has an email address.", traceId: req.traceId });
    }

    // Prevent multiple registrations for the same user
    if (req.user.churchId) {
      console.warn(`[REGISTRATION_WARNING] User ${uid} already associated with church ${req.user.churchId} [Trace: ${req.traceId}]`);
      return res.status(400).json({ error: "You are already associated with a church. Multiple church registrations per user are not supported.", traceId: req.traceId });
    }

    let churchRef: any = null;
    let rollbackExecuted = false;

    try {
      console.log(`Starting church registration for: ${churchName} (${email}) [Trace: ${req.traceId}]`);
      
      // 1. Generate unique slug
      let slug = churchName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      if (slug.startsWith("-")) slug = slug.slice(1);
      if (slug.endsWith("-")) slug = slug.slice(0, -1);
      
      // Fallback for empty slug
      if (!slug || slug.length < 2) {
        slug = `church-${Math.random().toString(36).substring(2, 7)}`;
      }
      
      // Ensure slug uniqueness
      const existingChurch = await db.collection("churches").where("slug", "==", slug).limit(1).get();
      req.firestoreOps.reads++;
      
      if (!existingChurch.empty) {
        slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // 2. Create Church Document
      churchRef = await db.collection("churches").add({
        name: churchName,
        slug: slug,
        adminEmail: email,
        status: "trialing",
        subscription: {
          tier: "free",
          status: "active",
          trialEndsAt: addMonths(new Date(), 1).toISOString(), // 1 month trial
        },
        metrics: {
          totalChildren: 0,
          activeCheckins: 0,
          totalVolunteers: 0
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        traceId: req.traceId
      });
      req.firestoreOps.writes++;
      console.log(`Created church document: ${churchRef.id}`);

      // 3. Create User Document
      await db.collection("users").doc(uid).set({
        uid: uid,
        email: email,
        firstName: adminFirstName,
        lastName: adminLastName,
        role: "admin",
        roles: ["admin", "volunteer"],
        churchId: churchRef.id,
        churchSlug: slug,
        status: "approved",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        traceId: req.traceId
      });
      req.firestoreOps.writes++;
      console.log(`Created admin user document: ${uid}`);

      res.json({ success: true, churchId: churchRef.id, slug: slug });
    } catch (error: any) {
      console.error(`[REGISTRATION_ERROR] ${error.message} [Trace: ${req.traceId}]`);
      
      // ROLLBACK: Ensure atomicity
      if (!rollbackExecuted) {
        rollbackExecuted = true;
        console.log(`[ROLLBACK] Initiating rollback for user ${uid} [Trace: ${req.traceId}]`);
        
        // 1. Delete orphaned church document
        if (churchRef) {
          try {
            await churchRef.delete();
            console.log(`[ROLLBACK] Deleted orphaned church document: ${churchRef.id}`);
          } catch (cleanupError: any) {
            console.error(`[ROLLBACK_FAILED] Failed to delete church doc: ${cleanupError.message}`);
          }
        }
        
        // 2. Delete Auth user (as requested by user for consistency)
        try {
          await getAuth(adminApp).deleteUser(uid);
          console.log(`[ROLLBACK] Deleted Firebase Auth user: ${uid}`);
        } catch (authError: any) {
          console.error(`[ROLLBACK_FAILED] Failed to delete Auth user: ${authError.message}`);
        }
      }

      if (!res.headersSent) {
        res.status(500).json({ 
          error: error.message || "Failed to register church", 
          traceId: req.traceId,
          rollback: "executed"
        });
      }
    }
  });

  // Global error handler for API routes
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    console.error("API Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      code: err.code || "UNKNOWN_ERROR"
    });
  });

  // 404 handler for API routes
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
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
    // Global error handler for all routes (must be last)
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled Error:", err);
    
    // If headers already sent, delegate to default express error handler
    if (res.headersSent) {
      return next(err);
    }

    const isApi = req.path.startsWith("/api");
    if (isApi) {
      res.status(err.status || 500).json({
        error: err.message || "Internal Server Error",
        code: err.code || "INTERNAL_ERROR",
        traceId: req.traceId || "none"
      });
    } else {
      // For non-API routes, still try to return JSON if it's a 500
      res.status(err.status || 500).json({
        error: "An unexpected server error occurred.",
        message: err.message,
        traceId: req.traceId || "none"
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
