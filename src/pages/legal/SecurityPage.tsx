import { Link } from "react-router-dom";
import { Seo } from "../../components/Seo";
import { COMPANY } from "../../constants/company";

/**
 * #31: security posture page. Every claim here names a mechanism that
 * actually exists in this codebase (Firestore rules, App Check, role-based
 * routing) rather than generic security-page boilerplate — see "Out of
 * Scope" on #31: no pen-test or certification claims, because none exist.
 */
export default function SecurityPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Seo
        title="Security"
        description="How GuardianCheck protects church, guardian and child data: encryption in transit, role-based access, and how to report a vulnerability."
        canonicalPath="/security"
      />

      <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-8">Security</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Encryption</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            All traffic to and from GuardianCheck is encrypted in transit over HTTPS. Data is stored in
            Google Cloud Firestore, which encrypts data at rest.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Access control</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            Every church's data is isolated by server-side Firestore security rules scoped to that church —
            a volunteer or parent account cannot read another church's records. Within a church, access is
            role-based: Admin, Volunteer and Parent accounts each see only what their role needs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Bot and abuse protection</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            Sign-up and check-in actions are protected by Google's reCAPTCHA Enterprise via Firebase App
            Check, to keep automated abuse off endpoints that touch child data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">POPIA posture</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            GuardianCheck acts as an Operator under South Africa's Protection of Personal Information Act
            (POPIA), processing data on behalf of each church, which is the Responsible Party. See our{" "}
            <Link to="/popia" className="text-primary font-medium hover:underline">
              POPIA notice
            </Link>{" "}
            for details.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Reporting a vulnerability</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            If you believe you've found a security vulnerability in GuardianCheck, please report it to{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-primary font-medium hover:underline">
              {COMPANY.email}
            </a>
            . Please give us a reasonable time to investigate and respond before disclosing publicly. See{" "}
            <a href="/.well-known/security.txt" className="text-primary font-medium hover:underline">
              security.txt
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
