import { Shield } from "lucide-react";
import { SiteLink } from "./SiteLink";
import { COMPANY } from "../constants/company";
import { SITE_NAME } from "../constants/site";

/**
 * #24: the link hub for every trust/legal/company page. A single shared
 * component so those pages (2.2-2.8) only need to exist, not also remember
 * to link themselves in from somewhere.
 *
 * `Layout` renders this on nearly every route, not just marketing pages, so
 * it has to respect light/dark mode like everything else -- an early version
 * made it permanently dark to match Home.tsx's "Admin Section" accent, which
 * looked fine on the marketing page but clashed with the light theme on
 * every authenticated dashboard screen.
 *
 * For the same reason its links name the host each page belongs to (#14): on
 * the app host the marketing and legal pages are on the apex, and on the
 * marketing host church signup is on the app host.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  const linkClass = "text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary/80 transition-colors";

  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center space-x-2 mb-12">
          <div className="h-10 w-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">{SITE_NAME}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
              Product
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <SiteLink host="marketing" to="/" className={linkClass}>
                  Home
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/#how-it-works" className={linkClass}>
                  How it works
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/#safety" className={linkClass}>
                  Safety
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/#pricing" className={linkClass}>
                  Pricing
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/#faq" className={linkClass}>
                  FAQ
                </SiteLink>
              </li>
              <li>
                <SiteLink host="app" to="/register-church" className={linkClass}>
                  Register your church
                </SiteLink>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
              Company
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <SiteLink host="marketing" to="/about" className={linkClass}>
                  About
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/contact" className={linkClass}>
                  Contact
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/security" className={linkClass}>
                  Security
                </SiteLink>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
              Legal
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <SiteLink host="marketing" to="/privacy" className={linkClass}>
                  Privacy Policy
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/terms" className={linkClass}>
                  Terms of Service
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/popia" className={linkClass}>
                  POPIA Notice
                </SiteLink>
              </li>
              <li>
                <SiteLink host="marketing" to="/cookies" className={linkClass}>
                  Cookie Policy
                </SiteLink>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
              {COMPANY.legalName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Reg. {COMPANY.registrationNumber}
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
          © {year} {COMPANY.legalName}. {SITE_NAME} is a product of {COMPANY.legalName}.
        </div>
      </div>
    </footer>
  );
}
