import { Seo } from "../components/Seo";
import { JsonLd } from "../components/JsonLd";
import { PLAN_LIMITS } from "../constants/plans";
import { MARKETING } from "../constants/marketing";
import { SITE_NAME, SITE_URL } from "../constants/site";
import { Hero } from "../components/marketing/Hero";
import { WhyGuardianCheck } from "../components/marketing/WhyGuardianCheck";
import { HowItWorks } from "../components/marketing/HowItWorks";
import { Safety } from "../components/marketing/Safety";
import { LeadersSection } from "../components/marketing/LeadersSection";
import { Pricing } from "../components/marketing/Pricing";
import { Faq } from "../components/marketing/Faq";
import { FinalCta } from "../components/marketing/FinalCta";
import { DemoInvite } from "../components/marketing/DemoInvite";
import { WhatsAppFloat } from "../components/marketing/WhatsAppFloat";

/**
 * The marketing home page at `/` — church decision makers only. A church's
 * own landing page at `/:churchSlug` is ChurchLanding, not this component;
 * splitting them (#122/#124 follow-up) is what let this page drop the
 * tenant branch it used to carry.
 *
 * See docs/marketing-redesign-plan.md for the structure and the truth
 * constraints every claim on this page was written against.
 */
export default function Home() {
  // #34: single-sourced from plans.ts so this cannot drift the way the old
  // page's separate display-copy pricing array did.
  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: "QR-code child check-in and pickup management for churches.",
    offers: Object.values(PLAN_LIMITS).map((plan) => ({
      "@type": "Offer",
      name: plan.label,
      price: plan.priceZar,
      priceCurrency: "ZAR",
      url: SITE_URL,
    })),
  };

  // Same list the page renders in <Faq>, so the structured data can never
  // claim an answer the visible page doesn't also say.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: MARKETING.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <div className="bg-canvas dark:bg-gray-950 transition-colors">
      <Seo
        documentTitle={`${SITE_NAME} | Child check-in and pickup for churches`}
        description="QR-code child check-in and authorised-guardian pickup for churches. See how it works, how safety is enforced, and simple rand pricing."
      />
      <JsonLd id="software-application-jsonld" data={softwareApplicationJsonLd} />
      <JsonLd id="faq-jsonld" data={faqJsonLd} />

      <Hero />
      <WhyGuardianCheck />
      <HowItWorks />
      <Safety />
      <LeadersSection />
      <Pricing />
      <Faq />
      <FinalCta />
      <DemoInvite />
      <WhatsAppFloat />
    </div>
  );
}
