/**
 * Shared child-record helpers.
 *
 * Extracted from ChildrenDirectory so the Check Out and Attendance views apply
 * the same allergy test -- an allergy badge that shows in one list but not
 * another is worse than no badge at all.
 */

/**
 * Treats the common "nothing to report" free-text answers as no allergy.
 * The field is a free-text box, so parents write "none", "N/A", "nil" and so on
 * where they all mean the same thing.
 */
export function hasRecordedAllergies(raw?: string): boolean {
  const value = (raw || "").trim().toLowerCase();
  if (!value) return false;
  return !["none", "n/a", "na", "no", "nil", "none known", "no allergies"].includes(value);
}
