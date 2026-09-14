import { Mail, MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { Seo } from "../components/Seo";
import { IconCard } from "../components/IconCard";
import WhatsAppSupport from "../components/WhatsAppSupport";
import { COMPANY } from "../constants/company";
import { SITE_NAME } from "../constants/site";

/**
 * #30: replaces the hard-coded WhatsApp-only contact in Home.tsx with a real
 * page carrying two channels, so it can also feed Organization.contactPoint
 * (#33). No physical address: the business is online-only.
 *
 * Styled to match Home.tsx's feature-card treatment (icon badge, border,
 * hover shadow) rather than the plain stacked rows this page shipped with.
 */

const channels = [
  {
    icon: <MessageCircle className="h-6 w-6 text-green-600 dark:text-green-400" />,
    iconBg: "bg-green-50 dark:bg-green-900/20",
    title: "WhatsApp",
    description: "The fastest way to reach us.",
    content: (
      <WhatsAppSupport
        phoneNumber={COMPANY.whatsapp}
        message="Hello, I'd like more information about GuardianCheck."
        label="Chat with us"
        position="static"
      />
    ),
  },
  {
    icon: <Mail className="h-6 w-6 text-primary" />,
    iconBg: "bg-primary/10 dark:bg-primary/20",
    title: "Email",
    description: "For anything that's easier to put in writing.",
    content: (
      <a href={`mailto:${COMPANY.email}`} className="text-primary font-bold hover:underline">
        {COMPANY.email}
      </a>
    ),
  },
];

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-16">
      <Seo
        title="Contact"
        description={`Get in touch with ${SITE_NAME} by WhatsApp or email.`}
        canonicalPath="/contact"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-4"
      >
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
          Talk to us
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-xl leading-relaxed">
          Questions about {SITE_NAME}, your church's account, or anything else. Pick whichever channel
          works for you.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        {channels.map((channel, idx) => (
          <IconCard
            key={channel.title}
            index={idx}
            icon={channel.icon}
            iconBg={channel.iconBg}
            headingLevel="h2"
            titleClassName="text-lg font-bold text-gray-900 dark:text-white mb-1"
            title={channel.title}
            description={channel.description}
            descriptionClassName="text-sm text-gray-500 dark:text-gray-400 mb-4"
          >
            {channel.content}
          </IconCard>
        ))}
      </div>
    </div>
  );
}
