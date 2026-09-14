import { Link } from "react-router-dom";
import { COMPANY, formatCompanyAddress } from "../constants/company";
import { SITE_NAME } from "../constants/site";

/**
 * #24: the link hub for every trust/legal/company page. A single shared
 * component so those pages (2.2-2.8) only need to exist, not also remember
 * to link themselves in from somewhere.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Product
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/register-church" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  Register your church
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Company
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/security" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  Security
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Legal
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/privacy" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/popia" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  POPIA Notice
                </Link>
              </li>
              <li>
                <Link to="/cookies" className="text-gray-600 dark:text-gray-400 hover:text-primary">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              {COMPANY.legalName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-500 leading-relaxed">
              Reg. {COMPANY.registrationNumber}
              <br />
              {formatCompanyAddress()}
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
          © {year} {COMPANY.legalName}. {SITE_NAME} is a product of {COMPANY.legalName}.
        </div>
      </div>
    </footer>
  );
}
