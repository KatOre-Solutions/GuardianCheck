export const CURRENT_POLICY_VERSION = "1.0";

export const LEGAL_CONTENT = {
  version: CURRENT_POLICY_VERSION,
  lastUpdated: "2026-04-13",
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
      }
    ]
  }
};
