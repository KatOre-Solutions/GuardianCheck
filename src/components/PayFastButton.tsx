import React from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { logger } from "../lib/logger";

interface PayFastButtonProps {
  amount: number;
  itemName: string;
  mPaymentId: string;
  churchId: string;
  plan: string;
  isSandbox?: boolean;
  billingDate?: string; // YYYY-MM-DD
  subscriptionType?: number; // 1 for monthly, 2 for quarterly, 3 for annual
}

export default function PayFastButton({ 
  amount, 
  itemName, 
  mPaymentId, 
  churchId, 
  plan,
  isSandbox: explicitSandbox,
  billingDate,
  subscriptionType = 1 // Default to monthly
}: PayFastButtonProps) {
  // Config from environment variables
  const envMerchantId = import.meta.env.VITE_PAYFAST_MERCHANT_ID;
  const envMerchantKey = import.meta.env.VITE_PAYFAST_MERCHANT_KEY;
  const isSandboxEnv = String(import.meta.env.VITE_PAYFAST_SANDBOX).toLowerCase() === "true";
  
  // Use explicit prop if provided, otherwise fallback to env config
  const isSandbox = explicitSandbox !== undefined ? explicitSandbox : isSandboxEnv;

  // Final credentials Logic:
  // If sandbox is TRUE, strictly use the provided sandbox keys and IGNORE environment variables.
  // If sandbox is FALSE, use the keys from the environment variables (Live mode).
  let merchantId: string;
  let merchantKey: string;

  if (isSandbox) {
    merchantId = "10047420";
    merchantKey = "t83mgmlr0c29k";
  } else {
    merchantId = envMerchantId || "";
    merchantKey = envMerchantKey || "";
  }
  
  const baseUrl = isSandbox
    ? "https://sandbox.payfast.co.za/eng/process" 
    : "https://www.payfast.co.za/eng/process";

  // Debugging info
  React.useEffect(() => {
    if (logger.isDevEnabled()) {
      logger.log("PAYFAST SECURITY CHECK:", {
        ENVIRONMENT: isSandbox ? "SANDBOX" : "LIVE",
        FINAL_MERCHANT_ID: merchantId,
        TARGET_URL: baseUrl,
        VITE_PAYFAST_SANDBOX_RAW: import.meta.env.VITE_PAYFAST_SANDBOX
      });
    }
  }, [isSandbox, baseUrl, merchantId]);

  // Configuration warning for developers
  const isMissingConfig = !merchantId || !merchantKey;

  let appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

  // Prevent dynamic authenticated preview environments from failing PayFast's external webhooks.
  if (!import.meta.env.VITE_APP_URL || appUrl.includes("run.app") || appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
    appUrl = "https://guardiancheck.co.za";
  }

  const returnUrl = `${appUrl}/admin?payment=success&plan=${plan}`;
  const cancelUrl = `${appUrl}/admin?payment=cancel`;
  const notifyUrl = import.meta.env.VITE_PAYFAST_NOTIFY_URL || `${appUrl}/api/payfast-itn`;

  if (isMissingConfig) {
    return (
      <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30 rounded-xl">
        <p className="text-sm text-orange-700 dark:text-orange-400 font-medium flex items-start gap-2">
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Payment configuration missing. Please ensure <strong>VITE_PAYFAST_MERCHANT_ID</strong> and <strong>VITE_PAYFAST_MERCHANT_KEY</strong> are set in your environment secrets for Live mode.
          </span>
        </p>
      </div>
    );
  }

  return (
    <form action={baseUrl} method="post">
      <input type="hidden" name="merchant_id" value={merchantId} />
      <input type="hidden" name="merchant_key" value={merchantKey} />
      <input type="hidden" name="return_url" value={returnUrl} />
      <input type="hidden" name="cancel_url" value={cancelUrl} />
      <input type="hidden" name="notify_url" value={notifyUrl} />
      
      <input type="hidden" name="name_first" value="Church" />
      <input type="hidden" name="name_last" value="Admin" />
      <input type="hidden" name="email_address" value="admin@church.com" />
      
      <input type="hidden" name="m_payment_id" value={mPaymentId} />
      <input type="hidden" name="amount" value={amount.toFixed(2)} />
      <input type="hidden" name="item_name" value={itemName} />
      <input type="hidden" name="item_description" value={`Subscription for ${itemName}`} />
      
      {/* Custom fields to pass churchId and plan to ITN */}
      <input type="hidden" name="custom_str1" value={churchId} />
      <input type="hidden" name="custom_str2" value={plan} />

      {/* Subscription / Recurring billing fields */}
      <input type="hidden" name="subscription_type" value="1" />
      <input type="hidden" name="recurring_amount" value={amount.toFixed(2)} />
      <input type="hidden" name="frequency" value={subscriptionType === 1 ? "3" : subscriptionType === 3 ? "6" : "3"} />
      <input type="hidden" name="cycles" value="0" />
      {billingDate && <input type="hidden" name="billing_date" value={billingDate} />}

      <button
        type="submit"
        className="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg flex items-center justify-center space-x-2"
      >
        <CreditCard className="h-5 w-5" />
        <span>{billingDate ? 'Subscribe After Trial' : `Pay with PayFast (R${amount.toFixed(2)})`}</span>
      </button>
    </form>
  );
}
