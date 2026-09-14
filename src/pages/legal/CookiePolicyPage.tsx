import { LegalPage, type LegalSection } from "../../components/LegalPage";
import { LEGAL_CONTENT } from "../../constants/legalContent";

/**
 * #28. Lists what the app actually stores in the browser, audited from the
 * codebase rather than templated — GuardianCheck sets no cookies of its own
 * and runs no advertising or tracking cookies. This must be re-checked
 * whenever browser storage usage changes; it is describing fact, not policy.
 */

const sections: LegalSection[] = [
  {
    id: "no-tracking",
    title: "1. No advertising or tracking cookies",
    content:
      "GuardianCheck does not use advertising cookies, tracking pixels, or third-party marketing cookies. We do not sell data to advertisers or ad networks.",
  },
  {
    id: "essential-storage",
    title: "2. Essential browser storage",
    content:
      "Signing in uses Firebase Authentication, which stores your session in your browser's local storage so you stay signed in between visits. This is required for the app to function and cannot be disabled without signing out.",
  },
  {
    id: "app-storage",
    title: "3. App preferences",
    content:
      "GuardianCheck stores a small amount of data in your browser's local storage directly: which church page you last viewed (so returning visitors land in the right place), a cached copy of your church's public details (to load pages faster), and your last-used camera on this device (for QR scanning). None of this is shared with third parties.",
  },
  {
    id: "security",
    title: "4. Bot protection",
    content:
      "We use Google's reCAPTCHA Enterprise (via Firebase App Check) to distinguish real users from automated abuse on sign-up and check-in actions. Google may set its own cookies as part of this — see Google's Privacy Policy for details.",
  },
  {
    id: "analytics",
    title: "5. Performance monitoring",
    content:
      "We use Vercel Speed Insights to measure page load performance. It does not use cookies or collect personally identifiable information.",
  },
  {
    id: "consent",
    title: "6. Cookie consent",
    content:
      "Because GuardianCheck sets no non-essential or advertising cookies, we do not currently show a cookie consent banner. This will be revisited if that changes.",
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      seoTitle="Cookie Policy"
      seoDescription="What GuardianCheck stores in your browser: essential sign-in storage, app preferences, and bot-protection cookies. No advertising or tracking cookies."
      canonicalPath="/cookies"
      heading="Cookie Policy"
      lastUpdated={LEGAL_CONTENT.lastUpdated}
      sections={sections}
    />
  );
}
