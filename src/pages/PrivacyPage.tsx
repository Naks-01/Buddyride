const sectionStyle = { margin: '28px 0' }

export default function PrivacyPage() {
  return <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 56px', color: '#182230', fontFamily: 'Arial, sans-serif', lineHeight: 1.65 }}>
    <a href="/" style={{ color: '#0f4a8a' }}>← BuddyRide home</a>
    <h1>BuddyRide Privacy Policy</h1>
    <p><strong>Effective date: 6 November 2026</strong> • Last updated: 6 November 2026</p>
    <p>This policy explains how BuddyRide (presented as BuddyRide (Pty) Ltd, “BuddyRide”, “we”, “us”) handles personal information in connection with its e-hailing platform in South Africa. Our stated service base is Hartbeespoort, South Africa. Confirm the responsible legal entity, Information Officer, registration details, and contact address before launch. This policy is intended to support compliance with the Protection of Personal Information Act 4 of 2013 (POPIA); it is not legal advice or a certification of compliance.</p>

    <nav aria-label="Privacy contents" style={{ background: '#f8f9fa', padding: '16px 20px', borderRadius: 12, margin: '20px 0' }}>
      <strong>On this page:</strong>
      <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
        <li><a href="#responsible" style={{ color: '#0f4a8a' }}>Responsible party and contact</a></li>
        <li><a href="#collect" style={{ color: '#0f4a8a' }}>Information we collect</a></li>
        <li><a href="#purposes" style={{ color: '#0f4a8a' }}>Purposes and lawful justification</a></li>
        <li><a href="#sharing" style={{ color: '#0f4a8a' }}>Sharing and operators</a></li>
        <li><a href="#retention" style={{ color: '#0f4a8a' }}>Retention and deletion</a></li>
        <li><a href="#security" style={{ color: '#0f4a8a' }}>Security and confidentiality</a></li>
        <li><a href="#rights" style={{ color: '#0f4a8a' }}>Your rights and complaints</a></li>
        <li><a href="#children" style={{ color: '#0f4a8a' }}>Children</a></li>
        <li><a href="#changes" style={{ color: '#0f4a8a' }}>Changes and contact</a></li>
      </ol>
    </nav>

    <section id="responsible" style={sectionStyle}>
      <h2>1. Responsible party and contact</h2>
      <p>BuddyRide is the responsible party for personal information processed for its own platform purposes, subject to the actual operating arrangements. Contact us at <a href="mailto:buddyride@outlook.com">buddyride@outlook.com</a> or <a href="tel:+27641018991">064 101 8991</a>, currently stated support hours 8am–8pm daily, for privacy questions or requests. Before public launch, publish the appointed Information Officer’s name and contact details and a reliable physical/postal address. If another entity determines the purpose and means of processing, that entity and its role must be accurately identified here.</p>
    </section>

    <section id="collect" style={sectionStyle}>
      <h2>2. Information we collect</h2>
      <ul>
        <li><strong>Account and contact information:</strong> name, email address, telephone number, account identifiers, role, and authentication/security records.</li>
        <li><strong>Trip and location information:</strong> pickup/drop-off details and coordinates, route, trip status, timestamps, driver availability and location while using relevant features, and support or safety reports.</li>
        <li><strong>Identity and safety information:</strong> ID/passport number or image, selfie, driver identity and qualification documents, vehicle documents and images, verification/review status, and safety-related communications. These may be sensitive and receive restricted access.</li>
        <li><strong>Payment and driver payout information:</strong> transaction references, payment status, fare and earnings records, and driver bank account details needed for payout. Payment providers may process card details directly; BuddyRide should not receive or store full card credentials.</li>
        <li><strong>Technical and usage information:</strong> device/browser details, app events, diagnostics, security logs, and cookie or local-storage preferences necessary for operation and security.</li>
        <li><strong>Communications:</strong> messages sent to support, ride chat where enabled, feedback, ratings, and notices sent through configured channels.</li>
      </ul>
      <p>We collect information from you, from your use of the platform, from the other trip participant where needed for the trip, and from service providers or verification sources only where lawfully configured. We do not claim a Home Affairs, credit-bureau, or independent identity check unless a specific integration is actually in place.</p>
    </section>

    <section id="purposes" style={sectionStyle}>
      <h2>3. Purposes and lawful justification</h2>
      <p>We use information to create and secure accounts; match and manage rides; show necessary trip details to the passenger and assigned driver; calculate fares and process payments; assess driver eligibility and passenger safety submissions; provide support; investigate complaints, fraud, or incidents; maintain and improve reliability; meet legal, tax, accounting, and regulatory obligations; and establish, exercise, or defend legal rights.</p>
      <p>We process only for a specific, lawful purpose and rely on the applicable POPIA justification for the processing, such as taking steps requested to provide a service, compliance with a legal obligation, a legitimate interest assessed against your rights, or your consent where consent is required. We request separate, informed consent for optional processing where appropriate. You can withdraw consent prospectively, but this does not affect processing already lawfully performed or processing supported by another valid justification.</p>
    </section>

    <section id="sharing" style={sectionStyle}>
      <h2>4. Sharing and operators</h2>
      <p>We share only information reasonably needed for the stated purpose: trip details and necessary contact information between the assigned passenger and driver; payment details with the selected payment processor; data with hosting, database, mapping, communications, support, and security providers acting under appropriate instructions; and information with authorities or other parties when lawfully required or necessary to protect people and legal rights. We do not sell personal information.</p>
      <p>Service providers may process information in South Africa or another country. Before any cross-border transfer, BuddyRide must assess the recipient, safeguards, and POPIA section 72 requirements and put appropriate contractual and technical protections in place. The identity and current locations of material operators should be available on request. Do not assume WhatsApp messaging or OTP processing is active merely because a phone number is displayed.</p>
    </section>

    <section id="retention" style={sectionStyle}>
      <h2>5. Retention and deletion</h2>
      <p>We retain information only as long as needed for its collection purpose, legal obligations, dispute resolution, and platform security. Proposed operational limits, subject to confirmation against applicable transport, tax, and legal requirements, are: trip and payment records for up to five years after the transaction; account data while the account is active and up to 12 months after closure; support and safety incident records for up to five years after closure of the matter; and rejected or expired identity documents for no longer than 90 days after the decision unless a dispute, legal hold, or law requires longer. Backups may persist for up to 90 days after deletion from active systems.</p>
      <p>These periods must be validated and configured in production. Where information is no longer needed, we will securely delete it or irreversibly de-identify it, subject to legal holds and lawful retention duties. Request deletion by contacting us; we will explain any information we must retain and why.</p>
    </section>

    <section id="security" style={sectionStyle}>
      <h2>6. Security and confidentiality</h2>
      <p>We use safeguards appropriate to the information and risk, such as access restrictions, authentication, encryption in transit, secure storage configuration, least-privilege provider access, monitoring, and staff confidentiality measures. No internet transmission or storage system can be guaranteed completely secure. Identity images, ID numbers, live location, and bank details should only be available to people and systems with a specific operational need.</p>
      <p>If a security compromise occurs, BuddyRide will assess and respond, notify the Information Regulator and affected data subjects where POPIA requires, and provide appropriate information and mitigation guidance. Report suspected exposure promptly to <a href="mailto:buddyride@outlook.com">buddyride@outlook.com</a>.</p>
    </section>

    <section id="rights" style={sectionStyle}>
      <h2>7. Your rights and complaints</h2>
      <p>Subject to POPIA and other applicable law, you may request access to, correction or deletion of personal information; object to certain processing; withdraw consent where consent is the basis; ask about an automated decision that significantly affects you; or lodge a complaint. We may request information reasonably necessary to verify your identity and protect another person’s information. Contact the details in section 1. We will respond within applicable statutory time limits and explain any lawful refusal.</p>
      <p>You may also complain to the Information Regulator (South Africa) using the current contact channels published at <a href="https://inforegulator.org.za/" target="_blank" rel="noreferrer">inforegulator.org.za</a>. You are not required to contact BuddyRide first.</p>
    </section>

    <section id="children" style={sectionStyle}>
      <h2>8. Children</h2>
      <p>The platform is not designed to collect children’s information without appropriate authority and consent. Where information about a child is necessary, we will process it only as permitted by POPIA and applicable law, with the required competent-person consent or another lawful justification. Contact us if you believe a child’s information was provided improperly.</p>
    </section>

    <section id="changes" style={sectionStyle}>
      <h2>9. Changes and contact</h2>
      <p>We may update this policy when our practices or legal obligations change. We will publish the revised policy and effective date and provide notice or obtain renewed consent where required. The current policy is available at <a href="/privacy">/privacy</a>. Questions and privacy requests: <a href="mailto:buddyride@outlook.com">buddyride@outlook.com</a> or <a href="tel:+27641018991">064 101 8991</a>.</p>
    </section>

    <p><a href="/terms">Read the Terms and Conditions</a> · <a href="/">Return to BuddyRide</a></p>
  </main>
}