import { Link } from "react-router-dom";
import { UserPlus, QrCode, Users, LogIn } from "lucide-react";
import { Seo } from "../components/Seo";
import { ChurchLogo } from "../components/ChurchLogo";
import { useTenant } from "../contexts/TenantContext";
import { SITE_NAME } from "../constants/site";

/**
 * A church's own landing page at `/:churchSlug` -- rendered by TenantLayout
 * inside the ordinary app Layout/Navigation, which already carries the
 * church's own branding and Sign Up/Login links for an anonymous visitor.
 *
 * Speaks only to parents. No pricing, demo invites or sales copy -- that is
 * Home's job at `/`, for church decision makers. See the audience split and
 * code boundary in docs/marketing-redesign-plan.md §2: this file must not
 * import anything from components/marketing/.
 */
export default function ChurchLanding() {
  const { church } = useTenant();

  const steps = [
    {
      icon: UserPlus,
      title: "Add your children",
      description: "Register each child once, with allergies and the guardians allowed to collect them.",
    },
    {
      icon: QrCode,
      title: "Show your QR code at the door",
      description: "A volunteer scans it to check your child into their room.",
    },
    {
      icon: Users,
      title: "Collect with your guardian QR code",
      description: "Show your own QR code at pickup, and only an authorised guardian can collect.",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-16">
      {/* noindex per #18: this page and `/` share no content, but a tenant
          landing page is still not something worth indexing on its own --
          see the sitemap, which lists only `/`. */}
      <Seo
        title={church ? `${church.name} children's check-in` : "Children's check-in"}
        description={
          church
            ? `Check your children in and out of ${church.name} safely. QR-code check-in and authorised-guardian pickup verification.`
            : undefined
        }
        noindex
      />

      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <ChurchLogo
            logoUrl={church?.branding?.logoUrl}
            name={church?.name}
            className="h-16 w-16 object-contain"
            fallbackClassName="h-12 w-12 text-primary"
          />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {church ? `Welcome to ${church.name}` : "Welcome"}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          QR-code check-in and guardian-verified pickup, on your phone.
        </p>
      </div>

      <div className="grid gap-6">
        {steps.map((step, i) => (
          <div key={step.title} className="flex items-start gap-4 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 dark:bg-primary/20 shrink-0">
              <step.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">
                {i + 1}. {step.title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to={`/${church?.slug ?? ""}/login?mode=signup`}
          className="inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Create a parent account
        </Link>
        <Link
          to={`/${church?.slug ?? ""}/login`}
          className="inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-2 border-gray-100 dark:border-gray-800 px-6 py-3 rounded-xl font-semibold hover:border-primary dark:hover:border-primary/50 transition-colors"
        >
          <LogIn className="h-4 w-4" />
          Log in
        </Link>
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
        Powered by{" "}
        <Link to="/" className="underline hover:no-underline">
          {SITE_NAME}
        </Link>
      </p>
    </div>
  );
}
