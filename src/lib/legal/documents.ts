/**
 * Legal documents — single source of truth for Terms & Privacy Policy.
 *
 * Versioning: `version` is an ISO date string (YYYY-MM-DD) matching the
 * document's Effective Date. When the document changes, bump the version and
 * the acceptance gate will re-prompt users who accepted an older version.
 *
 * Both the acceptance gate and the in-app viewer read from this file, so the
 * text in the modal and in Settings is always identical.
 *
 * The backend also exposes these documents via `GET /v1/legal/documents` so
 * that server-side flows (audit logging, PDF export, etc.) see the same text.
 */

export type LegalDocumentKind = 'terms' | 'privacy';

export interface LegalDocument {
  readonly kind: LegalDocumentKind;
  readonly title: string;
  readonly version: string;      // ISO date, bump on change
  readonly effectiveDate: string;
  readonly lastUpdated: string;
  readonly body: string;         // plaintext with \n\n paragraph breaks
}

// ─── Terms and Conditions ──────────────────────────────────────────────
export const TERMS_AND_CONDITIONS: LegalDocument = {
  kind: 'terms',
  title: 'Terms and Conditions',
  version: '2026-04-18',
  effectiveDate: '04/18/26',
  lastUpdated: '04/18/26',
  body: `1. Acceptance of Terms
These Terms and Conditions ("Terms") govern your access to and use of Obsidian Atlas and all related websites, applications, tools, features, content, and services (collectively, the "Services").

By accessing or using the Services, you agree to be bound by these Terms. If you do not agree, do not use the Services.

2. Eligibility
You must be at least 18 years old, or the age of legal majority in your jurisdiction, to use the Services unless you are using them with proper permission from a parent or legal guardian where permitted by law.

By using the Services, you represent that you are legally able to enter into these Terms.

3. Description of Services
Obsidian Atlas is an AI-based software platform that may provide writing assistance, analysis, organizational tools, memory-based features, cognitive workflows, and other related functions.

We may update, modify, suspend, or discontinue any portion of the Services at any time, with or without notice.

4. Accounts
Some features may require an account. You are responsible for:
- Maintaining the confidentiality of your login credentials
- Ensuring your information is accurate and current
- All activity occurring under your account

You must notify us promptly at ObsidianAtlasTech@gmail.com if you suspect unauthorized access to your account.

5. Acceptable Use
You agree not to use the Services to:
- Violate any applicable law or regulation
- Infringe or violate another person's rights
- Upload, submit, or distribute unlawful, defamatory, abusive, harassing, deceptive, or fraudulent content
- Upload malicious code, viruses, or harmful materials
- Attempt to gain unauthorized access to any account, system, network, or data
- Reverse engineer, disrupt, or interfere with the Services
- Use the Services for illegal, harmful, or abusive purposes

We reserve the right to suspend or terminate access if you violate these Terms or create risk for the platform or others.

6. User Content
You may provide prompts, uploads, notes, files, messages, feedback, and other content ("User Content").

You retain ownership of your User Content to the extent permitted by law. By submitting User Content, you grant Obsidian Atlas Tech a non-exclusive, worldwide, royalty-free license to host, store, process, reproduce, and use that content solely as reasonably necessary to operate, improve, secure, and provide the Services.

You represent and warrant that:
- You have the rights needed to submit the User Content
- Your User Content does not violate law or third-party rights
- Your User Content does not contain material you are prohibited from sharing

7. Paid Tiers, Billing, and Stripe
Obsidian Atlas may offer paid subscription tiers or paid features. Payments may be processed through Stripe or another third-party payment processor.

By purchasing a paid tier, you agree:
- To pay all fees presented at checkout
- That your payment information may be processed by Stripe under Stripe's applicable terms and privacy practices
- That subscription details, billing cadence, renewals, cancellation terms, and any plan-specific conditions may be presented at checkout or within your account settings

Failure to complete payment may result in suspension or loss of access to paid features.

8. Cancellations and Refunds
You may cancel a subscription in accordance with the cancellation options made available through the Services or payment platform. Unless otherwise stated at the time of purchase, fees are non-refundable except where required by law.

Because these Terms are temporary placeholders, you may later want a separate dedicated refund policy.

9. AI Output Disclaimer
The Services may generate responses, summaries, analyses, recommendations, or other outputs using artificial intelligence or automated systems.

You acknowledge and agree that:
- Outputs may contain inaccuracies, omissions, or errors
- Outputs may not be unique
- You are responsible for reviewing and verifying outputs before relying on them
- The Services do not provide legal, medical, financial, or other professional advice

Your use of any output is at your own risk.

10. Intellectual Property
The Services, including their branding, design, software, interfaces, text, graphics, structure, and related materials, are owned by or licensed to Obsidian Atlas Tech and are protected by applicable intellectual property laws.

Except as expressly permitted by these Terms, you may not copy, modify, distribute, sell, sublicense, lease, or exploit any portion of the Services without prior written permission.

11. Feedback
If you submit ideas, suggestions, or feedback, you agree that we may use them without restriction or obligation to compensate you.

12. Third-Party Services
The Services may include integrations with third-party tools, websites, APIs, payment providers, or services. We are not responsible for third-party services, and your use of them may be governed by separate terms and policies.

13. Suspension and Termination
We may suspend, restrict, or terminate your access to the Services at any time, with or without notice, if we believe:
- You violated these Terms
- Your use creates legal, technical, or security risk
- Continued access may harm the Services, users, or third parties

You may stop using the Services at any time.

14. Disclaimer of Warranties
TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR RELIABILITY.

We do not guarantee that the Services will be uninterrupted, secure, or error-free.

15. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, OBSIDIAN ATLAS TECH AND ITS OWNERS, AFFILIATES, OFFICERS, EMPLOYEES, CONTRACTORS, LICENSORS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS OPPORTUNITY ARISING FROM OR RELATED TO YOUR USE OF THE SERVICES.

TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATED TO THE SERVICES SHALL NOT EXCEED THE GREATER OF:
- THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS BEFORE THE CLAIM, OR
- ONE HUNDRED U.S. DOLLARS ($100)

16. Indemnification
You agree to defend, indemnify, and hold harmless Obsidian Atlas Tech and its affiliates, personnel, contractors, licensors, and service providers from and against claims, damages, liabilities, losses, costs, and expenses, including reasonable attorneys' fees, arising from or related to:
- Your use of the Services
- Your User Content
- Your violation of these Terms
- Your violation of any law or third-party rights

17. Governing Law
These Terms are governed by the laws of the State of Ohio, without regard to conflict of law principles.

18. Dispute Resolution and Venue
Any dispute arising out of or relating to these Terms or the Services shall be brought in a court of competent jurisdiction located in Ohio, unless applicable law requires otherwise.

19. Changes to These Terms
We may revise these Terms from time to time. Updated versions will be posted with a revised "Last Updated" date. Your continued use of the Services after revised Terms become effective constitutes your acceptance of the updated Terms.

20. Contact Information
Obsidian Atlas Tech
5809 Parkside Crossing
Dublin, OH 43016
ObsidianAtlasTech@gmail.com`,
};

