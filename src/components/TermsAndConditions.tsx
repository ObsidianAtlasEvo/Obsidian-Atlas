import React from 'react';
import { SOVEREIGN_CREATOR_EMAIL } from '../config/sovereignCreator';

export function TermsAndConditions() {
  return (
    <div className="min-h-[100dvh] bg-obsidian text-ivory p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-serif text-gold">Obsidian Atlas Terms and Conditions</h1>
        
        <div className="text-sm text-stone space-y-1">
          <p>Effective Date: 04/04/2026</p>
          <p>Last Updated: 04/04/2026</p>
        </div>

        <div className="space-y-4 text-stone leading-relaxed">
          <h2 className="text-xl font-serif text-ivory pt-4">1. Acceptance of Terms</h2>
          <p>These Terms and Conditions (“Terms”) govern your access to and use of Obsidian Atlas and its related website, application, tools, features, and services (collectively, the “Services”).</p>
          <p>By accessing or using the Services, you agree to be bound by these Terms. If you do not agree, do not use the Services.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">2. Eligibility</h2>
          <p>You must be at least 18 years old, or the age of legal majority in your jurisdiction, to use the Services unless you have permission from a parent or legal guardian where applicable.</p>
          <p>By using the Services, you represent that you are legally able to enter into these Terms.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">3. Services Description</h2>
          <p>Obsidian Atlas is an evolving software platform that may provide AI-assisted responses, organizational tools, memory-based features, analysis, writing support, knowledge management functions, or other related capabilities.</p>
          <p>We may modify, suspend, or discontinue any part of the Services at any time, with or without notice.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">4. Account Responsibility</h2>
          <p>You may be required to create an account to access certain features. You are responsible for:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Maintaining the confidentiality of your login credentials</li>
            <li>All activity that occurs under your account</li>
            <li>Providing accurate and current account information</li>
          </ul>
          <p>You agree to notify us promptly at {SOVEREIGN_CREATOR_EMAIL} if you believe your account has been compromised.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">5. Acceptable Use</h2>
          <p>You agree not to use the Services to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Violate any applicable law or regulation</li>
            <li>Infringe the rights of others</li>
            <li>Submit or distribute unlawful, defamatory, harassing, abusive, fraudulent, or deceptive content</li>
            <li>Upload malicious code, viruses, or harmful materials</li>
            <li>Attempt unauthorized access to systems, accounts, or data</li>
            <li>Reverse engineer, disrupt, or interfere with the Services</li>
            <li>Use the Services to create or distribute harmful, illegal, or abusive material</li>
          </ul>
          <p>We reserve the right to suspend or terminate access for conduct that violates these Terms or creates risk for the Services or others.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">6. User Content</h2>
          <p>You may submit prompts, files, notes, messages, feedback, and other materials through the Services (“User Content”).</p>
          <p>You retain ownership of your User Content to the extent permitted by law. By submitting User Content, you grant Obsidian Atlas a non-exclusive, worldwide, royalty-free license to use, host, store, process, reproduce, and display that content solely as reasonably necessary to operate, improve, secure, and provide the Services.</p>
          <p>You represent and warrant that:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>You have the rights necessary to submit your User Content</li>
            <li>Your User Content does not violate any law or third-party rights</li>
            <li>Your User Content does not contain material you are prohibited from sharing</li>
          </ul>

          <h2 className="text-xl font-serif text-ivory pt-4">7. AI Output Disclaimer</h2>
          <p>The Services may generate content, recommendations, summaries, or other outputs using automated systems or artificial intelligence.</p>
          <p>You acknowledge and agree that:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Outputs may contain errors, omissions, or inaccuracies</li>
            <li>Outputs may not be unique</li>
            <li>You are responsible for evaluating and verifying outputs before relying on them</li>
            <li>The Services do not provide legal, medical, financial, or other professional advice</li>
          </ul>
          <p>Your use of any output is at your own risk.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">8. Intellectual Property</h2>
          <p>The Services, including their design, branding, visual identity, software, interfaces, text, graphics, logos, and underlying systems, are owned by or licensed to Obsidian Atlas and are protected by applicable intellectual property laws.</p>
          <p>Except as expressly permitted by these Terms, you may not copy, distribute, modify, create derivative works from, sell, lease, sublicense, or exploit the Services or any portion of them without prior written permission.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">9. Feedback</h2>
          <p>If you provide suggestions, ideas, or feedback regarding the Services, you agree that we may use them without restriction or obligation to compensate you.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">10. Third-Party Services</h2>
          <p>The Services may include or rely on third-party products, APIs, integrations, websites, or services. We are not responsible for third-party services, and your use of them may be subject to separate terms and policies.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">11. Service Availability</h2>
          <p>We do not guarantee that the Services will be uninterrupted, error-free, secure, or always available. The Services are provided on an evolving and provisional basis, especially during testing, early access, or pre-release phases.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">12. Disclaimer of Warranties</h2>
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR RELIABILITY.</p>
          <p>We do not warrant that the Services will meet your expectations or requirements.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">13. Limitation of Liability</h2>
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, OBSIDIAN ATLAS AND ITS OWNERS, OPERATORS, AFFILIATES, EMPLOYEES, CONTRACTORS, LICENSORS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, PROFITS, GOODWILL, BUSINESS OPPORTUNITY, OR OTHER INTANGIBLE LOSSES ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICES.</p>
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING OUT OF OR RELATED TO THE SERVICES SHALL NOT EXCEED THE GREATER OF:<br/>
          (A) THE AMOUNT YOU PAID US FOR THE SERVICES IN THE TWELVE (12) MONTHS BEFORE THE CLAIM, OR<br/>
          (B) ONE HUNDRED U.S. DOLLARS ($100).</p>

          <h2 className="text-xl font-serif text-ivory pt-4">14. Indemnification</h2>
          <p>You agree to defend, indemnify, and hold harmless Obsidian Atlas and its owners, affiliates, personnel, contractors, licensors, and service providers from and against claims, damages, liabilities, losses, costs, and expenses, including reasonable attorneys’ fees, arising from or related to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your use of the Services</li>
            <li>Your User Content</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any rights of another person or entity</li>
          </ul>

          <h2 className="text-xl font-serif text-ivory pt-4">15. Termination</h2>
          <p>We may suspend or terminate your access to the Services at any time, with or without notice, if we believe you violated these Terms or if continued access could create risk, harm, or legal exposure.</p>
          <p>You may stop using the Services at any time.</p>
          <p>Sections that by their nature should survive termination will survive, including ownership, disclaimers, limitations of liability, indemnification, and dispute-related provisions.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">16. Governing Law</h2>
          <p>These Terms will be governed by and construed in accordance with the laws of Ohio, United States, without regard to conflict of law principles.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">17. Dispute Resolution</h2>
          <p>Any dispute arising out of or relating to these Terms or the Services shall be resolved in the courts located in Franklin County, Ohio, United States, and you consent to the jurisdiction and venue of those courts, unless applicable law requires otherwise.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">18. Changes to These Terms</h2>
          <p>We may revise these Terms from time to time. Updated Terms will be posted with a revised “Last Updated” date. Your continued use of the Services after revised Terms become effective constitutes your acceptance of the updated Terms.</p>

          <h2 className="text-xl font-serif text-ivory pt-4">19. Contact Information</h2>
          <p>For questions about these Terms, contact:</p>
          <div className="pt-2">
            <p>Obsidian Atlas</p>
            <p>Ryan Crowley</p>
            <p>5809 Parkside Crossing, Dublin, OH 43016</p>
            <p>{SOVEREIGN_CREATOR_EMAIL}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
