import type { FC, ReactNode } from "react";
import { motion } from "motion/react";

/**
 * The icon-badged card treatment used across Home's features grid, the About
 * page's fact grid, and the Contact page's channel grid. Extracted after
 * code review flagged the same markup copy-pasted three times: any future
 * tweak to the hover/shadow/border treatment previously had to land in three
 * files identically or the pages would drift apart visually.
 *
 * `headingLevel` and the class overrides exist so this stays a pure
 * extraction, not a redesign: each caller keeps its own heading semantics
 * (Home's cards sit under an h2 section heading, so h3 is correct there;
 * About/Contact have no intermediate heading, so h2 is correct there) and
 * its own text sizing, rather than everyone being forced onto one page's
 * choices.
 */

interface IconCardProps {
  icon: ReactNode;
  /** Defaults to Home's neutral badge. Pass a tinted one (e.g. "bg-green-50 dark:bg-green-900/20") to match an icon's color. */
  iconBg?: string;
  headingLevel?: "h2" | "h3";
  title: string;
  titleClassName?: string;
  description: ReactNode;
  descriptionClassName?: string;
  /** Stagger delay for the scroll-in animation, typically the array index. */
  index?: number;
  /** Extra content below the description, e.g. Contact's WhatsApp button or email link. */
  children?: ReactNode;
}

export const IconCard: FC<IconCardProps> = ({
  icon,
  iconBg = "bg-gray-50 dark:bg-gray-800",
  headingLevel = "h3",
  title,
  titleClassName = "text-xl font-bold text-gray-900 dark:text-white mb-2",
  description,
  descriptionClassName = "text-gray-600 dark:text-gray-400 leading-relaxed",
  index = 0,
  children,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      viewport={{ once: true }}
      className="p-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-primary/30 dark:hover:border-primary/30 hover:shadow-xl transition-all group"
    >
      <div
        className={`h-12 w-12 rounded-xl ${iconBg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}
      >
        {icon}
      </div>
      {headingLevel === "h2" ? (
        <h2 className={titleClassName}>{title}</h2>
      ) : (
        <h3 className={titleClassName}>{title}</h3>
      )}
      <p className={descriptionClassName}>{description}</p>
      {children}
    </motion.div>
  );
};
