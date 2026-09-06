/**
 * Choosing which camera the QR scanner opens.
 *
 * ## Why this exists
 *
 * `QRScanner` used to start with `{ facingMode: "environment" }`, which asks
 * for *a rear camera* and lets the browser pick which one. On a phone with a
 * single rear camera that is unambiguous. On iPhone 13 and later, and on most
 * recent Android hardware, the rear "camera" is two to four physical lenses
 * and the browser frequently binds to the ultra-wide.
 *
 * That is why Bryanston could not scan on iPhones: the ultra-wide has a very
 * wide field of view (the code looks small and far away) and on most phones it
 * is fixed-focus or focuses poorly up close, so moving the phone nearer never
 * sharpens the picture. Nothing errors — `start()` succeeds, it just opened the
 * wrong lens — so the old `environment` → `user` fallback never fired.
 *
 * ## The resolution ladder
 *
 * A camera is resolved in a strict order, each rung tried only when the one
 * above yields nothing usable:
 *
 *   1. a persisted camera a human already confirmed works on this phone
 *   2. this module's ranking of the enumerated devices
 *   3. the manual picker in the UI
 *   4. the old `facingMode` chain, for devices we cannot enumerate at all
 *
 * Rungs 1 and 2 live here. Rungs 3 and 4 are the component's.
 *
 * ## The ranking is a guess, and is written as one
 *
 * Device labels are vendor-specific, unstable across OS versions, and
 * localised — a phone set to isiZulu or Afrikaans may return labels none of
 * these rules match. So the ranking:
 *
 *   - returns `null` when it cannot identify a rear camera at all, handing
 *     control down the ladder instead of guessing wildly;
 *   - never *excludes* a rear device, only ranks the problem lenses last, so a
 *     phone whose only rear camera is an ultra-wide still gets a camera;
 *   - cannot detect its own mistakes, because a wrong lens opens perfectly
 *     happily. Only a human looking at the preview can. That is what the
 *     manual picker is for, and why it is always available rather than shown
 *     after a failure.
 *
 * Everything here is pure except the three `localStorage` helpers at the
 * bottom, so the ladder can be tested without a browser.
 */

/** Structurally compatible with html5-qrcode's `CameraDevice`, declared here
 *  so this module stays dependency-free and testable. */
export interface CameraDevice {
  id: string;
  label: string;
}

/** Which rung of the ladder supplied the camera. Surfaced in the diagnostics
 *  line, because "it still doesn't work" is only actionable if we know what
 *  was tried. */
export type CameraSource = "persisted" | "ranked" | "manual" | "facingMode";

export interface StoredCamera {
  id: string;
  /** Kept because `deviceId` is not stable — see `findStoredCamera`. */
  label: string;
}

export interface ResolvedCamera {
  deviceId: string;
  source: CameraSource;
}

/* -------------------------------------------------------------------------- */
/* Label classification                                                       */
/* -------------------------------------------------------------------------- */

/** Front cameras are never a scanning candidate. */
const FRONT = /\b(front|selfie)\b|facing front|user[-\s]?facing/i;

/** Anything that says "rear" in a label convention we recognise. */
const REAR = /\b(back|rear)\b|facing back|environment/i;

/**
 * The lenses that cause this bug.
 *
 * Ordering matters: `ultra wide` must be tested before any plain `wide`,
 * because iOS's **"Back Dual Wide Camera" is the main camera** — a naive
 * /wide/ test would reject exactly the lens we want.
 */
const PROBLEM_LENS =
  /ultra[\s-]?wide|ultrawide|telephoto|\btele\b|\bmacro\b|\bdepth\b|monochrome|\bmono\b|infrared|\btof\b|0\.5/i;

/** iOS exposes the main rear camera under these exact names, best first. */
const IOS_MAIN = /^back camera$/i;
const IOS_DUAL_WIDE = /back dual wide camera/i;
const IOS_VIRTUAL = /back (dual|triple) camera/i;

/** Android: `camera2 0, facing back`. Index 0 is conventionally the main
 *  sensor, and reading the number is language-independent — which matters,
 *  since it is the one rule that survives a localised label. */
const ANDROID_INDEX = /camera2\s+(\d+)/i;

function isFront(device: CameraDevice): boolean {
  return FRONT.test(device.label);
}

function isRear(device: CameraDevice): boolean {
  return REAR.test(device.label) && !isFront(device);
}

