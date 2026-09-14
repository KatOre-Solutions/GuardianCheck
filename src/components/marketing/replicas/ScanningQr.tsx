import { QrCode, AlertTriangle } from "lucide-react";
import { SampleQr } from "./SampleQr";
import { SAMPLE } from "../../../constants/marketing";

/**
 * The moment a volunteer's camera is reading a child's QR code, for "How it
 * works" step 2. Shows who the code belongs to, not just the code itself:
 * a bare QR reads as an abstract graphic, not a specific child being
 * checked in. The scan line is the one animation on the page that depicts
 * its own step rather than decorating it. See the note in index.css.
 */
export function ScanningQr() {
  const child = SAMPLE.children[0];

  return (
    <div
      role="img"
      aria-label={`Volunteer's camera scanning ${child.name}'s QR code`}
      data-nosnippet
      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3"
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary bg-primary/10 dark:bg-primary/20 px-2.5 py-1 rounded-full">
        <QrCode className="h-3.5 w-3.5" />
        Scanning
      </span>

      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-3 w-28 mx-auto">
        <SampleQr className="w-full h-auto text-gray-900 dark:text-white" />
        <div
          aria-hidden="true"
          className="marketing-scan-line absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_2px] shadow-primary/50"
        />
      </div>

      <div className="text-center space-y-1.5">
        <p className="font-bold text-gray-900 dark:text-white truncate">{child.name}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{child.age} years old</p>
        {child.allergy && (
          <span className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900/30">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider truncate">Allergy: {child.allergy}</span>
          </span>
        )}
      </div>
    </div>
  );
}
