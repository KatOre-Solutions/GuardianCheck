/**
 * Copy and fictional sample data for the marketing site (`/`).
 *
 * Single-sourced so the visible FAQ text and its JSON-LD `FAQPage` block
 * cannot drift apart, and so every replica component draws its fictional
 * names from the same small, clearly-fictional set rather than each
 * component inventing its own.
 *
 * See docs/marketing-redesign-plan.md §3 for the truth constraints these
 * strings were written against: mechanisms, not outcomes; no invented scale;
 * no "instant"/"real-time" outside the admin and volunteer attendance views.
 */

export const NAV_ANCHORS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#safety", label: "Safety" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export const DEMO_MESSAGE = "Hi GuardianCheck team, I'd like a demo for my church.";

export const MARKETING = {
  faq: [
    {
      question: "Do volunteers need special hardware or training?",
      answer:
        "No. Any phone, tablet or laptop with a camera and a web browser works. Scanning a QR code is the only skill a volunteer needs to learn.",
    },
    {
      question: "What do parents need?",
      answer:
        "A phone to show their guardian QR code at pickup, and an email address, which is where they get a message when their child is checked in or collected.",
    },
    {
      question: "What if the internet drops?",
      answer:
        "Check-in keeps working, as long as the app was already open on that device before the connection dropped. It syncs automatically once the connection returns.",
    },
    {
      question: "What if a guardian doesn't have their QR code?",
      answer:
        "A volunteer can still release the child, but only after entering the church's PIN and a written reason. Repeated wrong PINs lock the override, and every attempt is logged.",
    },
    {
      question: "How is children's information handled?",
      answer:
        "Your church is the Responsible Party under POPIA and decides why and how the information is used. GuardianCheck is the Operator, processing it on your church's behalf.",
    },
    {
      question: "What happens after the trial?",
      answer:
        "Your church chooses a plan and is billed monthly in rand via PayFast. You can cancel anytime from your church's settings, and nothing is charged during the trial itself.",
    },
    {
      question: "Can we use our own logo?",
      answer:
        "Yes. Every plan lets you set your church's logo, colours and its own GuardianCheck link, at no extra cost.",
    },
    {
      question: "I'm a parent, where do I log in?",
      answer:
        "At your own church's GuardianCheck link, not here. This page is for the people deciding whether to bring GuardianCheck to their church, so ask your church office for the link.",
    },
  ],
} as const;

/**
 * Fictional sample data for the UI replicas in components/marketing/replicas.
 * Never real church, child or guardian data. See the plan's truth
 * constraints on why: a real screenshot would expose Bryanston Methodist
 * Church's actual children.
 */
export const SAMPLE = {
  church: "Grace Community Church",
  volunteer: "Sipho N.",
  guardian: "Thandiwe M.",
  children: [
    { name: "Naledi M.", age: 6, room: "Rainbow Room", allergy: "Peanuts" },
    { name: "Kagiso M.", age: 4, room: "Little Lambs", allergy: null },
  ],
  rooms: [
    { name: "Little Lambs", occupied: 11, capacity: 15 },
    { name: "Rainbow Room", occupied: 14, capacity: 15 },
    { name: "Explorers", occupied: 9, capacity: 20 },
    { name: "Youth Hub", occupied: 8, capacity: 25 },
  ],
  checkedInNow: 42,
  overridePinLabel: "Church PIN",
} as const;
