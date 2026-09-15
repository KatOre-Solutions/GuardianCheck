import React, { useState } from "react";
import { format } from "date-fns";
import { Lock } from "lucide-react";
import PayFastButton from "./PayFastButton";
import { PLAN_LIMITS, type PlanTier } from "../constants/plans";
import { COMPANY } from "../constants/company";
import { toDate } from "../lib/churchAccess";

interface ChurchLockedScreenProps {
  /** The `churches` document. */
  church: any;
  churchId: string;
  /** Admins get the plan picker and payment button; everyone else a notice. */
  canPay: boolean;
}

const PLAN_ORDER: PlanTier[] = ["starter", "growth", "professional"];

/**
 * What a locked church sees instead of its dashboard.
 *
 * The admin's version is a billing page and nothing else: pick a plan, pay.
 * There is no "payment received" step to wait on. The caller renders this from
 * a live subscription to the church document, so once the PayFast ITN moves
 * `accessUntil` forward the dashboard comes back by itself.
 *
 * No `billingDate` is passed to PayFastButton. That field defers the first
 * charge to a future date, which is right during a trial and wrong here: the
 * trial is over, and a date in the past is one PayFast refuses.
 */
export function ChurchLockedScreen({ church, churchId, canPay }: ChurchLockedScreenProps) {
  const currentPlan = String(church?.plan || "starter").toLowerCase();
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(
    (PLAN_ORDER as string[]).includes(currentPlan) ? (currentPlan as PlanTier) : "starter",
  );

  const wasTrial = church?.status === "trialing";
  const accessUntil = toDate(church?.accessUntil);
  const endedOn = accessUntil ? format(accessUntil, "d MMMM yyyy") : null;
  const churchName = church?.name || "Your church";

  const heading = canPay
    ? wasTrial ? "Your free trial has ended" : "Your subscription has lapsed"
    : `${churchName}'s access is paused`;

  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-12 space-y-8">
      <div className="text-center space-y-4">
        <div className="h-20 w-20 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto">
          <Lock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{heading}</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
          {canPay
            ? `${churchName}'s access to GuardianCheck ended${endedOn ? ` on ${endedOn}` : ""}. Choose a plan to restore it for your whole team.`
            : "Check-in is unavailable until your church administrator renews GuardianCheck. Please let them know."}
        </p>
      </div>

      {canPay && (
        <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
          <div role="radiogroup" aria-label="Choose a plan" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PLAN_ORDER.map((tier) => {
              const plan = PLAN_LIMITS[tier];
              const selected = selectedPlan === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedPlan(tier)}
                  className={`text-left p-4 rounded-2xl border-2 transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-gray-100 dark:border-gray-800 hover:border-primary/40"
                  }`}
                >
                  <p className="font-bold text-gray-900 dark:text-white">{plan.label}</p>
                  <p className="text-xl font-bold text-primary">
                    R{plan.priceZar}
                    <span className="text-sm text-gray-500 font-normal">/mo</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{plan.summary}</p>
                </button>
              );
            })}
          </div>

          <PayFastButton
            churchId={churchId}
            plan={selectedPlan}
            amount={PLAN_LIMITS[selectedPlan].priceZar}
            itemName={`GuardianCheck ${PLAN_LIMITS[selectedPlan].label} Subscription`}
            mPaymentId={`SUB-${churchId}-${Date.now()}`}
          />

          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            PayFast opens in a new tab. This page unlocks by itself as soon as PayFast confirms
            your payment, usually within a minute. If you have paid and it stays locked, email{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-primary font-medium hover:underline">
              {COMPANY.email}
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}

export default ChurchLockedScreen;
