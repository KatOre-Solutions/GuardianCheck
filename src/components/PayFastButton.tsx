import React from "react";
import { CreditCard, Loader2 } from "lucide-react";

interface PayFastButtonProps {
  amount: number;
  itemName: string;
  mPaymentId: string;
  churchId: string;
  plan: string;
  isSandbox?: boolean;
}

export default function PayFastButton({ 
  amount, 
  itemName, 
  mPaymentId, 
  churchId, 
  plan,
  isSandbox = true 
}: PayFastButtonProps) {
  // These should come from environment variables
  const merchantId = (import.meta as any).env.VITE_PAYFAST_MERCHANT_ID || "10000100";
  const merchantKey = (import.meta as any).env.VITE_PAYFAST_MERCHANT_KEY || "46f0cd694581a";
  const isSandboxEnv = (import.meta as any).env.VITE_PAYFAST_SANDBOX === "true";
  
  const baseUrl = (isSandbox || isSandboxEnv)
    ? "https://sandbox.payfast.co.za/eng/process" 
    : "https://www.payfast.co.za/eng/process";

  // Use the current origin or a configured APP_URL for the notify_url
  const appUrl = (import.meta as any).env.VITE_APP_URL || window.location.origin;
  const returnUrl = `${window.location.origin}/admin?payment=success&plan=${plan}`;
  const cancelUrl = `${window.location.origin}/admin?payment=cancel`;
  const notifyUrl = `${appUrl}/api/payfast-itn`;

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

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center space-x-2"
      >
        <CreditCard className="h-5 w-5" />
        <span>Pay with PayFast (R{amount.toFixed(2)})</span>
      </button>
    </form>
  );
}
