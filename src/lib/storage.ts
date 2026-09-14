import { 
  getStorage,
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { app } from "./firebase";

/* Created here rather than in lib/firebase.ts. That module is in the entry
   chunk -- every page needs Auth and Firestore -- and exporting Storage from
   it pulled the Storage SDK into the marketing home page's download. Only the
   pages that upload (parent dashboard, profile, church settings) import this
   module, and all of them are lazy route chunks. */
export const storage = getStorage(app);

/**
 * Uploads a file to Firebase Storage
 * @param path The path where the file should be stored (e.g., 'logos/churchId/logo.png')
 * @param file The file object to upload
 * @returns The download URL of the uploaded file
 */
export async function uploadFile(path: string, file: File): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Deletes a file from Firebase Storage
 * @param path The path of the file to delete
 */
export async function deleteFile(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}

/**
 * Extracts the storage path from a download URL
 * @param url The download URL
 * @returns The storage path or null if not a Firebase Storage URL
 */
export function getPathFromUrl(url: string): string | null {
  try {
    const decodedUrl = decodeURIComponent(url);
    const parts = decodedUrl.split('/o/');
    if (parts.length < 2) return null;
    const pathWithParams = parts[1];
    return pathWithParams.split('?')[0];
  } catch (err) {
    return null;
  }
}
