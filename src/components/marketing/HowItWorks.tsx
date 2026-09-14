import React from "react";
import { UserPlus, QrCode, Eye, KeyRound } from "lucide-react";
import { ParentChildCard } from "./replicas/ParentChildCard";
import { GuardianPickup } from "./replicas/GuardianPickup";
import { ScanningQr } from "./replicas/ScanningQr";
import { PhoneFrame } from "./replicas/PhoneFrame";
import { SAMPLE } from "../../constants/marketing";

const STEPS = [
  {
    icon: UserPlus,
    title: "Parents register their children once",
    description: "Allergies, a photo, and the guardians who are authorised to collect them.",
  },
  {
    icon: QrCode,
    title: "A volunteer scans the QR code",
    description: "The child's own code, or the family's — a room is suggested by age.",
  },
  {
    icon: Eye,
    title: "Everyone can see who's where",
    description: "The attendance list, a \"Checked in\" badge for the parent, and an email confirmation.",
  },
  {
    icon: KeyRound,
    title: "At pickup, the guardian's QR code is scanned",
    description: "The volunteer sees their photo and the children they're linked to.",
  },
] as const;

/** A child's registered profile, for step 1 — deliberately not a new replica component, since nothing else in the plan reuses this exact layout. */
function ChildProfileScreen() {
  const child = SAMPLE.children[0];
  return (
    <div
      role="img"
      aria-label={`${child.name}'s registered profile: age, allergies, and authorised guardians`}
      data-nosnippet
      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Child profile
      </p>
      {[
        ["Name", child.name],
        ["Age", `${child.age} years old`],
        ["Allergies", child.allergy ?? "None recorded"],
        ["Authorised guardians", SAMPLE.guardian],
      ].map(([label, value]) => (
        <div key={label} className="text-sm border-b border-gray-50 dark:border-gray-800 pb-2 last:border-0 last:pb-0">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
          <p className="font-medium text-gray-900 dark:text-white truncate">{value}</p>
        </div>
      ))}
    </div>
  );
}

const SCREENS = [ChildProfileScreen, ScanningQr, ParentChildCard, GuardianPickup];

/**
 * The stacked replica screens inside a phone, driven by `activeStep`.
 * Desktop cross-fades between them (`variant="fade"`); mobile slides them
 * horizontally instead (`variant="slide"`), so scrolling straight down
 * still reads as moving "through" the steps rather than jumping. Shared
 * because both are the same four screens under the same PhoneFrame --
 * only the transition differs.
 *
 * grid-cols-1 (not the bare "grid" default) is load-bearing: an implicit
 * auto column sizes to its widest child's min-content, not the container,
 * so the stacked screens' natural width could overflow the phone and get
 * clipped by its rounded corner. minmax(0, 1fr) is what actually clamps it,
 * and overflow-hidden is what keeps the slide variant's off-screen
 * neighbours from being visible either side of the phone.
 */
function ScreenStack({ activeStep, variant }: { activeStep: number; variant: "fade" | "slide" }) {
  return (
    <div className={`p-3 grid grid-cols-1 ${variant === "slide" ? "overflow-hidden" : ""}`}>
      {SCREENS.map((Screen, i) => (
        <div
          key={i}
          className={`col-start-1 row-start-1 min-w-0 ${
            variant === "fade" ? "transition-opacity duration-300" : "transition-transform duration-500 ease-out"
          }`}
          style={variant === "fade" ? { opacity: activeStep === i ? 1 : 0 } : { transform: `translateX(${(i - activeStep) * 100}%)` }}
          aria-hidden={activeStep !== i}
        >
          <Screen />
        </div>
      ))}
    </div>
  );
}

export function HowItWorks() {
  const [activeStep, setActiveStep] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Both the desktop step list and the mobile step stack render
    // data-step-index blocks; only one set is ever laid out at a time
    // (the other is `hidden`), so one observer over the whole section
    // covers both without knowing which layout is active.
    const stepEls = Array.from(container.querySelectorAll<HTMLElement>("[data-step-index]"));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          setActiveStep(Number((visible.target as HTMLElement).dataset.stepIndex));
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.5, 1] },
    );

    stepEls.forEach((el: HTMLElement) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={containerRef}
      id="how-it-works"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28"
    >
      <div className="max-w-2xl mb-16">
        <h2 className="text-3xl lg:text-4xl font-bold text-ink dark:text-white tracking-tight">How it works</h2>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
          Paper lists get left at home, and "I'm here to fetch her" isn't something a volunteer can verify on
          faith. GuardianCheck replaces both with four steps that take seconds each.
        </p>
      </div>

      {/* Desktop: sticky screen column beside a scrolling step list. */}
      <div className="hidden lg:grid grid-cols-2 gap-16">
        <div className="space-y-24">
          {STEPS.map((step, i) => (
            <div key={step.title} data-step-index={i} className="space-y-3 py-8">
              <div className="flex items-center gap-3">
                <span
                  className={`flex items-center justify-center h-9 w-9 rounded-full text-sm font-bold shrink-0 transition-colors ${
                    activeStep === i
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {i + 1}
                </span>
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-ink dark:text-white">{step.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed max-w-md">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="relative">
          <div className="sticky top-24 flex justify-center">
            <PhoneFrame>
              <ScreenStack activeStep={activeStep} variant="fade" />
            </PhoneFrame>
          </div>
        </div>
      </div>

      {/* Mobile/tablet: the phone pins near the top and slides between
          screens as the step text underneath it scrolls past -- one
          continuous downward swipe, no separate horizontal gesture. */}
      <div className="lg:hidden relative">
        <div className="sticky top-20 z-10 flex flex-col items-center gap-4 bg-canvas dark:bg-gray-950 pt-2 pb-6">
          <PhoneFrame>
            <ScreenStack activeStep={activeStep} variant="slide" />
          </PhoneFrame>
          <div className="flex items-center gap-2" aria-hidden="true">
            {STEPS.map((step, i) => (
              <span
                key={step.title}
                className={`h-1.5 rounded-full transition-all ${
                  activeStep === i ? "w-6 bg-primary" : "w-1.5 bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              data-step-index={i}
              className="min-h-[50vh] flex flex-col justify-center space-y-3 px-1"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex items-center justify-center h-9 w-9 rounded-full text-sm font-bold shrink-0 transition-colors ${
                    activeStep === i
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {i + 1}
                </span>
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-ink dark:text-white">{step.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
