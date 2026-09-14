import { useSyncExternalStore } from "react";

/**
 * Whether MarketingHeader's mobile nav sheet is open, readable from anywhere
 * in the marketing tree without threading props or a context provider
 * through Layout. The only other reader is DemoInvite, which hides while the
 * sheet covers the screen -- see docs/marketing-redesign-plan.md §7.
 */
let isOpen = false;
const listeners = new Set<() => void>();

export function setMarketingMobileMenuOpen(open: boolean): void {
  if (open === isOpen) return;
  isOpen = open;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMarketingMobileMenuOpen(): boolean {
  return useSyncExternalStore(subscribe, () => isOpen);
}
