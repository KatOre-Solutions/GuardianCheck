import { randomUUID } from "node:crypto";

export type PrivateImageKind = "children" | "guardians" | "profiles";

export interface StorageUser {
  uid: string;
  email?: string;
  role?: string;
  roles?: string[];
  status?: string;
  churchId?: string;
}

export interface PrivateImageTarget {
  kind: PrivateImageKind;
  ownerUid: string;
  churchId?: string;
  path: string;
}

const PRIVATE_KINDS = new Set(["children", "guardians", "profiles"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PRIVATE_IMAGE_BYTES = 4 * 1024 * 1024;

export function parsePrivateImagePath(path: string): PrivateImageTarget | null {
  if (!path || path.length > 512 || path.includes("\\") || path.includes("..") || path.includes("//")) return null;
  const parts = path.split("/");
  if (!PRIVATE_KINDS.has(parts[0]) || parts.some((part) => !part || /[\x00-\x1f\x7f]/.test(part))) return null;
  if (parts.slice(0, -1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  if (parts[0] === "profiles" && parts.length === 3) {
    return { kind: "profiles", ownerUid: parts[1], path };
  }
  if ((parts[0] === "children" || parts[0] === "guardians") && parts.length === 4) {
    return { kind: parts[0], churchId: parts[1], ownerUid: parts[2], path };
  }
  if ((parts[0] === "children" || parts[0] === "guardians") && parts.length === 3) {
    return { kind: parts[0], ownerUid: parts[1], path };
  }
  return null;
}

export function privateImagePathFromReference(reference: string, bucket: string): string | null {
  if (typeof reference !== "string" || reference.length > 2048) return null;
  if (reference.startsWith("storage://")) {
    const path = reference.slice("storage://".length);
    return parsePrivateImagePath(path)?.path ?? null;
  }
  try {
    const url = new URL(reference);
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") return null;
    const prefix = `/v0/b/${encodeURIComponent(bucket)}/o/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return parsePrivateImagePath(path)?.path ?? null;
  } catch {
    return null;
  }
}

export function isPlatformAdmin(user: StorageUser): boolean {
  return user.uid === "snJ3JJXtRzbQXZ2FqXT403pEAwc2" ||
    user.email === "oreutlwilediutlwileng@gmail.com" ||
    user.role === "master_admin" ||
    (Array.isArray(user.roles) && user.roles.includes("master_admin"));
}

function hasRole(user: StorageUser, role: string): boolean {
  return user.role === role || (Array.isArray(user.roles) && user.roles.includes(role));
}

export function mayReadPrivateImage(actor: StorageUser, owner: StorageUser | null, target: PrivateImageTarget): boolean {
  if (isPlatformAdmin(actor)) return true;
  if (actor.status !== "approved" || !actor.churchId || !owner || owner.churchId !== actor.churchId) return false;
  if (target.churchId && target.churchId !== actor.churchId) return false;
  if (actor.uid === target.ownerUid && (hasRole(actor, "parent") || hasRole(actor, "volunteer") || hasRole(actor, "admin"))) return true;
  return hasRole(actor, "volunteer") || hasRole(actor, "admin");
}

export function mayUploadPrivateImage(actor: StorageUser, kind: PrivateImageKind): boolean {
  if (isPlatformAdmin(actor)) return kind === "profiles" || !!actor.churchId;
  if (actor.status !== "approved" || !actor.churchId) return false;
  if (kind === "profiles") return hasRole(actor, "parent") || hasRole(actor, "volunteer") || hasRole(actor, "admin");
  return hasRole(actor, "parent") || hasRole(actor, "admin");
}

export function mayManageChurchBranding(actor: StorageUser): boolean {
  return isPlatformAdmin(actor) || (actor.status === "approved" && !!actor.churchId && hasRole(actor, "admin"));
}

export function validImageBytes(contentType: string, body: Buffer): boolean {
  if (!IMAGE_TYPES.has(contentType) || body.length === 0 || body.length > MAX_PRIVATE_IMAGE_BYTES) return false;
  if (contentType === "image/jpeg") {
    return body.length >= 4 && body[0] === 0xff && body[1] === 0xd8 &&
      body[2] === 0xff && body[body.length - 2] === 0xff && body[body.length - 1] === 0xd9;
  }
  if (contentType === "image/png") {
    return body.length >= 20 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      body.toString("ascii", body.length - 8, body.length - 4) === "IEND";
  }
  return body.length >= 20 && body.toString("ascii", 0, 4) === "RIFF" &&
    body.readUInt32LE(4) === body.length - 8 && body.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(body.toString("ascii", 12, 16));
}

export function newPrivateImagePath(kind: PrivateImageKind, actor: StorageUser, extension: string): string {
  const id = randomUUID();
  return kind === "profiles"
    ? `profiles/${actor.uid}/${id}.${extension}`
    : `${kind}/${actor.churchId}/${actor.uid}/${id}.${extension}`;
}
