import { Shield } from "lucide-react";
import { Seo } from "../components/Seo";
import { COMPANY, formatCompanyAddress } from "../constants/company";
import { SITE_NAME } from "../constants/site";

/**
 * #29: entity-defining About page. Feeds Organization JSON-LD (#33), so the
 * facts here (legal name, registration number, address) come from
 * `company.ts`, not restated inline.
 */
export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Seo
        title="About"
        description={`${SITE_NAME} is a secure child check-in and pickup platform for churches, built by ${COMPANY.legalName}.`}
        canonicalPath="/about"
      />

      <div className="flex items-center space-x-3 mb-8">
        <div className="h-12 w-12 bg-primary/10 dark:bg-primary/20 rounded-2xl flex items-center justify-center">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">About {SITE_NAME}</h1>
      </div>

      <div className="space-y-8 text-gray-600 dark:text-gray-400 leading-relaxed">
        <p className="text-lg">
          {SITE_NAME} is a secure, real-time child check-in and pickup system built for churches. It gives
          volunteers a fast QR-code workflow at the door, gives admins a live view of attendance and
          capacity, and gives parents the reassurance that only an authorised guardian can collect their
          child.
        </p>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Who it's for</h2>
          <p>
            {SITE_NAME} is built for churches of every size — from a single Sunday-morning kids' room to a
            multi-site congregation running several services and rooms in parallel. Admins manage rooms,
            events and staff; volunteers run check-in and check-out at the door; parents track their own
            children and manage guardian permissions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">The company</h2>
          <p>
            {SITE_NAME} is operated by <strong>{COMPANY.legalName}</strong>, a South African private
            company (registration number {COMPANY.registrationNumber}), registered at {formatCompanyAddress()}.
          </p>
        </section>
      </div>
    </div>
  );
}
