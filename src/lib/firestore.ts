import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  runTransaction,
  FirestoreError,
  DocumentData,
  QueryConstraint,
  limit,
  orderBy,
  startAfter
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { getHumanReadableError, showErrorToast } from "./error-handler";
import { logger } from "./logger";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const humanError = getHumanReadableError(error);
  const isDevMode = logger.isDevEnabled();
  
  // Standardized error info
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  
  // SECURE LOGGING: Absolute silent in production for sensitive info
  if (isDevMode) {
    console.group('Firestore Error [DEV]');
    console.error('Operation:', operationType);
    console.error('Path:', path);
    console.error('Details:', errInfo);
    console.groupEnd();
  } else {
    // In production, we ONLY log the basic error string to console
    console.error(`[Firestore Error] ${operationType} on ${path}: ${errInfo.error}`);
  }
  
  // Handle Audit Logs (Sanitized for production)
  if (operationType === OperationType.WRITE || operationType === OperationType.CREATE || operationType === OperationType.UPDATE) {
    logAudit({
      action: `FAILED_${operationType.toUpperCase()}`,
      category: "system_error",
      details: isDevMode ? errInfo : { error: errInfo.error, operationType, path },
      churchId: (auth.currentUser as any)?.churchId,
      userId: auth.currentUser?.uid
    }).catch(() => {});
  }
  
  // Throw sanitized payload
  const errorPayload: any = {
    error: isDevMode ? errInfo.error : "Missing or insufficient permissions.",
    operationType,
    path,
    humanTitle: humanError.title,
    humanMessage: humanError.message,
    humanActionable: humanError.actionable
  };

  // Explicitly ensure NO authInfo is present in the thrown error
  throw new Error(JSON.stringify(errorPayload));
}

export async function getDocument(path: string, id: string) {
  try {
    const docRef = doc(db, path, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${path}/${id}`);
  }
}

export async function getCollection(path: string, constraints: QueryConstraint[] = []) {
  try {
    const colRef = collection(db, path);
    const q = query(colRef, ...constraints);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function setDocument(path: string, id: string, data: DocumentData) {
  try {
    const docRef = doc(db, path, id);
    await setDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${id}`);
  }
}