// ─── Privacy Policy ────────────────────────────────────────────────────
export const PRIVACY_POLICY: LegalDocument = {
  kind: 'privacy',
  title: 'Privacy Policy',
  version: '2026-04-18',
  effectiveDate: '04/18/26',
  lastUpdated: '04/18/26',
  body: `1. Introduction
Obsidian Atlas Tech ("Obsidian Atlas," "Company," "we," "our," or "us") respects your privacy and is committed to protecting your information. This Privacy Policy explains how we collect, use, store, disclose, and protect information when you use the Obsidian Atlas website, application, platform, and related services (collectively, the "Services").

This Privacy Policy is a temporary placeholder and may be revised as the Services evolve.

2. Information We Collect
We may collect the following categories of information:

A. Information You Provide
We may collect information you provide directly, including:
- Name
- Email address
- Account credentials
- Prompts, messages, notes, uploads, documents, or other content submitted through the Services
- Support requests, feedback, and other communications

B. Usage and Technical Information
We may automatically collect certain technical and usage information, including:
- IP address
- Browser type
- Device type
- Operating system
- Log data
- Diagnostic data
- Interaction data
- Pages, features, or tools accessed
- Dates, times, and duration of use

C. Payment and Subscription Information
If you purchase a paid tier, payment processing may be handled by Stripe or another third-party payment processor. We do not intend to store full payment card details on our own servers unless expressly stated otherwise. We may receive limited billing and transaction details such as payment status, subscription tier, billing email, and other information needed to manage your account and subscription.

3. How We Use Information
We may use collected information to:
- Provide, operate, maintain, and improve the Services
- Create and manage user accounts
- Process subscriptions and paid-tier access
- Respond to messages, support requests, and feedback
- Personalize user experience
- Monitor performance, diagnose issues, and maintain security
- Detect, investigate, and prevent fraud, abuse, misuse, or unauthorized access
- Enforce our Terms and Conditions
- Comply with legal obligations

4. AI Features and User Content
Obsidian Atlas may process prompts, messages, uploads, notes, and other user content to generate responses, recommendations, analyses, summaries, or other outputs.

You understand and agree that:
- AI-generated outputs may be inaccurate, incomplete, or unsuitable for your intended use
- You are responsible for reviewing and evaluating outputs before relying on them
- Obsidian Atlas is not a substitute for legal, medical, financial, or other licensed professional advice

5. How We Share Information
We do not sell your personal information. We may share information:
- With service providers and vendors that help us operate the Services
- With payment processors, including Stripe, to process subscriptions and payments
- To comply with law, legal process, or government requests
- To protect the rights, property, safety, and security of Obsidian Atlas, our users, or others
- In connection with a merger, acquisition, financing, restructuring, or sale of some or all assets
- With your consent or at your direction

6. Data Storage and Security
We store user data securely and use reasonable administrative, technical, and organizational safeguards designed to protect information from unauthorized access, loss, misuse, alteration, or disclosure. However, no system can guarantee absolute security, and you use the Services at your own risk.

7. Data Retention
We may retain information for as long as reasonably necessary to:
- Provide the Services
- Maintain account and subscription records
- Improve and secure the platform
- Comply with legal obligations
- Resolve disputes
- Enforce agreements

We may delete, anonymize, or de-identify information when it is no longer reasonably needed.

8. Your Choices
You may be able to:
- Update certain account information
- Cancel your subscription
- Request deletion of your account or associated information, subject to legal and operational limits
- Opt out of certain communications

To make a request, contact: ObsidianAtlasTech@gmail.com

9. Children's Privacy
Obsidian Atlas is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If we learn that we have collected such information without appropriate authorization, we will take reasonable steps to delete it.

10. Third-Party Services
The Services may integrate with or rely on third-party tools, APIs, payment providers, hosting providers, analytics services, or websites. Their own terms and privacy policies may apply separately, and we are not responsible for the privacy practices of third parties.

11. International Users
If you access the Services from outside the United States, you understand that your information may be transferred to, stored in, and processed in the United States or other jurisdictions where data protection laws may differ.

12. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. Updated versions will be posted with a revised "Last Updated" date. Your continued use of the Services after changes become effective constitutes acceptance of the revised Privacy Policy.

13. Contact Information
Obsidian Atlas Tech
5809 Parkside Crossing
Dublin, OH 43016
ObsidianAtlasTech@gmail.com`,
};

export const LEGAL_DOCUMENTS: Readonly<Record<LegalDocumentKind, LegalDocument>> = Object.freeze({
  terms: TERMS_AND_CONDITIONS,
  privacy: PRIVACY_POLICY,
});
