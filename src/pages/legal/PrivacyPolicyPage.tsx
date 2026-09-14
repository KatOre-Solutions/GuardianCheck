import { LegalPage } from "../../components/LegalPage";
import { LEGAL_CONTENT } from "../../constants/legalContent";

/**
 * #25: public /privacy, rendering the same content already shown (behind
 * auth) in PolicyAcceptancePage — this is not new copy, it is the existing
 * POPIA-compliant policy made reachable without signing in first.
 */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      seoTitle="Privacy Policy"
      seoDescription="How GuardianCheck collects, uses and protects personal information, including children's data, in compliance with POPIA."
      canonicalPath="/privacy"
      heading={LEGAL_CONTENT.privacyPolicy.title}
      lastUpdated={LEGAL_CONTENT.lastUpdated}
      sections={LEGAL_CONTENT.privacyPolicy.sections}
    />
  );
}
