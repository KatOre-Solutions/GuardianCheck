import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { DEMO_MESSAGE } from "../../constants/marketing";
import { COMPANY } from "../../constants/company";
import { whatsappUrl } from "../../lib/whatsapp";
import { TRIAL_MONTHS } from "../../constants/plans";
import { BrowserFrame } from "./replicas/BrowserFrame";
import { PhoneFrame } from "./replicas/PhoneFrame";
import { VolunteerCheckIn } from "./replicas/VolunteerCheckIn";

export function Hero() {
  const demoHref = whatsappUrl(COMPANY.whatsapp, DEMO_MESSAGE);

  return (
    <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
      <div
        aria-hidden="true"
        className="absolute -top-32 right-0 w-[36rem] h-[36rem] rounded-full bg-primary/5 dark:bg-primary/10 blur-3xl pointer-events-none"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-7 relative z-10">
            <span className="inline-block text-xs font-bold text-primary uppercase tracking-wider bg-primary/10 dark:bg-primary/20 px-3 py-1 rounded-full">
              Child check-in and pickup for churches
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink dark:text-white leading-[1.1]">
              Know who checked each child in, and who may take them home.
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-lg leading-relaxed">
              QR check-in at the door, pickup by guardians parents have authorised, and a live view of every
              room, on volunteers' own phones.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/register-church"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10 dark:shadow-none"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={demoHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-900 text-ink dark:text-white border-2 border-gray-200 dark:border-gray-800 px-6 py-3.5 rounded-xl font-semibold hover:border-primary dark:hover:border-primary/50 hover:text-primary transition-colors"
              >
                Book a demo
              </a>
            </div>
            <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
              <p>
                {TRIAL_MONTHS}-month free trial &middot; No card required &middot; Priced in rand
              </p>
              <p>In use at a South African church today.</p>
            </div>
          </div>

          <div className="relative lg:pl-6">
            {/* <640px: the phone replica alone, so it reads at a glance
                instead of two overlapping frames competing for a narrow
                column. */}
            <div className="sm:hidden flex justify-center marketing-hero-chip">
              <PhoneFrame>
                <div className="p-3">
                  <VolunteerCheckIn compact />
                </div>
              </PhoneFrame>
            </div>

            <div className="hidden sm:block">
              <BrowserFrame url="guardiancheck.co.za/app">
                <img
                  src="/marketing/hero-admin-dashboard.png"
                  alt="GuardianCheck admin dashboard"
                  width={1459}
                  height={662}
                  className="w-full h-auto rounded-lg"
                  decoding="async"
                />
              </BrowserFrame>
              {/* In normal flow, pulled up to overlap the card's own bottom
                  padding -- not its stat tiles -- then hangs down over the
                  page background, which is where most of the phone sits. */}
              <div className="relative z-10 w-fit ml-10 -mt-10 marketing-hero-chip">
                <PhoneFrame className="scale-[0.6] origin-top-left">
                  <div className="p-3">
                    <VolunteerCheckIn compact />
                  </div>
                </PhoneFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
