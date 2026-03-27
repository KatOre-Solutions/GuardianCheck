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
  FirestoreError,
  DocumentData,
  QueryConstraint
} from "firebase/firestore";
import { db, auth } from "./firebase";

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
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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

export async function removeDocument(path: string, id: string) {
  try {
    const docRef = doc(db, path, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
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
    const colRef = collection(db, "invitations");
    const q = query(colRef, where("token", "==", token), where("status", "==", "pending"));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "invitations");
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
  category: "security" | "checkin" | "checkout" | "admin";
  details: any;
  churchId: string;
  userId: string;
}) {
  try {
    await addDocument("audit_logs", {
      ...data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
}

