import { useMemo, useState } from "react";
import { Search, Download, Printer, AlertTriangle, Users, Phone, Mail } from "lucide-react";
import { format } from "date-fns";
import { toCsv, downloadCsv, type CsvColumn } from "../lib/csv";
import { logAudit } from "../lib/firestore";
import { hasRecordedAllergies } from "../lib/child-utils";

/**
 * The church's roster of registered children, with the guardian and parent
 * contact an administrator needs for name tags and safeguarding.
 *
 * ## Why this exists
 *
 * Before this, an admin could only reach a child through a check-in record —
 * and the only such view renders `historicalCheckins.slice(0, 10)`. A church
 * with 68 registered children could see at most ten names, none of them
 * children who had never attended. There was no roster at all.
 *
 * ## Where the data comes from
 *
 * Everything here is already subscribed by `AdminDashboard` under
 * `where("churchId", "==", churchId)`, so this component takes it as props and
 * opens no listeners of its own. That matters: the page already holds seven
 * live snapshots, and the obvious alternative — a `child_medical` listener per
 * child, as `ParentDashboard` does — would add one per child.
 *
 * ## What is deliberately absent
 *
 * `child_medical.notes` is free-text medical detail and is not loaded here or
 * exported. Allergies (which live on the child document, not `child_medical`)
 * are enough for name tags and room safety. The narrower the export, the less
 * there is to leak.
 *
 * ## Tenancy
 *
 * This component performs no access control and must not be treated as if it
 * does. Isolation is enforced by `firestore.rules`, which scopes `children`,
 * `guardians` and `users` reads to the caller's own `churchId`. The props can
 * only ever contain the admin's own church because the query that produced
 * them was constrained and the rules would have rejected anything wider.
 */

interface ChildRecord {
  id: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  gender?: string;
  allergies?: string;
  parentId?: string;
  parentName?: string;
  deleted?: boolean;
}

interface GuardianRecord {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  relationship?: string;
  childIds?: string[];
  active?: boolean;
  deleted?: boolean;
}

interface UserRecord {
  id?: string;
  uid?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  cellNumber?: string;
}

interface ChildrenDirectoryProps {
  children: ChildRecord[];
  guardians: GuardianRecord[];
  users: UserRecord[];
  churchId: string;
  churchName?: string;
  currentUserId: string;
  onSelectChild: (childId: string) => void;
}

/** A child with its guardians and parent account resolved. */
interface DirectoryRow {
  child: ChildRecord;
  guardians: GuardianRecord[];
  parent?: UserRecord;
  fullName: string;
  allergies: string;
  hasAllergies: boolean;
}

const NO_ALLERGIES = "None recorded";

function fullName(person: { firstName?: string; lastName?: string }): string {
  return `${person.firstName || ""} ${person.lastName || ""}`.trim();
}

/**
 * True when the child has a meaningful allergy entry.
 *
 * Parents type free text, so this has to treat "none", "n/a" and whitespace as
 * absent. Showing a red allergy badge that reads "none" trains volunteers to
 * ignore the badge, which is worse than showing nothing.
 */
