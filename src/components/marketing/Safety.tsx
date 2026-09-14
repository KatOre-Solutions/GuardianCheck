import { Link } from "react-router-dom";
import { LogIn, Eye, KeyRound, ShieldAlert, Users } from "lucide-react";
import { VolunteerCheckIn } from "./replicas/VolunteerCheckIn";
import { GuardianPickup } from "./replicas/GuardianPickup";
import { OverridePin } from "./replicas/OverridePin";
import { SAMPLE } from "../../constants/marketing";

function GuardianControlScreen() {
  return (
    <div
      role="img"
      aria-label={`${SAMPLE.guardian}'s authorised guardians, which the parent can add, pause or remove`}
      data-nosnippet
      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Authorised guardians
      </p>
      {[
        { name: SAMPLE.guardian, status: "Active" },
        { name: "Andile M.", status: "Active" },
        { name: "Former nanny", status: "Removed" },
      ].map((g) => (
        <div key={g.name} className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900 dark:text-white">{g.name}</span>
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              g.status === "Active"
                ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                : "text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800"
            }`}
          >
            {g.status}
          </span>
        </div>
      ))}
    </div>
  );
}

const STAGES = [
  {
    icon: LogIn,
    title: "Drop-off",
    description: "The check-in records which child, which room, which service and which volunteer.",
    Screen: VolunteerCheckIn,
  },
  {
    icon: Eye,
    title: "In the room",
    description: "The volunteer sees allergies and medical notes, and the child's guardians are one tap away.",
    Screen: VolunteerCheckIn,
  },
  {
    icon: KeyRound,
    title: "Pickup",
    description:
      "The guardian's QR code shows their photo and only the children they're linked to; siblings leave together.",
    Screen: GuardianPickup,
  },
  {
    icon: ShieldAlert,
    title: "When something is unusual",
    description:
      "A release without the guardian's QR code needs the church PIN and a written reason. It locks after repeated wrong PINs, and every attempt is logged.",
    Screen: OverridePin,
  },
  {
    icon: Users,
    title: "Parents stay in control",
    description: "Parents add, pause or remove their authorised guardians, any time.",
    Screen: GuardianControlScreen,
  },
] as const;

export function Safety() {
  return (
    <section id="safety" className="bg-ink py-20 lg:py-28">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">Safety</h2>
          <p className="mt-6 text-xl text-gray-300 leading-relaxed">
            When a child is in your care, two questions matter: who is responsible for them right now, and who
            is allowed to take them home?
          </p>
        </div>

        <div className="space-y-16">
          {STAGES.map((stage, i) => (
            <div key={stage.title} className="grid md:grid-cols-2 gap-8 items-center">
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <stage.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{stage.title}</h3>
                </div>
                <p className="text-gray-300 leading-relaxed">{stage.description}</p>
              </div>
              <div className={i % 2 === 1 ? "md:order-1" : ""}>
                <stage.Screen />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20 pt-10 border-t border-white/10 text-center max-w-2xl mx-auto space-y-4">
          <p className="text-gray-300">
            GuardianCheck supports your church's safeguarding policy; your team and your policy remain in
            charge.
          </p>
          <p className="text-sm text-gray-400">
            Everyone accepts your church's privacy policy before using the app. Read more about{" "}
            <Link to="/popia" className="text-white underline hover:no-underline">
              data protection
            </Link>{" "}
            and{" "}
            <Link to="/security" className="text-white underline hover:no-underline">
              security
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
