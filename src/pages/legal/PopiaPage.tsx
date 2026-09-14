import { Link } from "react-router-dom";
import { LegalPage, type LegalSection } from "../../components/LegalPage";
import { LEGAL_CONTENT } from "../../constants/legalContent";

/**
 * #27: a POPIA-specific notice, distinct from /privacy rather than a copy of
 * it — reusing every section from `privacyPolicy` here would make the two
 * pages near-duplicates, which is a worse outcome for a page whose entire
 * purpose is search visibility. This pulls out only the sections POPIA
 * itself is about (responsible party, children's data, rights) and leaves
 * the rest (what's collected, third parties, confidentiality) to /privacy,
 * which it links to for the full picture.
 */

// The reused sections carry the Privacy Policy's own numbering ("2. ...",
// "4. ...", "6. ..."), which would print gaps if kept as-is here. Strip it and
// let the combined list below number itself sequentially for this page.
const unnumbered: LegalSection[] = [
  {
    id: "what-is-popia",
    title: "What is POPIA?",
    content:
      "The Protection of Personal Information Act (POPIA) is South Africa's data protection law. It governs how organisations may collect, use, store and share personal information, and gives individuals enforceable rights over their own data.",
  },
  ...LEGAL_CONTENT.privacyPolicy.sections
    .filter((s) => ["responsible-party", "children-data", "user-rights"].includes(s.id))
    .map((s) => ({ ...s, title: s.title.replace(/^\d+\.\s*/, "") })),
];

const sections: LegalSection[] = unnumbered.map((s, i) => ({ ...s, title: `${i + 1}. ${s.title}` }));

export default function PopiaPage() {
  return (
    <LegalPage
      seoTitle="POPIA notice"
      seoDescription="How GuardianCheck applies South Africa's Protection of Personal Information Act (POPIA), including safeguards for children's data."
      canonicalPath="/popia"
      heading="POPIA Notice"
      lastUpdated={LEGAL_CONTENT.lastUpdated}
      sections={sections}
      intro={
        <p className="text-gray-600 dark:text-gray-400">
          This notice covers GuardianCheck's specific obligations under POPIA. For the full detail on what
          information is collected and how it is used, see the{" "}
          <Link to="/privacy" className="text-primary font-medium hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      }
    />
  );
}
