import { COMPANY } from "../../constants/company";
import { whatsappUrl } from "../../lib/whatsapp";
import { WhatsAppIcon } from "../icons/WhatsAppIcon";

const MESSAGE = "Hello, I'd like more information about GuardianCheck.";

/**
 * Always-on WhatsApp entry point, anchored to the corner of the screen.
 * Distinct from DemoInvite: that one is gated (25s + scroll) and offers a
 * booked walkthrough; this is an immediate "just ask" channel, visible from
 * the moment the page loads. The pulse ring is what makes it read as
 * clickable rather than decorative -- CSS only, so it costs nothing beyond
 * the rule in index.css, and it stops under prefers-reduced-motion.
 *
 * Bottom-right, opposite DemoInvite's bottom-left, so the two never
 * overlap. Sits above where DemoInvite's mobile bar would be, on a fixed
 * offset rather than coordinating with it -- simpler than a shared signal,
 * and the cost is only ever a little extra gap above the bar.
 */
export function WhatsAppFloat() {
  const href = whatsappUrl(COMPANY.whatsapp, MESSAGE);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="marketing-whatsapp-flash fixed z-40 bottom-20 right-4 sm:bottom-6 sm:right-6 flex items-center justify-center h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#128C7E] transition-colors"
    >
      <WhatsAppIcon className="h-7 w-7 text-white" />
    </a>
  );
}
