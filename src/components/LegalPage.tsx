import type { ReactNode } from "react";
import { Seo } from "./Seo";

/**
 * Shared layout for public legal pages (#25): Privacy, Terms, POPIA, Cookies.
 *
 * Each page supplies its own title/description/canonical and section content;
 * this owns only the chrome — heading, last-updated line, and section
 * rendering — so the four pages read as one consistent document family
 * instead of four hand-built layouts.
 */

export interface LegalSection {
  id: string;
  title: string;
  content: string;
}

interface LegalPageProps {
  /** SEO title (no brand suffix — `<Seo>` adds it). */
  seoTitle: string;
  seoDescription: string;
  /** Root-relative path this page canonicalises to, e.g. "/privacy". */
  canonicalPath: string;
  /** Heading shown on the page. Can differ from `seoTitle`. */
  heading: string;
  lastUpdated: string;
  sections: LegalSection[];
  /** Optional note rendered above the sections — e.g. a legal-review flag or a cross-link. */
  intro?: ReactNode;
}

export function LegalPage({
  seoTitle,
  seoDescription,
  canonicalPath,
  heading,
  lastUpdated,
  sections,
  intro,
}: LegalPageProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Seo title={seoTitle} description={seoDescription} canonicalPath={canonicalPath} />

      <div className="space-y-1 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{heading}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Last updated {lastUpdated}</p>
      </div>

      {intro && <div className="mb-10">{intro}</div>}

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{section.title}</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{section.content}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
