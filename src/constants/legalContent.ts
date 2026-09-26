import { COMPANY } from "./company.js";
import { TRIAL_MONTHS } from "./plans.js";
import { PAYMENT_GRACE_DAYS } from "../lib/churchAccess.js";

/**
 * Bumping this sends every signed-in user (admins, volunteers and parents)
 * back through /policy-acceptance on their next visit, and the server refuses
 * check-in until a volunteer has accepted. Release a bump midweek, not on a
 * Sunday morning.
 *
 * 1.1: payment, suspension, cancellation and data retention terms, added with
 * the trial lockout (#137).
 */
export const CURRENT_POLICY_VERSION = "1.1";

const trialLength = TRIAL_MONTHS === 1 ? "one month" : `${TRIAL_MONTHS} months`;
const graceDays = `${PAYMENT_GRACE_DAYS} days`;

export const LEGAL_CONTENT = {
  version: CURRENT_POLICY_VERSION,
  lastUpdated: "2026-09-15",
  privacyPolicy: {
    title: "Privacy Policy (POPIA Compliant)",
    sections: [
      {
        id: "introduction",
        title: "1. Introduction",
        content: "GuardianCheck ('we', 'us', or 'our') is committed to protecting the privacy and personal information of our users, particularly children. This Privacy Policy explains how we collect, use, and safeguard personal information in compliance with the Protection of Personal Information Act (POPIA) of South Africa."
      },
      {
        id: "responsible-party",
        title: "2. Responsible Party vs. Operator",
        content: "Under POPIA, your Church organization is the 'Responsible Party' (Controller) that determines why and how personal information is processed. GuardianCheck acts as the 'Operator' (Processor) that processes this information on behalf of the Church.",
        roles: ["admin", "master_admin"]
      },
      {
        id: "data-collection",
        title: "3. Information We Collect",
        content: "We collect information necessary for secure child check-in, including: Names of children and guardians, contact details, child age/gender, medical/allergy notes, and photos for identification purposes."
      },
      {
        id: "children-data",
        title: "4. Protection of Children's Information",
        content: "Processing of personal information concerning children is subject to strict safeguards. We only process this information with the explicit consent of a parent or legal guardian, or where necessary for the safety and security of the child.",
        roles: ["parent"]
      },
      {
        id: "third-parties",
        title: "5. Third-Party Disclosures",
        content: "We share data with trusted service providers only as necessary: Firebase (Data Storage), PayFast (Payment Processing), and SMTP providers (Email Notifications). We do not sell your personal information."
      },
      {
        id: "user-rights",
        title: "6. Your Rights",
        content: "You have the right to access, correct, or request the deletion of your personal information. Parents can manage their child's data through the application or by contacting the Church Admin."
      },
      {
        id: "confidentiality",
        title: "7. Confidentiality Obligations",
        content: "Volunteers and Staff are bound by strict confidentiality obligations. Accessing child data without a valid operational reason is a breach of policy and POPIA.",
        roles: ["volunteer", "admin", "master_admin"]
      }
    ]
  },
  termsOfService: {
    title: "Terms of Service",
    sections: [
      {
        id: "acceptance",
        title: "1. Acceptance of Terms",
        content: "By using GuardianCheck, you agree to these Terms of Service. If you are an Admin, you represent that you have the authority to bind your Church organization to these terms."
      },
      {
        id: "security",
        title: "2. Security Responsibilities",
        content: "Users are responsible for maintaining the confidentiality of their login credentials. Any unauthorized use of your account must be reported immediately."
      },
      {
        id: "dpa",
        title: "3. Data Processing Agreement",
        content: "Admins acknowledge that by using this platform, the Church enters into a Data Processing Agreement with GuardianCheck, ensuring all processing complies with POPIA standards.",
        roles: ["admin", "master_admin"]
      },
      {
        id: "trial-and-fees",
        title: "4. Free Trial, Fees and Billing",
        content: `Each Church starts with a free trial of ${trialLength}. No payment details are needed to start it, and nothing is charged during it. To keep using GuardianCheck after the trial, a Church Admin must choose a paid plan. Plans are billed monthly in South African rand and processed by PayFast, at the price shown for the chosen plan when you subscribe. The first charge is taken when you subscribe, or on the last day of the trial if you subscribe during it, and then on the same day each month. Each plan limits the number of users and children a Church can register. We may change our prices by giving Church Admins at least 30 days' notice by email before the change applies to their Church.`,
        roles: ["admin", "master_admin"]
      },
      {
        id: "suspension",
        title: "5. Suspension for Non-Payment",
        content: `If the free trial ends without a paid plan being chosen, or a monthly payment is not received within ${graceDays} of its billing date, the Church's access to GuardianCheck is suspended. While suspended, no children can be checked in and the Church's information cannot be added to or changed, for every user in that Church. Children already checked in when suspension begins can still be checked out, and parents can still see their guardian pickup codes. The Church's information is not deleted by suspension. A Church Admin can restore access at any time by choosing a plan and completing payment, and access returns once PayFast confirms the payment.`
      },
      {
        id: "cancellation",
        title: "6. Cancellation and Refunds",
        content: `A Church Admin can cancel the subscription at any time from the Church's settings. Cancelling stops future charges. The Church keeps access until the end of the period it has already paid for, after which its access is suspended as described in section 5. Fees already paid are not refunded, including for a partly used month, unless the law requires otherwise. If you believe you were charged in error, contact us at ${COMPANY.email}.`,
        roles: ["admin", "master_admin"]
      },
      {
        id: "data-after-suspension",
        title: "7. Your Information After Suspension or Cancellation",
        content: `We keep a suspended or cancelled Church's information for 90 days from the date its access was suspended, so that it can be restored in full if the Church resumes its subscription. During that time a Church Admin can request a copy of the Church's information by emailing ${COMPANY.email}. After 90 days we may permanently delete the Church's information. We will email the Church Admin at least 30 days before doing so. This does not affect the rights of parents, guardians and other users to access, correct or request the deletion of their personal information under POPIA at any time.`
      }
    ]
  }
};
