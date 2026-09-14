import { Calendar, Tag, FileDown, UserPlus, Palette, WifiOff } from "lucide-react";
import { BrowserFrame } from "./replicas/BrowserFrame";
import { AdminRightNow } from "./replicas/AdminRightNow";

const CAPABILITIES = [
  { icon: Calendar, text: "Events and services" },
  { icon: Tag, text: "Children directory with allergy flags and printable name tags" },
  { icon: FileDown, text: "CSV exports" },
  { icon: UserPlus, text: "Inviting your team" },
  { icon: Palette, text: "Your church's logo, colours and own link" },
  {
    icon: WifiOff,
    text: "Check-in keeps working if Wi-Fi drops, as long as the app was opened on that device before, and syncs when back online",
  },
];

export function LeadersSection() {
  return (
    <section id="admin" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div className="order-2 lg:order-1">
          <BrowserFrame url="guardiancheck.co.za/app">
            <AdminRightNow />
          </BrowserFrame>
        </div>

        <div className="order-1 lg:order-2 space-y-8">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold text-ink dark:text-white tracking-tight">
              For church leaders
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
              Attendance you can see live, and a set of tools built around a real Sunday, not a generic admin
              panel.
            </p>
          </div>

          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
            {CAPABILITIES.map((cap) => (
              <li key={cap.text} className="flex items-start gap-3">
                <cap.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{cap.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
