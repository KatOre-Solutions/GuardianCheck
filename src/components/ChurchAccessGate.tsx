import React from "react";
import { useAuth } from "../hooks/useAuth";
import { useLiveDocument } from "../hooks/useLiveData";
import { useChurchLocked } from "../hooks/useChurchAccess";
import { ChurchLockedScreen } from "./ChurchLockedScreen";

/**
 * Swaps a tenant page for the locked screen once the church's access has ended
 * (see src/lib/churchAccess.ts).
 *
 * Wraps the admin pages. The parent and volunteer pages handle the lock
 * themselves, because a locked church may still have children checked in: the
 * parent must still be able to show a guardian QR, and the volunteer must still
 * be able to scan it.
 *
 * The page renders while the church document is still loading rather than
 * waiting on it. Paying churches are nearly every church, and holding every
 * dashboard behind one more round trip would slow them all down to hide a page
 * from the few that are locked. That page could not do anything anyway: the
 * server and the Firestore rules refuse a locked church's writes on their own.
 */
export function ChurchAccessGate({ children }: { children: React.ReactNode }) {
  const { userData, roles } = useAuth();
  const isMasterAdmin = roles.includes("master_admin");
  const churchId: string | undefined = userData?.churchId;

  const churchDoc = useLiveDocument("churches", isMasterAdmin ? null : churchId);
  const locked = useChurchLocked(churchDoc.data);

  if (locked && churchId) {
    return <ChurchLockedScreen church={churchDoc.data} churchId={churchId} canPay={roles.includes("admin")} />;
  }

  return <>{children}</>;
}

export default ChurchAccessGate;
