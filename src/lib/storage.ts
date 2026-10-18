import { auth } from "./firebase";

/** Church branding is public, but only a church administrator can change it. */
export async function uploadChurchLogo(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to upload a logo");
  const token = await user.getIdToken();
  const response = await fetch("/api/church-logo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Logo upload failed");
  return data.url;
}

export async function deleteChurchLogo(url: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to delete a logo");
  const token = await user.getIdToken();
  const response = await fetch(`/api/church-logo?ref=${encodeURIComponent(url)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Logo deletion failed");
}