/**
 * Higher is better. Only ever compared between rear cameras.
 *
 * The problem lenses are pushed far below everything else rather than removed,
 * so they win only when they are the sole candidate.
 */
function scoreOf(device: CameraDevice): number {
  let score = 0;

  if (IOS_MAIN.test(device.label)) score += 100;
  else if (IOS_DUAL_WIDE.test(device.label)) score += 90;
  else if (IOS_VIRTUAL.test(device.label)) score += 80;
  else score += 50;

  const androidIndex = device.label.match(ANDROID_INDEX);

  if (androidIndex) {
    /* Prefer the lowest index, without letting a long camera list overtake the
     * iOS name bonuses above. */
    score += Math.max(0, 10 - Number(androidIndex[1]));
  }

  if (PROBLEM_LENS.test(device.label)) score -= 1000;

  return score;
}

/* -------------------------------------------------------------------------- */
/* Rung 2 — ranking                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The best rear camera to open, or `null` when no device can be identified as
 * rear at all.
 *
 * `null` is a real answer, not a failure: it means the labels told us nothing
 * usable (localised, or blank because permission has not been granted yet),
 * and the caller should drop to the `facingMode` fallback rather than open an
 * arbitrary camera.
 */
export function pickRearCamera(devices: CameraDevice[]): string | null {
  const rear = (devices || []).filter(isRear);

  if (rear.length === 0) return null;

  const best = [...rear].sort((a, b) => scoreOf(b) - scoreOf(a))[0];

  return best.id;
}

/**
 * What the manual picker lists.
 *
 * Rear cameras when we can identify them, best-guess first so the recommended
 * one leads. When nothing classifies as rear — the localised-label case, which
 * is exactly when a human most needs to intervene — every device is offered
 * rather than an empty list.
 */
export function selectableCameras(devices: CameraDevice[]): CameraDevice[] {
  const all = devices || [];
  const rear = all.filter(isRear);
  const candidates = rear.length > 0 ? rear : all.filter((d) => !isFront(d));

  if (candidates.length === 0) return [...all];

  return [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));
}

/* -------------------------------------------------------------------------- */
/* Rung 1 — the persisted known-good camera                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a stored choice against the devices actually present.
 *
 * `deviceId` is not stable: it rotates across sessions, permission resets and
 * browser updates, and iOS Safari is particularly prone to it. So a stored
 * entry keeps the label too, and a stale id falls back to matching on that
 * before the entry is discarded.
 */
export function findStoredCamera(
  devices: CameraDevice[],
  stored: StoredCamera | null,
): CameraDevice | null {
  if (!stored) return null;

  const byId = (devices || []).find((d) => d.id === stored.id);

  if (byId) return byId;

  if (!stored.label) return null;

  return (devices || []).find((d) => d.label === stored.label) ?? null;
}

/**
 * The ladder's automatic rungs: a confirmed camera first, then the ranking.
 *
 * Returns `null` when neither yields anything, which is the caller's signal to
 * fall through to the `facingMode` chain.
 */
export function resolveCamera(
  devices: CameraDevice[],
  stored: StoredCamera | null,
): ResolvedCamera | null {
  const known = findStoredCamera(devices, stored);

  if (known) return { deviceId: known.id, source: "persisted" };

  const ranked = pickRearCamera(devices);

  if (ranked) return { deviceId: ranked, source: "ranked" };

  return null;
}

/** True when a stored entry no longer matches any present device, so the
 *  caller can discard it instead of retrying it every load. */
export function storedCameraIsStale(
  devices: CameraDevice[],
  stored: StoredCamera | null,
): boolean {
  return stored !== null && findStoredCamera(devices, stored) === null;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "guardiancheck.scanner.camera";

/*
 * Only a camera the volunteer picked by hand is stored, never one the ranking
 * chose. "Known-good" has to mean a human confirmed it: caching a ranked guess
 * would make a wrong pick sticky on that phone, which is the one failure mode
 * worse than the bug being fixed.
 *
 * Every access is wrapped — Safari private mode throws on `localStorage`.
 */

export function readStoredCamera(): StoredCamera | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (typeof parsed?.id !== "string") return null;

    return { id: parsed.id, label: typeof parsed.label === "string" ? parsed.label : "" };
  } catch {
    return null;
  }
}

export function writeStoredCamera(camera: StoredCamera): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(camera));
  } catch {
    /* A volunteer in private mode simply re-picks each session. */
  }
}

export function clearStoredCamera(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to do — the stale entry is ignored either way. */
  }
}
