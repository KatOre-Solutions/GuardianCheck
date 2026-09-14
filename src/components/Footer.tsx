import { Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { COMPANY } from "../constants/company";
import { SITE_NAME } from "../constants/site";

/**
 * #24: the link hub for every trust/legal/company page. A single shared
 * component so those pages (2.2-2.8) only need to exist, not also remember
 * to link themselves in from somewhere.
 *
 * Styled as a dark full-bleed section, the same treatment Home.tsx uses for
 * its "Admin Section" (bg-gray-900, a soft blurred glow, white/5 accents), so
 * the page ends on a deliberate visual anchor rather than fading out into a
 * plain link list.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  const linkClass = "text-gray-400 hover:text-white transition-colors";

  return (
    <footer className="relative overflow-hidden bg-gray-900 mt-24">
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/20 blur-[140px] rounded-full -ml-48 -mt-48" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center space-x-2 mb-12">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">{SITE_NAME}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Product</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/" className={linkClass}>
                  Home
                </Link>
              </li>
              <li>
                <Link to="/register-church" className={linkClass}>
                  Register your church
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Company</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/about" className={linkClass}>
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className={linkClass}>
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/security" className={linkClass}>
                  Security
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Legal</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/privacy" className={linkClass}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className={linkClass}>
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/popia" className={linkClass}>
                  POPIA Notice
                </Link>
              </li>
              <li>
                <Link to="/cookies" className={linkClass}>
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              {COMPANY.legalName}
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">Reg. {COMPANY.registrationNumber}</p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 text-xs text-gray-500">
          © {year} {COMPANY.legalName}. {SITE_NAME} is a product of {COMPANY.legalName}.
        </div>
      </div>
    </footer>
  );
}
