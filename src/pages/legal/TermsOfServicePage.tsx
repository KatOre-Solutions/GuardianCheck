import { LegalPage } from "../../components/LegalPage";
import { LEGAL_CONTENT } from "../../constants/legalContent";

/**
 * #26. Content is the same Terms of Service already presented (behind auth)
 * in PolicyAcceptancePage — the version users actually accept.
 *
 * The AC for #26 explicitly asks for the copy to be flagged for legal
 * sign-off rather than reviewed here, so that flag is rendered rather than
 * silently assumed.
 */
export default function TermsOfServicePage() {
  return (
    <LegalPage
      seoTitle="Terms of Service"
      seoDescription="The terms governing use of GuardianCheck by churches, volunteers and parents."
      canonicalPath="/terms"
      heading={LEGAL_CONTENT.termsOfService.title}
      lastUpdated={LEGAL_CONTENT.lastUpdated}
      sections={LEGAL_CONTENT.termsOfService.sections}
      intro={
        <p className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4">
          This is the same Terms of Service every Admin accepts when they set up their church. It has not
          yet been reviewed by a lawyer.
        </p>
      }
    />
  );
}
