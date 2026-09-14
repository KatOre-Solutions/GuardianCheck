import { Mail, MapPin, MessageCircle } from "lucide-react";
import { Seo } from "../components/Seo";
import WhatsAppSupport from "../components/WhatsAppSupport";
import { COMPANY, formatCompanyAddress } from "../constants/company";
import { SITE_NAME } from "../constants/site";

/**
 * #30: replaces the hard-coded WhatsApp-only contact in Home.tsx with a real
 * page carrying two channels plus registered company details, so it can also
 * feed Organization.contactPoint (#33).
 */
export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Seo
        title="Contact"
        description={`Get in touch with ${SITE_NAME} by WhatsApp or email, or find our registered company details.`}
        canonicalPath="/contact"
      />

      <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-8">Contact us</h1>

      <div className="space-y-4">
        <div className="flex items-start space-x-4 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="h-10 w-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">WhatsApp</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">The fastest way to reach us.</p>
            <WhatsAppSupport
              phoneNumber={COMPANY.whatsapp}
              message="Hello, I'd like more information about GuardianCheck."
              label="Chat with us"
              position="static"
            />
          </div>
        </div>

        <div className="flex items-start space-x-4 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="h-10 w-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Email</h2>
            <a href={`mailto:${COMPANY.email}`} className="text-sm text-primary font-medium hover:underline">
              {COMPANY.email}
            </a>
          </div>
        </div>

        <div className="flex items-start space-x-4 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Registered office</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {COMPANY.legalName}
              <br />
              {formatCompanyAddress()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
