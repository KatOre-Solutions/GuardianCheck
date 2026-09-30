import { auth } from "./firebase";

export function isPrivateImageReference(reference: string): boolean {
  if (reference.startsWith("storage://")) return true;
  try {
    const url = new URL(reference);
    return url.protocol === "https:" && url.hostname === "firebasestorage.googleapis.com" &&
      /\/o\/(profiles|children|guardians)%2F/i.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizedPrivateReference(reference: string): string {
  if (reference.startsWith("storage://")) return reference;
  const url = new URL(reference);
  const encodedPath = url.pathname.split("/o/")[1];
  return `storage://${decodeURIComponent(encodedPath)}`;
}

export async function uploadPrivateImage(kind: "profiles" | "children" | "guardians", file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to upload an image");
  const token = await user.getIdToken();
  const response = await fetch(`/api/private-images/${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Image upload failed");
  const data = await response.json();
  return data.reference;
}

export async function fetchPrivateImageUrl(reference: string, signal?: AbortSignal): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to view an image");
  const token = await user.getIdToken();
  const response = await fetch(`/api/private-images?ref=${encodeURIComponent(normalizedPrivateReference(reference))}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) throw new Error("Image unavailable");
  const data = await response.json();
  return data.url;
}
