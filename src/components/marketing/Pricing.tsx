import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { PLAN_LIMITS, TRIAL_MONTHS } from "../../constants/plans";

const INCLUDED = [
  "QR check-in and pickup",
  "Guardian override with PIN and logging",
  "Events and services",
  "CSV exports",
  "Your own logo, colours and link",
];

const AFTER_SIGNUP = [
  "Guided setup of your rooms, services, security PIN and team",
  "Share your church's own GuardianCheck link with parents",
  "Run your first service",
];

export function Pricing() {
  return (
    <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <h2 className="text-3xl lg:text-4xl font-bold text-ink dark:text-white tracking-tight">Pricing</h2>
        <p className="mt-4 text-xl font-semibold text-primary">
          Every plan includes every feature. You choose by the size of your ministry.
        </p>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
          {INCLUDED.map((item) => (
            <li key={item} className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {Object.entries(PLAN_LIMITS).map(([tier, plan]) => (
          <div
            key={tier}
            className="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 space-y-6"
          >
            <div>
              <h3 className="text-lg font-bold text-ink dark:text-white">{plan.label}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{plan.summary}</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-ink dark:text-white">R{plan.priceZar}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">/month</span>
            </div>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>
                {Number.isFinite(plan.users) ? `Up to ${plan.users} users` : "Unlimited users"}
              </li>
              <li>
                {Number.isFinite(plan.children) ? `Up to ${plan.children} children` : "Unlimited children"}
              </li>
            </ul>
            <Link
              to={`/register-church?plan=${tier}`}
              className="block w-full text-center py-3 rounded-xl font-bold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
            >
              Start free trial
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
        Monthly in ZAR via PayFast &middot; {TRIAL_MONTHS}-month trial &middot; no card to start &middot; cancel
        anytime in your church settings.
      </p>

      <div className="mt-16 max-w-2xl mx-auto">
        <h3 className="text-center text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-6">
          After you sign up
        </h3>
        <ol className="space-y-4">
          {AFTER_SIGNUP.map((step, i) => (
            <li key={step} className="flex items-start gap-4">
              <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-gray-700 dark:text-gray-300 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
