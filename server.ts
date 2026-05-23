import express from "express";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { addMonths, format, parseISO } from "date-fns";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import { EmailService } from "./emailService.js";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import NodeCache from "node-cache";
import { CURRENT_POLICY_VERSION } from "./src/constants/legalContent.js";

const PLAN_LIMITS: Record<string, { users: number; children: number }> = {
  starter: { users: 20, children: 50 },
  growth: { users: 50, children: 150 },
  professional: { users: Infinity, children: Infinity }
};

// Global Server-side Logger
const isDev = String(process.env.VITE_DEV_MODE).toLowerCase() === "true";
const logger = {
  log: (...args: any[]) => isDev && console.log(...args),
  info: (...args: any[]) => isDev && console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
  debug: (...args: any[]) => isDev && console.debug(...args),
  isDevEnabled: () => isDev
};

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
    logger.error("firebase-applet-config.json is missing projectId");
  }
} catch (error) {
  logger.error("Failed to read firebase-applet-config.json:", error);
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
  return req.user?.uid || ipKeyGenerator(req.ip);
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Increased to 200 to reduce accidental 429s for active users
  keyGenerator,
  message: { error: "Too many requests, please try again later." }
});

const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Higher limit for polling-heavy routes (health, transactions)
  keyGenerator,
  message: { error: "Dashboard polling limit reached, please refresh in a few minutes." }
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
  keyGenerator: (req) => ipKeyGenerator(req.ip),
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
  checkedInBy: z.string().min(1),
  parentId: z.string().optional()
});

const CheckOutSchema = z.object({
  checkinId: z.string().min(1),
  volunteerId: z.string().min(1),
  volunteerName: z.string().optional().nullable(),
  guardianId: z.string().optional().nullable(),
  guardianName: z.string().optional().nullable(),
  overrideReason: z.string().optional().nullable()
});

const InviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["parent", "volunteer", "admin", "master_admin"])
});

const AcceptInviteSchema = z.object({
  token: z.string().length(64),
  password: z.string().min(6)
});

const RegisterChildSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  age: z.number().int().min(0).max(110),
  gender: z.enum(["Male", "Female"]),
  allergies: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  photoUrl: z.string().url().optional().or(z.literal(""))
});

