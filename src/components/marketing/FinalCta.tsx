import { SiteLink } from "../SiteLink";
import { ArrowRight } from "lucide-react";
import { DEMO_MESSAGE } from "../../constants/marketing";
import { COMPANY } from "../../constants/company";
import { whatsappUrl } from "../../lib/whatsapp";
import { TRIAL_MONTHS } from "../../constants/plans";

export function FinalCta() {
  const demoHref = whatsappUrl(COMPANY.whatsapp, DEMO_MESSAGE);

  return (
    <section className="bg-ink py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
          See it running before your next service.
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <SiteLink
            host="app"
            to="/register-church"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-7 py-3.5 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
          >
            Start free trial
            <ArrowRight className="h-4 w-4" />
          </SiteLink>
          <a
            href={demoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-white/5 text-white border-2 border-white/20 px-7 py-3.5 rounded-xl font-semibold hover:bg-white/10 transition-colors"
          >
            Book a demo
          </a>
        </div>
        <p className="text-sm text-gray-400">{TRIAL_MONTHS}-month free trial &middot; No card required</p>
      </div>
    </section>
  );
}
