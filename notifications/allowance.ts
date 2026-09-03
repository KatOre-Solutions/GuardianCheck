import type { NotifyContext } from "./types.js";
import type { EmailProvider } from "./providers/email.js";

/**
 * Per-church monthly WhatsApp send counter. Plan section 3: "allowance
 * exhaustion falls back to email, never silence" -- reserveWhatsAppAllowance
 * is an admission check the caller must consult *before* attempting a
 * WhatsApp send; a "not allowed" result never blocks the email record
 * already enqueued alongside it (see notifyCheckins in service.ts).
 *
 * Sizing (product decision P1 in the plan) is not resolved -- no real SA
 * rate card has been priced against a plan tier yet. WHATSAPP_MONTHLY_ALLOWANCE_DEFAULT
 * defaults to 0, not some generous placeholder: an unconfigured allowance
 * must mean "exhausted immediately," not "unlimited," so a church can never
 * accidentally run up real Meta billing before someone deliberately sets a
 * number.
 */

export const CHURCH_USAGE_COLLECTION = "church_usage";

function monthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function docId(churchId: string, date: Date = new Date()): string {
  return `${churchId}_${monthKey(date)}`;
}

export interface ReserveResult {
  allowed: boolean;
  /** True exactly once per month, on the request that pushes the church over its limit -- see sendAllowanceExhaustedNotice. */
  justExhausted: boolean;
}

/**
 * Transactional read-increment: admits one more WhatsApp send against the
 * church's monthly allowance, or refuses if already at the limit. Not
 * refunded on a later send failure -- a failed attempt still spent a real
 * API call, the same way a bounced email still cost a Resend send.
 */
export async function reserveWhatsAppAllowance(db: any, churchId: string, ctx?: NotifyContext): Promise<ReserveResult> {
  const allowance = Number(process.env.WHATSAPP_MONTHLY_ALLOWANCE_DEFAULT || 0);
  const ref = db.collection(CHURCH_USAGE_COLLECTION).doc(docId(churchId));

  return db.runTransaction(async (tx: any) => {
    const doc = await tx.get(ref);
    if (ctx?.firestoreOps) ctx.firestoreOps.reads++;
    const data = doc.exists ? doc.data() : { whatsappSent: 0, exhaustionNotifiedAt: null };
    const whatsappSent = data.whatsappSent ?? 0;

    if (whatsappSent >= allowance) {
      const justExhausted = !data.exhaustionNotifiedAt;
      if (justExhausted) {
        tx.set(ref, {
          churchId,
          month: monthKey(),
          whatsappSent,
          exhaustionNotifiedAt: new Date().toISOString(),
        }, { merge: true });
        if (ctx?.firestoreOps) ctx.firestoreOps.writes++;
      }
      return { allowed: false, justExhausted };
    }

    tx.set(ref, {
      churchId,
      month: monthKey(),
      whatsappSent: whatsappSent + 1,
      exhaustionNotifiedAt: data.exhaustionNotifiedAt ?? null,
    }, { merge: true });
    if (ctx?.firestoreOps) ctx.firestoreOps.writes++;

    return { allowed: true, justExhausted: false };
  });
}

/**
 * Fires once per church per month (gated by reserveWhatsAppAllowance's
 * justExhausted, itself gated by exhaustionNotifiedAt) -- an admin sees one
 * email when the allowance runs out, not one per subsequently-skipped
 * message for the rest of the month.
 */
export async function sendAllowanceExhaustedNotice(db: any, churchId: string, emailProvider: EmailProvider, ctx?: NotifyContext): Promise<void> {
  const churchDoc = await db.collection("church_public").doc(churchId).get();
  if (ctx?.firestoreOps) ctx.firestoreOps.reads++;
  const churchName = churchDoc.exists ? churchDoc.data().name : "Your church";

  // Admin privilege is conferred by both `role` and `roles` throughout this
  // codebase (see firestore.rules) -- both queried here for the same reason.
  const [byRole, byRoles] = await Promise.all([
    db.collection("users").where("churchId", "==", churchId).where("role", "==", "admin").get(),
    db.collection("users").where("churchId", "==", churchId).where("roles", "array-contains", "admin").get(),
  ]);
  if (ctx?.firestoreOps) ctx.firestoreOps.reads += byRole.size + byRoles.size;

  const emails = new Set<string>();
  for (const doc of [...byRole.docs, ...byRoles.docs]) {
    const email = doc.data()?.email;
    if (email) emails.add(email);
  }

  const subject = `WhatsApp notification allowance reached for ${churchName}`;
  const html = `<p>${churchName} has reached its monthly WhatsApp notification allowance. Check-in and check-out notifications will continue by email as normal -- nothing is lost, WhatsApp delivery simply pauses until next month.</p>`;

  for (const email of emails) {
    await emailProvider.sendRaw(email, subject, html);
  }
}