const RegisterChurchSchema = z.object({
  churchName: z.string().min(3).max(100),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().min(1),
  plan: z.string().optional()
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
        status: userData.status,
        firstName: userData.firstName,
        lastName: userData.lastName
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

const PLAN_PRICES: Record<string, number> = {
  starter: 249,
  growth: 499,
  professional: 999
};

// Transactions List Endpoint
app.get("/api/transactions", dashboardLimiter, authenticateToken, async (req, res) => {
  const churchId = req.user.churchId;
  if (!churchId) return res.status(403).json({ error: "Unauthorized" });

  try {
    const transactions = await db.collection("transactions")
      .where("churchId", "==", churchId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    
    req.firestoreOps.reads++;
    
    if (transactions.empty) {
      console.log(`No transactions found for church ${churchId}`);
    }

    const results = transactions.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(results);
  } catch (error: any) {
    console.error("Error fetching transactions:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/send-verification", sensitiveLimiter, authenticateToken, async (req, res) => {
  const { uid, email } = req.user;
  if (!email) return res.status(400).json({ error: "Email not found" });

  try {
    // 1. Fetch user data to get firstName
    const userDoc = await db.collection("users").doc(uid).get();
    req.firestoreOps.reads++;
    
    const userData = userDoc.data() || {};
    const firstName = userData.firstName || "there";
    
    // 2. Fetch church name
    let churchName = "GuardianCheck";
    if (userData.churchId) {
      const churchDoc = await db.collection("churches").doc(userData.churchId).get();
      req.firestoreOps.reads++;
      if (churchDoc.exists) {
        churchName = churchDoc.data().name;
      }
    }

    // 3. Generate Link
    const origin = req.get("origin") || req.get("host") || "https://guardiancheck.co.za";
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;

    const actionCodeSettings = {
      url: `${process.env.APP_URL || baseUrl}/login`
    };
    
    const verificationLink = await getAuth(adminApp).generateEmailVerificationLink(email, actionCodeSettings);

    // 4. Send via Resend
    await emailService.sendVerificationEmail(email, firstName, churchName, verificationLink);

    res.json({ success: true, message: "Verification email sent via Resend" });
  } catch (error: any) {
    console.error(`[VERIFICATION_ERROR] UID: ${uid}, Email: ${email}, Error: ${error.message}`);
    
    let status = 500;
    let userMessage = "Failed to send verification email";
    
    if (error.message?.includes("TOO_MANY_ATTEMPTS_TRY_LATER") || error.code === "auth/too-many-attempts") {
      status = 429;
      userMessage = "Too many verification requests. Please check your inbox or try again in a minute.";
    }

    res.status(status).json({ 
      error: userMessage, 
      details: error.message,
      traceId: req.traceId 
    });
  }
});

// PayFast Helper: Generate Signature
function generateSignature(data: any, passphrase?: string) {
  let queryString = "";
  Object.keys(data).forEach((key) => {
    if (key !== "signature" && data[key] !== undefined && data[key] !== null && data[key] !== "") {
      const val = String(data[key]);
      queryString += `${key}=${encodeURIComponent(val).replace(/%20/g, "+")}&`;
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
/**
 * Ownership validation rules per collection.
 * This allows the system to scale as new data models are introduced.
 */
const OWNERSHIP_CONFIG: Record<string, { 
  validate: (doc: any, churchId: string) => boolean 
}> = {
  // For the churches collection, the document ID itself is the churchId
  churches: {
    validate: (doc, churchId) => doc.id === churchId
  },
  // Default fallback for standard tenant-owned collections (children, volunteers, etc.)
  default: {
    validate: (doc, churchId) => doc.data()?.churchId === churchId
  }
};

/**
 * Enhanced document fetcher with multi-tenant isolation and caching.
 * @throws {Error} 403 Forbidden if ownership validation fails.
 */
async function getCachedDoc(req: any, collection: string, id: string, churchId: string) {
  // 1. Check Cache
  const cacheKey = `${collection}_${id}_${churchId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 2. Fetch from Firestore
  const doc = await db.collection(collection).doc(id).get();
  req.firestoreOps.reads++;
  
  // 3. Handle Missing Data
  if (!doc.exists) {
    return null;
  }

  // 4. Ownership Validation
  const rule = OWNERSHIP_CONFIG[collection] || OWNERSHIP_CONFIG.default;
  const isAuthorized = rule.validate(doc, churchId);

  if (!isAuthorized) {
    console.warn(`SECURITY ALERT: Unauthorized access attempt by church ${churchId} on ${collection}/${id}`);
    
    const error: any = new Error("Access Denied: You do not have permission to access this resource.");
    error.status = 403;
    error.code = "FORBIDDEN";
    error.traceId = req.traceId;
    throw error;
  }

  // 5. Cache and Return
  const data = doc.data();
  cache.set(cacheKey, data);
  return data;
}

async function startServer() {
  const PORT = 3000;

  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ 
    extended: true,
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.set("trust proxy", 1);
  app.use("/api/", generalLimiter);

  // API routes
  app.get("/api/legal-version", (req, res) => {
    res.json({ version: CURRENT_POLICY_VERSION });
  });

  app.get("/api/health", dashboardLimiter, async (req, res) => {
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

    // Helper for timeout
    const withTimeout = (promise: Promise<any>, ms: number) => {
      let timeoutId: any;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timeout")), ms);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
    };

    try {
      if (db) {
        await withTimeout(db.collection("health").doc("ping").set({ lastCheck: new Date().toISOString() }), 3000);
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
      const emailReady = await withTimeout(emailService.verify(), 3000);
      status.dependencies.email = emailReady ? "connected" : "disconnected";
      if (!emailReady) status.status = "degraded";
    } catch (e) {
      status.dependencies.email = "error";
      status.status = "degraded";
    }

    res.json(status);
  });

  // PIN Verification Endpoint
  app.post("/api/log-client-error", async (req, res) => {
    const { level, message, context, timestamp, stack, url, userAgent, source } = req.body;
    
    try {
      const logData = {
        level: level || 'error',
        message: message || 'Unknown client error',
        context: context || {},
        timestamp: timestamp || new Date().toISOString(),
        stack: stack || null,
        url: url || req.get('Referer') || null,
        userAgent: userAgent || req.get('user-agent'),
        source: source || 'client',
        userId: req.user?.uid || context?.userId || null,
        churchId: req.user?.churchId || context?.churchId || null,
        processedAt: new Date().toISOString()
      };

      if (db) {
        await db.collection("logs").add(logData);
      }
      
      if (level === 'critical' || level === 'error') {
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (webhookUrl) {
          const color = level === 'critical' ? 0xff0000 : 0xffa500;
          await axios.post(webhookUrl, {
            embeds: [{
              title: `GuardianCheck Alert: ${level.toUpperCase()}`,
              description: message,
              color: color,
              fields: [
                { name: 'Source', value: logData.source, inline: true },
                { name: 'User ID', value: logData.userId || 'N/A', inline: true },
                { name: 'Church ID', value: logData.churchId || 'N/A', inline: true },
                { name: 'URL', value: logData.url || 'N/A' },
              ],
              timestamp: logData.processedAt
            }]
          } as any).catch((err: any) => console.error("Discord webhook failed:", err.message));
        }
      }

      res.status(200).json({ status: "logged" });
    } catch (e: any) {
      console.error("Error logging client error:", e.message);
      res.status(500).json({ error: "Failed to log" });
    }
  });

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

  // Child Registration via API (with Plan Limit Enforcement)
  app.post("/api/children", authenticateToken, validate(RegisterChildSchema), async (req, res) => {
    const childData = req.body;
    const { uid, churchId, firstName, lastName } = req.user;
    const idempotencyKey = req.headers["x-idempotency-key"] as string;

    if (!churchId) {
      return res.status(400).json({ error: "Church ID not found in profile. Please select a church first." });
    }

    try {
      // 0. Handle Idempotency
      if (idempotencyKey) {
        const existingOp = await db.collection("idempotency_keys").doc(idempotencyKey).get();
        if (existingOp.exists) {
          const data = existingOp.data();
          logger.info(`[IDEMPOTENCY] Key ${idempotencyKey} already processed. Returning cached result.`);
          return res.status(200).json(data.response);
        }
      }

      // 1. Get Church Data for Plan
      const churchData = await getCachedDoc(req, "churches", churchId, churchId);
      if (!churchData) {
        return res.status(404).json({ error: "Church not found" });
      }

      const planTier = (churchData.plan || "starter").toLowerCase();
      const limits = PLAN_LIMITS[planTier] || PLAN_LIMITS.starter;

      // 2. Enforcement Check
      if (limits.children !== Infinity) {
        const childrenSnapshot = await db.collection("children").where("churchId", "==", churchId).get();
        req.firestoreOps.reads++;

        if (childrenSnapshot.size >= limits.children) {
          return res.status(403).json({ 
            error: `Children limit reached for your ${planTier.charAt(0).toUpperCase() + planTier.slice(1)} plan (${limits.children} children). Please upgrade to register more.`,
            traceId: req.traceId
          });
        }
      }

      // 3. Create Child
      const parentName = `${firstName} ${lastName}`;
      const { notes, ...basicChildData } = childData;
      const childId = uuidv4();
      const qrCode = `child_${Math.random().toString(36).substr(2, 9)}`;

      const childDoc = {
        ...basicChildData,
        id: childId,
        parentId: uid,
        parentName,
        churchId,
        qrCode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.collection("children").doc(childId).set(childDoc);
      req.firestoreOps.writes++;

      // 4. Store Medical Notes separately
      await db.collection("child_medical").doc(childId).set({
        notes: notes || "",
        parentId: uid,
        churchId,
        updatedAt: new Date().toISOString()
      });
      req.firestoreOps.writes++;

      const successResponse = { 
        success: true, 
        childId, 
        message: "Child registered successfully." 
      };

      // Store response for idempotency
      if (idempotencyKey) {
        await db.collection("idempotency_keys").doc(idempotencyKey).set({
          response: successResponse,
          uid,
          createdAt: new Date().toISOString()
        });
      }

      res.status(201).json(successResponse);

    } catch (error: any) {
      console.error(`[CHILD_REG_ERROR] ${error.message} [Trace: ${req.traceId}]`);
      res.status(500).json({ error: "Failed to register child", traceId: req.traceId });
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
    const { childId, roomId, serviceId, volunteerId, checkedInBy, qrCode, parentId } = req.body;
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

      // Auto-extract parentId from child if not provided
      const finalParentId = parentId || child.parentId;

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
          parentId: finalParentId,
          roomId,
          roomName: room.name,
          serviceId,
          serviceName: service.name,
          checkInTime: new Date().toISOString(),
          volunteerId,
          volunteerName: (req.user.firstName || req.user.lastName) 
            ? `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() 
            : (req.user.name || req.user.email || "Volunteer"),
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
      }).catch(err => console.error("Async check-in notification failed:", err.message));

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
      
      const checkinData = await db.runTransaction(async (transaction: any) => {
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

        const updateData = {
          checkOutTime: new Date().toISOString(),
          status: "checked-out",
          checkOutVolunteerId: volunteerId,
          checkOutVolunteerName: (req.user.firstName || req.user.lastName) 
            ? `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() 
            : (req.user.name || req.user.email || "Volunteer"),
          guardianId: guardianId || (overrideReason ? "admin_override" : "unknown"),
          guardianName: guardianName || (overrideReason ? "Admin Override" : "Guardian"),
          overrideReason: overrideReason || null,
          updatedAt: new Date().toISOString()
        };

        transaction.update(checkinRef, updateData);
        req.firestoreOps.writes++;
        return { ...cData, ...updateData };
      });

      // Send Checkout Notification (Fire and forget)
      if (checkinData) {
        // Use cached church data for the name
        const churchData = await getCachedDoc(req, "churches", churchId, churchId);
        const churchName = churchData?.name || "Church";

        emailService.sendNotification(churchId, checkinData.childId, {
          childName: checkinData.childName,
          time: checkinData.checkOutTime,
          roomName: checkinData.roomName,
          churchName,
          serviceName: checkinData.serviceName,
          eventType: 'check-out',
          volunteerName: checkinData.checkOutVolunteerName,
          guardianName: checkinData.guardianName
        }).catch(err => console.error("Async notification failed:", err));
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

      // 3.5 Plan Limit Check (Users)
      const planTier = (churchData.plan || "starter").toLowerCase();
      const limits = PLAN_LIMITS[planTier] || PLAN_LIMITS.starter;
      
      if (limits.users !== Infinity) {
        // Count active users
        const usersSnapshot = await db.collection("users").where("churchId", "==", churchId).get();
        req.firestoreOps.reads++;
        
        // Count pending invitations
        const activeInvitesSnapshot = await db.collection("invitations")
          .where("churchId", "==", churchId)
          .where("status", "==", "pending")
          .get();
        req.firestoreOps.reads++;
        
        const totalUserSlots = usersSnapshot.size + activeInvitesSnapshot.size;
        
        if (totalUserSlots >= limits.users) {
          return res.status(403).json({ 
            error: `User limit reached for your ${planTier.charAt(0).toUpperCase() + planTier.slice(1)} plan (${limits.users} users). Please upgrade your subscription to invite more users.`,
            traceId: req.traceId
          });
        }
      }

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
      } catch (emailError: any) {
        console.error("Delayed failure sending invitation email:", emailError.message);
        // We still return success: true because the invitation IS in the database
        // and the user can see the link in the response/UI if needed.
        return res.json({ 
          success: true, 
          message: "Invitation created but email delivery failed. You can copy the link manually.", 
          inviteLink,
          emailError: emailError.message 
        });
      }

      res.json({ success: true, message: "Invitation created and email sent successfully.", inviteLink });
    } catch (error: any) {
      console.error("Invitation error:", error.message);
      res.status(500).json({ error: "Internal server error", traceId: req.traceId });
    }
  });

  // Accept Invitation Endpoint
  app.post("/api/accept-invite", sensitiveLimiter, validate(AcceptInviteSchema), async (req, res) => {
    const { token, password } = req.body;

    try {
      // 1. Find and Validate Invitation
      const inviteQuery = await db.collection("invitations")
        .where("token", "==", token)
        .where("status", "==", "pending")
        .limit(1)
        .get();
      req.firestoreOps.reads++;

      if (inviteQuery.empty) {
        return res.status(404).json({ error: "Invalid or already used invitation." });
      }

      const inviteDoc = inviteQuery.docs[0];
      const inviteData = inviteDoc.data();

      // 2. Check Expiry
      if (new Date(inviteData.expiresAt) < new Date()) {
        await inviteDoc.ref.update({ status: "expired" });
        req.firestoreOps.writes++;
        return res.status(400).json({ error: "This invitation has expired." });
      }

      // 3. Create or Fetch/Update Auth User
      let userRecord;
      try {
        const existingUser = await getAuth(adminApp).getUserByEmail(inviteData.email);
        // If they already exist in Auth, update password and displayName to complete setup
        userRecord = await getAuth(adminApp).updateUser(existingUser.uid, {
          password: password,
          displayName: `${inviteData.firstName} ${inviteData.lastName}`
        });
      } catch (authError: any) {
        if (authError.code === "auth/user-not-found") {
          userRecord = await getAuth(adminApp).createUser({
            email: inviteData.email,
            password: password,
            displayName: `${inviteData.firstName} ${inviteData.lastName}`,
            emailVerified: false
          });
        } else {
          throw authError;
        }
      }

      // 4. Atomic Transaction: Create User Doc and Update Invite
      await db.runTransaction(async (transaction) => {
        // Create User Document
        const userRef = db.collection("users").doc(userRecord.uid);
        transaction.set(userRef, {
          uid: userRecord.uid,
          email: inviteData.email,
          firstName: inviteData.firstName,
          lastName: inviteData.lastName,
          role: inviteData.role,
          roles: inviteData.roles || [inviteData.role],
          churchId: inviteData.churchId,
          churchSlug: inviteData.churchSlug,
          status: "incomplete_profile",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Mark Invitation as Accepted
        transaction.update(inviteDoc.ref, {
          status: "accepted",
          acceptedAt: new Date().toISOString(),
          acceptedBy: userRecord.uid,
          updatedAt: new Date().toISOString()
        });
      });
      req.firestoreOps.writes += 2;

      // 5. Log Audit
      await db.collection("audit_logs").add({
        churchId: inviteData.churchId,
        userId: userRecord.uid,
        action: "invitation_accepted",
        category: "auth",
        details: { role: inviteData.role, email: inviteData.email },
        timestamp: new Date().toISOString(),
        source: "server"
      });
      req.firestoreOps.writes++;

      // 6. Send Verification Email (Awaited to ensure CPU allocation on serverless container runtimes)
      try {
        // Get church name if missing
        let churchName = inviteData.churchName;
        if (!churchName) {
          const churchDoc = await db.collection("churches").doc(inviteData.churchId).get();
          req.firestoreOps.reads++;
          if (churchDoc.exists) {
            churchName = churchDoc.data().name;
          }
        }

        const origin = req.get("origin") || req.get("host") || "https://guardiancheck.co.za";
        const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;
        
        const verificationLink = await getAuth(adminApp).generateEmailVerificationLink(inviteData.email, {
          url: `${process.env.APP_URL || baseUrl}/login`
        });

        await emailService.sendVerificationEmail(
          inviteData.email, 
          inviteData.firstName, 
          churchName || "Your Church",
          verificationLink
        );
        
        logger.info(`Verification email sent for volunteer: ${inviteData.email}`);
      } catch (error: any) {
        console.error("Verification email failed for volunteer signup:", error.message);
        // Log to general logs for visibility
        await db.collection("logs").add({
          level: "error",
          message: `Verification email failed during invite acceptance: ${error.message}`,
          context: { 
              email: inviteData.email, 
              churchId: inviteData.churchId,
              traceId: req.traceId
          },
          timestamp: new Date().toISOString()
        }).catch(console.error);
      }

      res.json({ 
        success: true, 
        message: "Account created successfully. A verification email is being sent.",
        userId: userRecord.uid
      });
    } catch (error: any) {
      console.error("Accept invite failed:", error.message || error);
      const errCode = error.code || "";
      if (errCode.startsWith("auth/")) {
        let msg = error.message;
        if (errCode === "auth/invalid-password" || errCode === "auth/weak-password") {
          msg = "Password must be at least 6 characters long.";
        } else if (errCode === "auth/email-already-in-use") {
          msg = "This email is already registered.";
        }
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Validate Invitation Endpoint
  app.get("/api/validate-invite", generalLimiter, async (req, res) => {
    const { token } = req.query;

    if (!token || typeof token !== "string" || token.length !== 64) {
      return res.status(400).json({ error: "Invalid token format." });
    }

    try {
      const inviteQuery = await db.collection("invitations")
        .where("token", "==", token)
        .where("status", "==", "pending")
        .limit(1)
        .get();
      req.firestoreOps.reads++;

      if (inviteQuery.empty) {
        return res.status(404).json({ error: "Invitation not found or already used." });
      }

      const inviteDoc = inviteQuery.docs[0];
      const inviteData = inviteDoc.data();

      // Check Expiry
      if (new Date(inviteData.expiresAt) < new Date()) {
        await inviteDoc.ref.update({ status: "expired" });
        req.firestoreOps.writes++;
        return res.status(400).json({ error: "This invitation has expired." });
      }

      // Return only necessary public info
      res.json({
        id: inviteDoc.id,
        email: inviteData.email,
        firstName: inviteData.firstName,
        lastName: inviteData.lastName,
        role: inviteData.role,
        churchName: inviteData.churchName || inviteData.churchSlug,
        churchId: inviteData.churchId
      });
    } catch (error: any) {
      console.error("Validate invite failed:", error.message);
      res.status(500).json({ error: "Internal server error" });
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
        }).catch(err => console.error("Async room-move notification failed:", err.message));
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
    const traceId = uuidv4().substring(0, 8);
    
    try {
      const sandbox = String(process.env.VITE_PAYFAST_SANDBOX || process.env.PAYFAST_SANDBOX).toLowerCase() === "true";
      
      // Log arrival
      await db.collection("logs").add({
        level: "info",
        message: `[ITN_${traceId}] ITN received [Sandbox: ${sandbox}]`,
        metadata: { 
          churchId: data.custom_str1,
          plan: data.custom_str2,
          payment_status: data.payment_status,
          m_payment_id: data.m_payment_id,
          pf_payment_id: data.pf_payment_id,
          amount_gross: data.amount_gross,
          sandbox
        },
        source: "payfast_itn",
        timestamp: new Date().toISOString()
      });

      // Signature Validation using Raw Body for ITN
      const passphrase = sandbox ? "" : process.env.PAYFAST_PASSPHRASE;
      let signatureString = "";
      
      if ((req as any).rawBody) {
        const rawBodyStr = (req as any).rawBody.toString();
        // Split by ampersand, filter out signature, join back in original order
        signatureString = rawBodyStr.split("&")
          .filter(pair => !pair.startsWith("signature="))
          .join("&");
        
        if (passphrase) {
          signatureString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
        }
      }

      const signature = crypto.createHash("md5").update(signatureString).digest("hex");
      
      if (signature !== data.signature) {
        await db.collection("logs").add({
          level: "error",
          message: `[ITN_${traceId}] Signature mismatch`,
          metadata: { 
            expected: signature, 
            received: data.signature, 
            signatureString,
            sandbox 
          },
          source: "payfast_itn",
          timestamp: new Date().toISOString()
        });
        return res.status(200).send("OK");
      }

      // Ping-back verification
      const pfHost = sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za";
      const validateUrl = `https://${pfHost}/eng/query/validate`;
      const params = new URLSearchParams();
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && data[key] !== null) {
          params.append(key, data[key].toString());
        }
      });
      
      const validationResponse = await axios.post(validateUrl, params.toString(), { 
        timeout: 15000,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      
      if (validationResponse.data !== "VALID") {
        await db.collection("logs").add({
          level: "error",
          message: `[ITN_${traceId}] Ping-back validation failed`,
          metadata: { response: validationResponse.data, sandbox },
          source: "payfast_itn",
          timestamp: new Date().toISOString()
        });
        return res.status(200).send("OK");
      }

      // Business Logic
      if (data.payment_status === "COMPLETE") {
        const churchId = data.custom_str1?.trim();
        const plan = data.custom_str2;
        const token = data.token;
        const amount = parseFloat(data.amount_gross || "0");
        
        if (!churchId) {
          await db.collection("logs").add({
            level: "error",
            message: `[ITN_${traceId}] Missing churchId`,
            source: "payfast_itn",
            timestamp: new Date().toISOString()
          });
          return res.status(200).send("OK");
        }

        const churchRef = db.collection("churches").doc(churchId);
        const churchDoc = await churchRef.get();

        if (churchDoc.exists) {
          const now = new Date();
          const updateData: any = {
            updatedAt: now.toISOString(),
            payfast_m_payment_id: data.m_payment_id,
            payfast_pf_payment_id: data.pf_payment_id
          };

          if (token) updateData["subscription.payfast_token"] = token;
          if (plan) {
            updateData["plan"] = plan;
            updateData["subscription.tier"] = plan;
          }

          if (amount > 0) {
            updateData.status = "active";
            updateData["subscription.status"] = "active";
            updateData.lastPaymentDate = now.toISOString();
            
            const existingData = churchDoc.data();
            // Try root field first, then nested subscription field
            const trialEndsAt = existingData?.trialEndsAt || existingData?.subscription?.trialEndsAt;
            const currentNextBilling = existingData?.nextBillingDate || existingData?.subscription?.billingDate;
            
            let anchorDate = now;
            
            if (trialEndsAt && new Date(trialEndsAt) > now) {
              anchorDate = new Date(trialEndsAt);
            } else if (currentNextBilling && new Date(currentNextBilling) > now) {
              anchorDate = new Date(currentNextBilling);
            }

            const nextDate = addMonths(anchorDate, 1);
            updateData.nextBillingDate = nextDate.toISOString();
            updateData["subscription.billingDate"] = nextDate.toISOString();
          } else if (token) {
            updateData.status = "trialing";
            updateData["subscription.status"] = "trialing";
            if (data.billing_date) {
              updateData["subscription.trialEndsAt"] = new Date(data.billing_date).toISOString();
              updateData["subscription.billingDate"] = new Date(data.billing_date).toISOString();
            }
          }

          await churchRef.update(updateData);
          
          await db.collection("transactions").add({
            churchId,
            amount,
            plan: plan || churchDoc.data()?.plan || "starter",
            payfast_pf_payment_id: data.pf_payment_id,
            status: "complete",
            token: token || null,
            m_payment_id: data.m_payment_id || null,
            createdAt: now.toISOString()
          });

          await db.collection("logs").add({
            level: "info",
            message: `[ITN_${traceId}] Sync Successful: ${churchId}`,
            metadata: { amount, plan, status: updateData.status },
            source: "payfast_itn",
            timestamp: now.toISOString()
          });
        }
      }

      res.status(200).send("OK");
    } catch (err: any) {
      console.error(`[ITN_${traceId}] Critical Exception:`, err.message);
      try {
        await db.collection("logs").add({
          level: "error",
          message: `[ITN_${traceId}] Critical Exception`,
          metadata: { error: err.message, stack: err.stack },
          source: "payfast_itn",
          timestamp: new Date().toISOString()
        });
      } catch (innerErr) {
        console.error("Failed to log internal error to DB", innerErr);
      }
      res.status(200).send("OK");
    }
  });

  // PayFast Helper: Generate API Signature (v1)
  function generatePayFastApiSignature(params: any, passphrase?: string) {
    let queryString = "";
    Object.keys(params).forEach((key) => {
      queryString += `${key}=${encodeURIComponent(params[key]).replace(/%20/g, "+")}&`;
    });

    if (passphrase) {
      queryString += `passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
    } else if (queryString.endsWith("&")) {
      queryString = queryString.substring(0, queryString.length - 1);
    }

    return crypto.createHash("md5").update(queryString).digest("hex");
  }

  // Cancel Subscription Endpoint
  app.post("/api/subscriptions/cancel", authenticateToken, async (req, res) => {
    try {
      const churchId = req.user.churchId;
      if (!churchId) return res.status(403).json({ error: "Unauthorized" });

      const churchRef = db.collection("churches").doc(churchId);
      const churchDoc = await churchRef.get();
      if (!churchDoc.exists) return res.status(404).json({ error: "Church not found" });

      const churchData = churchDoc.data();
      const token = churchData?.subscription?.payfast_token;
      
      if (!token) {
        return res.status(400).json({ error: "No active subscription found to cancel." });
      }

      const sandbox = process.env.PAYFAST_SANDBOX === "true" || process.env.VITE_PAYFAST_SANDBOX === "true";
      const merchantId = process.env.VITE_PAYFAST_MERCHANT_ID;
      const passphrase = sandbox ? "" : process.env.PAYFAST_PASSPHRASE;
      
      const timestamp = new Date().toISOString();
      const params: any = {
        "merchant-id": merchantId,
        "version": "v1",
        "timestamp": timestamp
      };

      const signature = generatePayFastApiSignature(params, passphrase);
      const baseUrl = sandbox ? "https://sandbox.payfast.co.za" : "https://api.payfast.co.za";
      const url = `${baseUrl}/subscriptions/${token}/cancel`;

      // Call PayFast API
      const pfResponse = await axios.put(url, {}, {
        headers: {
          "merchant-id": merchantId,
          "version": "v1",
          "timestamp": timestamp,
          "signature": signature
        }
      });

      if (pfResponse.data.status === "success" || pfResponse.data?.data?.response === true) {
        // Update local status
        await churchRef.update({
          "subscription.cancel_at_period_end": true,
          "subscription.status": "cancelling",
          updatedAt: new Date().toISOString()
        });

        await db.collection("logs").add({
          level: "info",
          message: `Subscription cancelled for church: ${churchId}`,
          metadata: { pfResponse: pfResponse.data },
          source: "subscription_cancel",
          timestamp: new Date().toISOString()
        });

        return res.json({ success: true, message: "Subscription cancelled successfully. It will remain active until the end of the current billing period." });
      } else {
        throw new Error(pfResponse.data?.data?.message || "PayFast API error");
      }

    } catch (err: any) {
      console.error("Cancel Subscription Error:", err.message);
      res.status(500).json({ error: "Failed to cancel subscription: " + (err.response?.data?.data?.message || err.message) });
    }
  });

  // Church Registration Endpoint
  app.post("/api/register-church", registrationLimiter, authenticateToken, validate(RegisterChurchSchema), async (req, res) => {
    const { churchName, adminFirstName, adminLastName, plan } = req.body;
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
      const initialTier = plan && ["starter", "growth", "professional"].includes(plan.toLowerCase()) 
        ? plan.toLowerCase() 
        : "starter";

      churchRef = await db.collection("churches").add({
        name: churchName,
        slug: slug,
        adminEmail: email,
        status: "trialing",
        plan: initialTier,
        subscription: {
          tier: initialTier,
          status: "active",
          trialStartedAt: new Date().toISOString(),
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
        status: "incomplete_profile",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        traceId: req.traceId
      });
      req.firestoreOps.writes++;
      console.log(`Created admin user document: ${uid}`);

      res.json({ success: true, churchId: churchRef.id, slug: slug });

      // 4. Send Verification Email (Async)
      const actionCodeSettings = {
        url: `${process.env.APP_URL || req.get("origin")}/login`
      };
      getAuth(adminApp).generateEmailVerificationLink(email, actionCodeSettings)
        .then(link => emailService.sendVerificationEmail(email, adminFirstName, churchName, link))
        .catch(err => console.error(`[VERIFICATION_ERROR] Async registration verification failed: ${err.message}`));

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
    const { createServer: createViteServer } = await import("vite");
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

startServer();

export default app;
