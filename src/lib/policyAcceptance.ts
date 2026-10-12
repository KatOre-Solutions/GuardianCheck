import {
  doc, runTransaction, serverTimestamp,
  type DocumentData, type DocumentReference, type DocumentSnapshot,
  type Firestore, type Transaction,
} from "firebase/firestore";

interface AcceptPolicyVersionOptions {
  uid: string;
  version: string;
  churchId: string | null | undefined;
  role: string | null | undefined;
  roles: readonly string[];
  acceptedAtIso: string;
  userAgent: string;
  traceId: string;
}

// Snapshots must be read before any writes are queued in the transaction.
function createIfAbsent(
  transaction: Transaction,
  snapshot: DocumentSnapshot,
  reference: DocumentReference,
  data: DocumentData,
) {
  if (!snapshot.exists()) transaction.set(reference, data);
}

/** Records an explicit acceptance, or recovers an already committed acceptance. */
export async function acceptPolicyVersion(db: Firestore, options: AcceptPolicyVersionOptions) {
  const { uid, version, acceptedAtIso, userAgent, traceId } = options;
  const churchId = options.churchId || "system";
  const isAdmin = options.roles.includes("admin") || options.roles.includes("master_admin");
  const acceptanceRef = doc(db, "policy_acceptance", uid);
  const historyRef = doc(acceptanceRef, "history", version);
  const churchPolicyRef = doc(db, "church_policy_acceptance", churchId);

  return runTransaction(db, async (transaction) => {
    const [historySnap, summarySnap, churchPolicySnap] = await Promise.all([
      transaction.get(historyRef),
      transaction.get(acceptanceRef),
      isAdmin ? transaction.get(churchPolicyRef) : Promise.resolve(null),
    ]);

    // Both audit records are create-only. Retrying must preserve their contents.
    createIfAbsent(transaction, historySnap, historyRef, {
      version,
      acceptedAt: serverTimestamp(),
      churchId,
      roleAtTime: options.role || "unknown",
      legalContext: {
        policyHash: "sha256:placeholder_hash_v1",
        agreementType: isAdmin ? "Operator_Agreement" : "Privacy_Notice",
      },
      forensicData: { userAgent, ipMasked: "0.0.0.0", traceId },
      acceptanceMethod: "explicit_checkbox_click",
    });

    const summary = summarySnap.data();
    const summaryIsCurrent = summary?.lastAcceptedVersion === version &&
      summary?.status === "compliant" && typeof summary?.lastAcceptedAt === "string" &&
      Number.isFinite(Date.parse(summary.lastAcceptedAt));

    if (!historySnap.exists() || !summaryIsCurrent) {
      // A recovered summary describes the original event, never this retry.
      const lastAcceptedAt = historySnap.exists()
        ? historySnap.data().acceptedAt.toDate().toISOString()
        : acceptedAtIso;
      transaction.set(acceptanceRef, {
        lastAcceptedVersion: version,
        lastAcceptedAt,
        status: "compliant",
      });
    }

    if (churchPolicySnap) {
      createIfAbsent(transaction, churchPolicySnap, churchPolicyRef, {
        acceptedBy: uid,
        acceptedAt: serverTimestamp(),
        policyVersion: version,
      });
    }
  });
}
