import { Building2, Shield, ShieldCheck, Users } from "lucide-react";
import { motion } from "motion/react";
import { Seo } from "../components/Seo";
import { COMPANY } from "../constants/company";
import { SITE_NAME } from "../constants/site";

/**
 * #29: entity-defining About page. Feeds Organization JSON-LD (#33), so the
 * facts here (legal name, registration number) come from `company.ts`, not
 * restated inline. Deliberately no physical address: the business is
 * online-only.
 *
 * Styled to match Home.tsx's visual language (badge pill, icon-badged cards,
 * scroll-in motion) rather than the plain text block this page shipped with,
 * so it does not read as an afterthought next to the marketing home page.
 */

const facts = [
  {
    icon: <Users className="h-6 w-6 text-primary" />,
    title: "Built for every church size",
    description:
      "From a single Sunday-morning kids' room to a multi-site congregation running several services and rooms in parallel.",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-green-600" />,
    title: "Role-based by design",
    description:
      "Admins manage rooms, events and staff. Volunteers run check-in and check-out at the door. Parents track their own children and manage guardian permissions.",
  },
  {
    icon: <Building2 className="h-6 w-6 text-purple-600" />,
    title: "A registered South African company",
    description: `${COMPANY.legalName} (registration number ${COMPANY.registrationNumber}). Online-only, with no physical office.`,
  },
];

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-16">
      <Seo
        title="About"
        description={`${SITE_NAME} is a secure child check-in and pickup platform for churches, built by ${COMPANY.legalName}.`}
        canonicalPath="/about"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">About {SITE_NAME}</span>
        </div>

        <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
          Secure check-in software, built by people who volunteer too.
        </h1>

        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
          {SITE_NAME} is a secure, real-time child check-in and pickup system built for churches. It gives
          volunteers a fast QR-code workflow at the door, gives admins a live view of attendance and
          capacity, and gives parents the reassurance that only an authorised guardian can collect their
          child.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {facts.map((fact, idx) => (
          <motion.div
            key={fact.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            viewport={{ once: true }}
            className="p-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/30 dark:hover:border-primary/30 hover:shadow-xl transition-all"
          >
            <div className="h-12 w-12 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-6">
              {fact.icon}
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{fact.title}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{fact.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
