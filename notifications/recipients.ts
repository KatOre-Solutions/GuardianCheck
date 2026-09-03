import type { NotifyContext } from "./types.js";

export interface Recipient {
  /** A Firebase Auth uid for the account-holder parent, or `guardian:{docId}` for the flagged-off guardian path below. */
  userId: string;
  email: string;
  /** From the same `users` doc read as `email` -- no extra Firestore read to know WhatsApp eligibility. Undefined for the guardian path (guardians don't have their own verification flow). */
  whatsappNumber?: string;
  whatsappVerifiedAt?: string;
}

function countRead(ctx?: NotifyContext) {
  if (ctx?.firestoreOps) ctx.firestoreOps.reads++;
}

/**
 * Extracted from `emailService.ts`'s old `sendNotification` (child ->
 * parentId -> users.email, plus a guardians query filtered on `gData.email`).
 *
 * MVP recipient decision (plan section 3, P5): the account-holding parent
 * only. Guardians never actually receive anything in practice today --
 * `guardians.email` is a field no code path writes -- so the guardian branch
 * below is kept for the future (consent + verification per the plan) but
 * gated behind `NOTIFY_GUARDIANS`, off by default, so this function's
 * observable behavior for now is unchanged from what it replaces.
 */
export async function resolveRecipients(db: any, churchId: string, childId: string, ctx?: NotifyContext): Promise<Recipient[]> {
  const childDoc = await db.collection("children").doc(childId).get();
  countRead(ctx);
  if (!childDoc.exists) return [];

  const parentId = childDoc.data().parentId;
  const recipients: Recipient[] = [];

  if (parentId) {
    const parentDoc = await db.collection("users").doc(parentId).get();
    countRead(ctx);
    const parentData = parentDoc.exists ? parentDoc.data() : null;
    if (parentData?.email) {
      recipients.push({
        userId: parentId,
        email: parentData.email,
        whatsappNumber: parentData.whatsappNumber ?? undefined,
        whatsappVerifiedAt: parentData.whatsappVerifiedAt ?? undefined,
      });
    }
  }

  if (process.env.NOTIFY_GUARDIANS === "true") {
    const guardiansSnapshot = await db.collection("guardians")
      .where("churchId", "==", churchId)
      .where("childIds", "array-contains", childId)
      .where("active", "==", true)
      .get();
    countRead(ctx);

    guardiansSnapshot.forEach((doc: any) => {
      const g = doc.data();
      if (g.email) recipients.push({ userId: `guardian:${doc.id}`, email: g.email });
    });
  }

  const seen = new Set<string>();
  return recipients.filter((r) => {
    if (seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  });
}
