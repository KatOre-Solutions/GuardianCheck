/**
 * Tests for QR scanner camera selection (`src/lib/camera.ts`).
 *
 * Run with `npm run test:camera`. Needs no browser and no device — the ladder
 * and the ranking are pure so they can be exercised here, which matters
 * because the bug they fix cannot be reproduced on a desktop at all (Chrome's
 * device emulation does not emulate lenses).
 *
 * The label fixtures below are the real strings iOS and Android return. They
 * are the whole game: every rule in `camera.ts` is a bet on these conventions,
 * and the cases that matter most are the ones where the bet loses — a
 * localised label set, a device list with no recognisable rear camera, and a
 * phone whose only rear camera is one of the lenses we would rather avoid.
 */

import {
  findStoredCamera,
  pickRearCamera,
  resolveCamera,
  selectableCameras,
  storedCameraIsStale,
  type CameraDevice,
  type StoredCamera,
} from "../src/lib/camera";

let pass = 0;
let fail = 0;

const check = (name: string, expected: unknown, actual: unknown) => {
  const ok = Object.is(expected, actual);
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`,
  );
};

const dev = (id: string, label: string): CameraDevice => ({ id, label });

/* -------------------------------------------------------------------------- */
/* Fixtures — real label sets                                                 */
/* -------------------------------------------------------------------------- */

/** iPhone 13/14/15, Safari. The bug: `facingMode: "environment"` can bind to
 *  "Back Ultra Wide Camera" here. */
const iphonePro: CameraDevice[] = [
  dev("ios-front", "Front Camera"),
  dev("ios-back", "Back Camera"),
  dev("ios-dual-wide", "Back Dual Wide Camera"),
  dev("ios-ultra", "Back Ultra Wide Camera"),
  dev("ios-tele", "Back Telephoto Camera"),
  dev("ios-triple", "Back Triple Camera"),
];

/** An older, single-rear-camera iPhone — where the original code was fine. */
const iphoneOld: CameraDevice[] = [
  dev("old-front", "Front Camera"),
  dev("old-back", "Back Camera"),
];

/** Pixel/Android. Lens identity is not in the label at all; only the index is. */
const androidMulti: CameraDevice[] = [
  dev("a0", "camera2 0, facing back"),
  dev("a1", "camera2 1, facing front"),
  dev("a2", "camera2 2, facing back"),
  dev("a3", "camera2 3, facing front"),
];

const androidSingle: CameraDevice[] = [
  dev("s0", "camera2 0, facing back"),
  dev("s1", "camera2 1, facing front"),
];

/** A Samsung-style set that does name its lenses. */
const androidNamed: CameraDevice[] = [
  dev("n-front", "camera2 1, facing front"),
  dev("n-ultra", "Back Ultra Wide Camera"),
  dev("n-main", "camera2 0, facing back"),
  dev("n-macro", "Back Macro Camera"),
];

const laptop: CameraDevice[] = [dev("cam", "Integrated Webcam (04f2:b6d9)")];

/** A phone in a non-English locale. None of our rules match — this is the
 *  case the manual picker exists for. */
const localised: CameraDevice[] = [
  dev("fr-front", "Caméra avant"),
  dev("fr-back", "Caméra arrière"),
];

/** Labels are blank until camera permission has been granted. */
const unpermissioned: CameraDevice[] = [dev("blank-1", ""), dev("blank-2", "")];

/* -------------------------------------------------------------------------- */
/* pickRearCamera — ranking                                                   */
/* -------------------------------------------------------------------------- */

check("iPhone: picks the main wide, not the ultra-wide", "ios-back", pickRearCamera(iphonePro));
check("iPhone: never the telephoto", true, pickRearCamera(iphonePro) !== "ios-tele");
check("iPhone: never the ultra-wide", true, pickRearCamera(iphonePro) !== "ios-ultra");
check("older iPhone: the one rear camera", "old-back", pickRearCamera(iphoneOld));

check("Android: prefers camera index 0", "a0", pickRearCamera(androidMulti));
check("Android single rear camera", "s0", pickRearCamera(androidSingle));
check("Android: named problem lenses lose to the indexed main", "n-main", pickRearCamera(androidNamed));

check("a front camera is never chosen", null, pickRearCamera([dev("f", "Front Camera")]));
check("a laptop webcam is not a rear camera", null, pickRearCamera(laptop));
check("no devices at all", null, pickRearCamera([]));

/* The two ways the ranking is expected to lose. */
check("localised labels return null rather than a wild guess", null, pickRearCamera(localised));
check("blank labels (pre-permission) return null", null, pickRearCamera(unpermissioned));

/* And the case where a problem lens must still win. */
check(
  "an ultra-wide is returned when it is the only rear camera",
  "only-ultra",
  pickRearCamera([dev("f", "Front Camera"), dev("only-ultra", "Back Ultra Wide Camera")]),
);

/* "Back Dual Wide Camera" is the MAIN camera on iOS — a naive /wide/ rule
 * would reject exactly the lens we want. */
check(
  "dual wide is treated as a main camera, not an ultra-wide",
  "dw",
  pickRearCamera([dev("dw", "Back Dual Wide Camera"), dev("uw", "Back Ultra Wide Camera")]),
);
check(
  "but the plain back camera still outranks dual wide",
  "b",
  pickRearCamera([dev("dw", "Back Dual Wide Camera"), dev("b", "Back Camera")]),
);

/* -------------------------------------------------------------------------- */
/* selectableCameras — what the picker offers                                 */
/* -------------------------------------------------------------------------- */

check("picker lists every rear camera on iPhone", 5, selectableCameras(iphonePro).length);
check("picker excludes the front camera", false, selectableCameras(iphonePro).some(d => d.id === "ios-front"));
check("picker leads with the recommended camera", "ios-back", selectableCameras(iphonePro)[0].id);
check("picker still lists the problem lenses", true, selectableCameras(iphonePro).some(d => d.id === "ios-ultra"));

/* When nothing classifies as rear the volunteer needs the picker most, so it
 * must not come back empty. */
check("localised set still offers both cameras", 2, selectableCameras(localised).length);
check("blank-label set still offers something", 2, selectableCameras(unpermissioned).length);
check("no devices means nothing to offer", 0, selectableCameras([]).length);
check("a lone webcam is still offered", 1, selectableCameras(laptop).length);

/* -------------------------------------------------------------------------- */
/* findStoredCamera / staleness                                               */
/* -------------------------------------------------------------------------- */

const storedGood: StoredCamera = { id: "ios-ultra", label: "Back Ultra Wide Camera" };

check("a stored id present in the list resolves", "ios-ultra", findStoredCamera(iphonePro, storedGood)?.id);
check("a stored entry is not stale when it resolves", false, storedCameraIsStale(iphonePro, storedGood));

/* deviceId rotates across sessions and permission resets — iOS especially. */
const storedRotatedId: StoredCamera = { id: "stale-id-from-last-week", label: "Back Camera" };
check("a rotated id falls back to the label", "ios-back", findStoredCamera(iphonePro, storedRotatedId)?.id);
check("label-matched entries are not stale", false, storedCameraIsStale(iphonePro, storedRotatedId));

const storedGone: StoredCamera = { id: "gone", label: "Some Removed Camera" };
check("an entry matching nothing resolves to null", null, findStoredCamera(iphonePro, storedGone));
check("and is reported stale so it can be discarded", true, storedCameraIsStale(iphonePro, storedGone));

check("no stored entry resolves to null", null, findStoredCamera(iphonePro, null));
check("no stored entry is not stale", false, storedCameraIsStale(iphonePro, null));

const storedNoLabel: StoredCamera = { id: "gone", label: "" };
check("a rotated id with no label cannot be recovered", null, findStoredCamera(iphonePro, storedNoLabel));

/* -------------------------------------------------------------------------- */
/* resolveCamera — the ladder                                                 */
/* -------------------------------------------------------------------------- */

/* Rung 1 beats rung 2, even when the ranking disagrees. This is the point of
 * the ladder: a human already confirmed this lens works on this phone. */
const persisted = resolveCamera(iphonePro, storedGood);
check("persisted camera wins over the ranking", "ios-ultra", persisted?.deviceId);
check("and is reported as persisted", "persisted", persisted?.source);

const viaLabel = resolveCamera(iphonePro, storedRotatedId);
check("a label-recovered entry still counts as persisted", "persisted", viaLabel?.source);
check("and resolves to the right device", "ios-back", viaLabel?.deviceId);

const ranked = resolveCamera(iphonePro, storedGone);
check("a stale entry falls through to the ranking", "ios-back", ranked?.deviceId);
check("and is reported as ranked", "ranked", ranked?.source);

const noStore = resolveCamera(androidMulti, null);
check("with no stored entry the ranking decides", "a0", noStore?.deviceId);
check("reported as ranked", "ranked", noStore?.source);

/* Rungs 3 and 4 belong to the component, so the ladder signals them with
 * null rather than inventing a camera. */
check("localised labels fall through to the caller", null, resolveCamera(localised, null));
check("no devices falls through to the caller", null, resolveCamera([], null));
check("a laptop webcam falls through to the caller", null, resolveCamera(laptop, null));

check(
  "falling through does not throw on a stale entry with no devices",
  null,
  resolveCamera([], storedGone),
);

/* -------------------------------------------------------------------------- */

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
