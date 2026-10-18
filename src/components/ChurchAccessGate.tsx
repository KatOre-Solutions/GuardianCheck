import React from "react";
import { useAuth } from "../hooks/useAuth";
import { useLiveDocument } from "../hooks/useLiveData";
import { useChurchLocked } from "../hooks/useChurchAccess";
import { ChurchLockedScreen } from "./ChurchLockedScreen";
import { ChurchAccessBoundary } from "./ChurchAccessBoundary";

/**
 * Swaps a tenant page for the locked screen once the church's access has ended
 * (see src/lib/churchAccess.ts).
 *
 * Wraps the admin pages. The parent and volunteer pages handle the lock
 * themselves, because a locked church may still have children checked in: the
 * parent must still be able to show a guardian QR, and the volunteer must still
 * be able to scan it.
 *
 * Mount protected pages only after the church document has loaded. Loading,
 * failed reads and missing documents must not be treated as unmetered access.
 */
export function ChurchAccessGate({ children }: { children: React.ReactNode }) {
  const { userData, roles, loading } = useAuth();
  const isMasterAdmin = roles.includes("master_admin");
  const churchId: string | undefined = userData?.churchId;

  if (loading) return <ChurchAccessBoundary status="loading" hasChurch={false}>{children}</ChurchAccessBoundary>;
  if (isMasterAdmin) return <>{children}</>;
  if (!churchId) return <ChurchAccessBoundary status="error" hasChurch={false}>{children}</ChurchAccessBoundary>;

  // Remount the subscription when the account's church changes, so a previous
  // church's ready state can never admit the new church's page.
  return <ChurchAccessForChurch key={churchId} churchId={churchId} canPay={roles.includes("admin")}>{children}</ChurchAccessForChurch>;
}

const ChurchAccessForChurch: React.FC<{
  churchId: string;
  canPay: boolean;
  children: React.ReactNode;
}> = ({ churchId, canPay, children }) => {
  const churchDoc = useLiveDocument("churches", churchId);
  const locked = useChurchLocked(churchDoc.data);

  return (
    <ChurchAccessBoundary status={churchDoc.status} hasChurch={!!churchDoc.data}>
      {locked
        ? <ChurchLockedScreen church={churchDoc.data} churchId={churchId} canPay={canPay} />
        : children}
    </ChurchAccessBoundary>
  );
};

export default ChurchAccessGate;
