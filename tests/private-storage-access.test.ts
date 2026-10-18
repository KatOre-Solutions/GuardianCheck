import assert from "node:assert/strict";
import {
  MAX_PRIVATE_IMAGE_BYTES,
  mayManageChurchBranding,
  mayReadPrivateImage,
  mayUploadPrivateImage,
  newPrivateImagePath,
  parsePrivateImagePath,
  privateImagePathFromReference,
  validImageBytes,
  type StorageUser,
} from "../src/lib/privateStorageAccess";

const churchA = "123TestChurch";
const churchB = "other-test-church";
const parentA: StorageUser = { uid: "parent-a", role: "parent", status: "approved", churchId: churchA };
const parentB: StorageUser = { uid: "parent-b", role: "parent", status: "approved", churchId: churchA };
const parentOther: StorageUser = { uid: "parent-other", role: "parent", status: "approved", churchId: churchB };
const volunteerA: StorageUser = { uid: "volunteer-a", roles: ["parent", "volunteer"], status: "approved", churchId: churchA };
const volunteerOther: StorageUser = { uid: "volunteer-other", role: "volunteer", status: "approved", churchId: churchB };
const adminA: StorageUser = { uid: "admin-a", roles: ["admin"], status: "approved", churchId: churchA };
const adminOther: StorageUser = { uid: "admin-other", role: "admin", status: "approved", churchId: churchB };
const master: StorageUser = { uid: "platform", role: "master_admin", status: "approved" };
const noRole: StorageUser = { uid: "unknown", status: "approved", churchId: churchA };
const pending: StorageUser = { ...parentA, status: "pending" };

const target = parsePrivateImagePath("children/123TestChurch/parent-a/photo.jpg");
assert.ok(target);
assert.equal(mayReadPrivateImage(parentA, parentA, target), true);
assert.equal(mayReadPrivateImage(parentB, parentA, target), false);
assert.equal(mayReadPrivateImage(parentOther, parentA, target), false);
assert.equal(mayReadPrivateImage(volunteerA, parentA, target), true);
assert.equal(mayReadPrivateImage(volunteerOther, parentA, target), false);
assert.equal(mayReadPrivateImage(adminA, parentA, target), true);
assert.equal(mayReadPrivateImage(adminOther, parentA, target), false);
assert.equal(mayReadPrivateImage(master, parentA, target), true);
assert.equal(mayReadPrivateImage(noRole, parentA, target), false);
assert.equal(mayReadPrivateImage(pending, parentA, target), false);
assert.equal(mayReadPrivateImage(parentA, null, target), false);
assert.equal(mayReadPrivateImage(parentA, parentOther, target), false);

const legacy = parsePrivateImagePath("guardians/parent-a/1727383_My Photo.jpg");
assert.ok(legacy);
assert.equal(mayReadPrivateImage(parentA, parentA, legacy), true);
assert.equal(mayReadPrivateImage(volunteerA, parentA, legacy), true);
assert.equal(mayReadPrivateImage(parentB, parentA, legacy), false);
assert.equal(parsePrivateImagePath("children/123TestChurch/../x.jpg"), null);
assert.equal(parsePrivateImagePath("children/123TestChurch/parent-a/deep/x.jpg"), null);

const bucket = "gc.firebasestorage.app";
const oldUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/guardians%2Fparent-a%2F1727383_My%20Photo.jpg?alt=media&token=secret`;
assert.equal(privateImagePathFromReference(oldUrl, bucket), legacy.path);
assert.equal(privateImagePathFromReference(`storage://${target.path}`, bucket), target.path);
assert.equal(privateImagePathFromReference(oldUrl.replace(bucket, "other-bucket"), bucket), null);
assert.equal(privateImagePathFromReference("https://evil.example/o/children%2F123TestChurch%2Fparent-a%2Fx.jpg", bucket), null);

assert.equal(mayUploadPrivateImage(parentA, "children"), true);
assert.equal(mayUploadPrivateImage(parentA, "guardians"), true);
assert.equal(mayUploadPrivateImage(volunteerA, "children"), true); // Also has parent membership.
assert.equal(mayUploadPrivateImage({ ...volunteerA, roles: ["volunteer"] }, "children"), false);
assert.equal(mayUploadPrivateImage(adminA, "children"), true);
assert.equal(mayUploadPrivateImage(noRole, "profiles"), false);
assert.equal(mayUploadPrivateImage(pending, "profiles"), false);
assert.equal(mayManageChurchBranding(parentA), false);
assert.equal(mayManageChurchBranding(volunteerA), false);
assert.equal(mayManageChurchBranding(adminA), true);
assert.equal(mayManageChurchBranding(master), true);
assert.match(newPrivateImagePath("children", parentA, "jpg"), /^children\/123TestChurch\/parent-a\/[a-f0-9-]+\.jpg$/);

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
assert.equal(validImageBytes("image/jpeg", jpeg), true);
assert.equal(validImageBytes("text/plain", jpeg), false);
assert.equal(validImageBytes("image/jpeg", Buffer.from("not an image")), false);
assert.equal(validImageBytes("image/svg+xml", Buffer.from("<svg/>")), false);
assert.equal(validImageBytes("image/jpeg", Buffer.alloc(MAX_PRIVATE_IMAGE_BYTES + 1)), false);

console.log("Private Storage authorization and validation tests passed");
