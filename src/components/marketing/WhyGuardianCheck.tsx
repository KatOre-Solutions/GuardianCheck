import { ScanFace, ShieldAlert, Users, Banknote } from "lucide-react";

const REASONS = [
  {
    icon: ScanFace,
    title: "Pickup is verified, not assumed",
    description: "Checked against the guardian's own QR code and photo, not just a name on a list.",
  },
  {
    icon: ShieldAlert,
    title: "Exceptions are controlled, not informal",
    description:
      "An override needs the church PIN and a written reason, locks after repeated wrong PINs, and every attempt is logged.",
  },
  {
    icon: Users,
    title: "Built around a real Sunday",
    description:
      "Volunteers see allergies at check-in, siblings check in together, and check-in keeps working if Wi-Fi drops.",
  },
  {
    icon: Banknote,
    title: "One price list, every feature",
    description: "Every plan includes every feature, priced in rand. You choose by the size of your ministry.",
  },
];

export function WhyGuardianCheck() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div className="relative order-2 lg:order-1">
          <div className="aspect-[16/9] rounded-3xl overflow-hidden shadow-xl border border-gray-100 dark:border-gray-800">
            <img
              src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=1200&h=675"
              srcSet="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=600&h=338 600w, https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=1200&h=675 1200w"
              sizes="(min-width: 1024px) 600px, 100vw"
              width={1200}
              height={675}
              loading="lazy"
              decoding="async"
              alt="A children's ministry volunteer helping a family"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="order-1 lg:order-2 space-y-8">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold text-ink dark:text-white tracking-tight">
              Why GuardianCheck
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
              Most check-in tools are built for guest lists. GuardianCheck is built for the two questions that
              actually matter with children: who is responsible for them right now, and who is allowed to take
              them home.
            </p>
          </div>

          <ul className="space-y-6">
            {REASONS.map((reason) => (
              <li key={reason.title} className="flex items-start gap-4">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 dark:bg-primary/20 shrink-0">
                  <reason.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{reason.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{reason.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