export async function addDocument(path: string, data: DocumentData) {
  try {
    const colRef = collection(db, path);
    const docRef = await addDoc(colRef, {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDocument(path: string, id: string, data: DocumentData) {
  try {
    const docRef = doc(db, path, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
  }
}

export async function removeDocument(path: string, id: string, softDelete: boolean = true) {
  try {
    const docRef = doc(db, path, id);
    const softDeleteCollections = ["rooms", "events", "services", "children"];
    
    if (softDelete && softDeleteCollections.includes(path)) {
      await updateDoc(docRef, {
        deleted: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else {
      await deleteDoc(docRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
  }
}

export async function restoreDocument(path: string, id: string) {
  try {
    const docRef = doc(db, path, id);
    await updateDoc(docRef, {
      deleted: false,
      deletedAt: null,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
  }
}

export async function deactivateUser(uid: string) {
  try {
    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, {
      deactivated: true,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function getUserByEmail(email: string) {
  try {
    const colRef = collection(db, "users");
    const q = query(colRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "users");
  }
}

export async function getInvitationByToken(token: string) {
  try {
    const response = await fetch(`/api/validate-invite?token=${token}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to validate invitation");
    }
    
    return data;
  } catch (error: any) {
    console.error("Invitation validation failed:", error.message);
    throw error;
  }
}

export function subscribeToCollection(path: string, constraints: QueryConstraint[], callback: (data: any[]) => void) {
  const colRef = collection(db, path);
  const q = query(colRef, ...constraints);
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export function subscribeToDocument(path: string, id: string, callback: (data: any) => void, onError?: (error: any) => void) {
  const docRef = doc(db, path, id);
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
    } else {
      callback(null);
    }
  }, (error) => {
    if (onError) {
      onError(error);
    } else {
      handleFirestoreError(error, OperationType.GET, `${path}/${id}`);
    }
  });
}

export async function getChurches() {
  return getCollection("churches");
}

export async function createMembershipRequest(data: any) {
  return addDocument("membershipRequests", {
    ...data,
    status: "pending"
  });
}

export async function getPendingRequests(churchId: string) {
  return getCollection("membershipRequests", [
    where("churchId", "==", churchId),
    where("status", "==", "pending")
  ]);
}

export async function approveMembershipRequest(requestId: string, userId: string, churchId: string, role: string = "parent") {
  try {
    // 1. Update request status
    await updateDocument("membershipRequests", requestId, {
      status: "approved"
    });

    // 2. Update user document
    await updateDocument("users", userId, {
      churchId,
      role,
      status: "approved"
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `membershipRequests/${requestId}`);
  }
}

export async function logAudit(data: {
  action: string;
  category: "security" | "checkin" | "checkout" | "admin" | "system_error";
  details: any;
  churchId?: string;
  userId?: string;
}) {
  try {
    // Filter out undefined values to prevent Firestore errors
    const cleanData = Object.entries(data).reduce((acc, [key, value]) => {
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {} as any);

    await addDocument("audit_logs", {
      ...cleanData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
}

/**
 * Executes a Firestore transaction with standardized error handling.
 */
export async function executeTransaction<T>(
  updateFunction: (transaction: any) => Promise<T>
): Promise<T> {
  try {
    return await runTransaction(db, updateFunction);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "transaction");
    throw error;
  }
}

// Event & Service Management
export async function getEvents(churchId: string) {
  return getCollection("events", [where("churchId", "==", churchId)]);
}

export async function getServices(churchId: string, eventId?: string) {
  const constraints = [where("churchId", "==", churchId)];
  if (eventId) {
    constraints.push(where("eventId", "==", eventId));
  }
  return getCollection("services", constraints);
}

export async function getActiveService(churchId: string) {
  const services = await getCollection("services", [
    where("churchId", "==", churchId),
    where("status", "==", "active")
  ]);
  return services.length > 0 ? services[0] : null;
}

export async function activateService(churchId: string, serviceId: string) {
  try {
    // 1. Deactivate any currently active service
    const activeServices = await getCollection("services", [
      where("churchId", "==", churchId),
      where("status", "==", "active")
    ]);
    
    for (const service of activeServices) {
      if (service.id !== serviceId) {
        await updateDocument("services", service.id, { status: "closed" });
      }
    }

    // 2. Activate the new service
    await updateDocument("services", serviceId, { status: "active" });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `services/${serviceId}`);
  }
}

export async function closeService(serviceId: string) {
  try {
    await updateDocument("services", serviceId, { status: "closed" });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `services/${serviceId}`);
  }
}

export async function ensureSundayEvents(churchId: string) {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    nextSunday.setHours(0, 0, 0, 0);
    
    const year = nextSunday.getFullYear();
    const month = String(nextSunday.getMonth() + 1).padStart(2, '0');
    const day = String(nextSunday.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Check if event already exists
    const existingEvents = await getCollection("events", [
      where("churchId", "==", churchId),
      where("date", "==", dateStr)
    ]);
    
    if (existingEvents.length === 0) {
      const eventId = await addDocument("events", {
        churchId,
        name: `Sunday Service - ${formatDate(nextSunday)}`,
        date: dateStr
      });
      
      if (eventId) {
        // Create default services
        await addDocument("services", {
          eventId,
          churchId,
          name: "09:00 Service",
          startTime: "09:00",
          endTime: "10:30",
          status: "upcoming",
          date: dateStr
        });
        
        await addDocument("services", {
          eventId,
          churchId,
          name: "11:00 Service",
          startTime: "11:00",
          endTime: "12:30",
          status: "upcoming",
          date: dateStr
        });
      }
    }
  } catch (error) {
    console.error("Failed to ensure Sunday events:", error);
  }
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