export default function ChildrenDirectory({
  children,
  guardians,
  users,
  churchId,
  churchName,
  currentUserId,
  onSelectChild,
}: ChildrenDirectoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [allergiesOnly, setAllergiesOnly] = useState(false);
  const [includeAllergiesOnTags, setIncludeAllergiesOnTags] = useState(false);
  const [exporting, setExporting] = useState(false);

  /**
   * Joins child -> guardians -> parent account.
   *
   * Guardians are matched on `childIds`, which is how the many-to-many link is
   * modelled: a child may have several guardians, and a guardian may cover
   * several siblings. The field is optional on older documents, hence the
   * guard — `g.childIds.includes(...)` would throw and blank the whole page.
   *
   * Both soft-delete conventions are applied. `children` use `deleted`;
   * `guardians` carry `deleted` *and* `active`, and filtering on only one of
   * them either resurrects removed guardians or hides valid ones.
   */
  const rows = useMemo<DirectoryRow[]>(() => {
    const guardiansByChild = new Map<string, GuardianRecord[]>();

    for (const guardian of guardians) {
      if (guardian.deleted || guardian.active === false) continue;
      for (const childId of guardian.childIds ?? []) {
        const list = guardiansByChild.get(childId);
        if (list) list.push(guardian);
        else guardiansByChild.set(childId, [guardian]);
      }
    }

    // uid is the users-collection key, but some records only carry `id`.
    const usersByUid = new Map<string, UserRecord>();
    for (const user of users) {
      const key = user.uid || user.id;
      if (key) usersByUid.set(key, user);
    }

    return children
      .filter((child) => !child.deleted)
      .map((child) => {
        const allergies = (child.allergies || "").trim();
        return {
          child,
          guardians: guardiansByChild.get(child.id) ?? [],
          parent: child.parentId ? usersByUid.get(child.parentId) : undefined,
          fullName: fullName(child) || "Unnamed child",
          allergies: allergies || NO_ALLERGIES,
          hasAllergies: hasRecordedAllergies(child.allergies),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [children, guardians, users]);

  const visibleRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      if (allergiesOnly && !row.hasAllergies) return false;
      if (!search) return true;

      // Guardian names are searchable too: staff often know a family by the
      // parent's name rather than the child's.
      return (
        row.fullName.toLowerCase().includes(search) ||
        row.guardians.some((g) => fullName(g).toLowerCase().includes(search)) ||
        (row.parent?.email || "").toLowerCase().includes(search)
      );
    });
  }, [rows, searchTerm, allergiesOnly]);

  const allergyCount = useMemo(() => rows.filter((r) => r.hasAllergies).length, [rows]);

  /**
   * Records that an export happened, without copying what was exported.
   *
   * Counts only — no names, no phone numbers. An audit trail that duplicates
   * the sensitive data becomes a second thing to protect.
   */
  const recordExport = async (exportType: string, rowCount: number) => {
    await logAudit({
      action: "children_directory_export",
      category: "admin",
      details: { exportType, rowCount, filtered: rowCount !== rows.length },
      churchId,
      userId: currentUserId,
    });
  };

  const stamp = () => format(new Date(), "yyyyMMdd");

  /** Full roster including contact details. Admin-only, audited. */
  const exportSafeguarding = async () => {
    setExporting(true);
    try {
      const columns: CsvColumn<DirectoryRow>[] = [
        { header: "Child First Name", value: (r) => r.child.firstName || "" },
        { header: "Child Surname", value: (r) => r.child.lastName || "" },
        { header: "Age", value: (r) => (r.child.age != null ? String(r.child.age) : "") },
        { header: "Allergies", value: (r) => (r.hasAllergies ? r.allergies : "") },
        {
          header: "Guardians",
          value: (r) =>
            r.guardians
              .map((g) => `${fullName(g)}${g.relationship ? ` (${g.relationship})` : ""}`)
              .join("; "),
        },
        {
          header: "Guardian Phones",
          value: (r) => r.guardians.map((g) => g.phone || "").filter(Boolean).join("; "),
        },
        { header: "Parent Name", value: (r) => (r.parent ? fullName(r.parent) : r.child.parentName || "") },
        { header: "Parent Email", value: (r) => r.parent?.email || "" },
        { header: "Parent Phone", value: (r) => r.parent?.cellNumber || "" },
      ];

      downloadCsv(
        `children_safeguarding_${stamp()}.csv`,
        toCsv(visibleRows, columns),
      );
      await recordExport("safeguarding", visibleRows.length);
    } finally {
      setExporting(false);
    }
  };

  /**
   * Name-tag export: the child's name and nothing else.
   *
   * Contact details are deliberately absent. A name-tag list gets passed
   * around, printed, and left on a table; it has no reason to carry a phone
   * number.
   */
  const exportNameTags = async () => {
    setExporting(true);
    try {
      const columns: CsvColumn<DirectoryRow>[] = [
        { header: "Child Name", value: (r) => r.fullName },
        ...(includeAllergiesOnTags
          ? [{ header: "Allergy Alert", value: (r: DirectoryRow) => (r.hasAllergies ? r.allergies : "") }]
          : []),
      ];

      downloadCsv(`name_tags_${stamp()}.csv`, toCsv(visibleRows, columns));
      await recordExport(
        includeAllergiesOnTags ? "name_tags_with_allergies" : "name_tags",
        visibleRows.length,
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      id="children-section"
      className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden"
    >
      <div className="p-6 border-b border-gray-50 dark:border-gray-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Children Directory</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {rows.length} registered
              {allergyCount > 0 && ` · ${allergyCount} with allergies`}
              {churchName && ` · ${churchName}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={exportNameTags}
              disabled={exporting || visibleRows.length === 0}
              className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-sm font-bold border border-gray-100 dark:border-gray-700 hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Name Tags</span>
            </button>
            <button
              onClick={exportSafeguarding}
              disabled={exporting || visibleRows.length === 0}
              className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{exporting ? "Exporting..." : "Full Roster"}</span>
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by child name, guardian name or parent email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white text-sm"
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-gray-600 dark:text-gray-300 font-medium">
            <input
              type="checkbox"
              checked={allergiesOnly}
              onChange={(e) => setAllergiesOnly(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>Allergies only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-gray-600 dark:text-gray-300 font-medium">
            <input
              type="checkbox"
              checked={includeAllergiesOnTags}
              onChange={(e) => setIncludeAllergiesOnTags(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>Include allergy alert on name tags</span>
          </label>
          {visibleRows.length !== rows.length && (
            <span className="text-gray-400 dark:text-gray-500">
              Showing {visibleRows.length} of {rows.length} — exports follow this filter
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-[600px] overflow-y-auto">
        {visibleRows.map((row) => (
          <div
            key={row.child.id}
            onClick={() => onSelectChild(row.child.id)}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer flex items-start gap-4"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-gray-900 dark:text-white truncate">{row.fullName}</p>
                {row.child.age != null && (
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Age {row.child.age}
                  </span>
                )}
                {row.hasAllergies && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-md">
                    <AlertTriangle className="h-3 w-3" />
                    {row.allergies}
                  </span>
                )}
              </div>

              {row.guardians.length > 0 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {row.guardians.map((g) => (
                    <span
                      key={g.id}
                      className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1"
                    >
                      <Users className="h-3 w-3 text-gray-300" />
                      {fullName(g) || "Unnamed guardian"}
                      {g.relationship && ` · ${g.relationship}`}
                      {g.phone && (
                        <span className="inline-flex items-center gap-1 ml-1">
                          <Phone className="h-3 w-3 text-gray-300" />
                          {g.phone}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                  No authorised guardians recorded
                </p>
              )}

              {row.parent?.email && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3" />
                  {row.parent.email}
                </p>
              )}
            </div>
          </div>
        ))}

        {visibleRows.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-sm text-gray-400 italic">
              {rows.length === 0
                ? "No children registered yet."
                : "No children match this search."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
