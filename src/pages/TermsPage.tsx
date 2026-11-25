const sectionStyle = { margin: '28px 0', scrollMarginTop: 20 } as const

export default function TermsPage() {
  const handlePrint = () => { window.print() }
  const handleBack = () => { window.location.href = '/' }

  return <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 56px', color: '#182230', fontFamily: 'Arial, sans-serif', lineHeight: 1.65 }}>
    <style>{`@media print { .no-print { display: none !important } }`}</style>
    <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      <button onClick={handleBack} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #D0D5DD', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>← Back</button>
      <a href="/" style={{ padding: '10px 16px', borderRadius: 10, background: '#F2F4F7', color: '#182230', fontWeight: 700, textDecoration: 'none', display: 'grid', placeItems: 'center' }}>BuddyRide home</a>
      <button onClick={handlePrint} style={{ padding: '10px 16px', borderRadius: 10, border: 0, background: '#0066FF', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>🖨️ Print Terms</button>
    </div>

    <h1>BuddyRide Terms and Conditions</h1>
    <p><strong>Effective date: 6 November 2026</strong> • Last updated: 6 November 2026</p>
    <p>These terms govern your use of the BuddyRide website and ride-booking service in South Africa. BuddyRide is BuddyRide (Pty) Ltd (“BuddyRide”, “we”, “us”). Our service base is Polokwane, Limpopo, South Africa. Service is currently available in Polokwane, Mankweng, Seshego, and surrounding Limpopo areas as shown in the app.</p>
    <p>By creating an account or using BuddyRide you agree to these terms. If you do not agree, do not use the service. These terms do not remove rights that cannot be limited under South African law, including applicable consumer-protection rights.</p>

    <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0' }}>
      <a href="mailto:buddyride@outlook.com?subject=Question%20about%20BuddyRide%20Terms" style={{ padding: '10px 14px', borderRadius: 10, background: '#E6F0FF', color: '#0052CC', fontWeight: 800, textDecoration: 'none' }}>✉️ Email Us</a>
      <a href="tel:+27641018991" style={{ padding: '10px 14px', borderRadius: 10, background: '#E6F0FF', color: '#0052CC', fontWeight: 800, textDecoration: 'none' }}>📞 Call 064 101 8991</a>
      <a href="https://wa.me/27641018991?text=Hi%20BuddyRide%2C%20I%20have%20a%20question%20about%20the%20Terms" target="_blank" rel="noreferrer" style={{ padding: '10px 14px', borderRadius: 10, background: '#ECFDF3', color: '#067647', fontWeight: 800, textDecoration: 'none' }}>💬 WhatsApp Us</a>
    </div>

    <nav aria-label="Terms contents" style={{ background: '#f8f9fa', padding: '16px 20px', borderRadius: 12, margin: '20px 0' }}>
      <strong>On this page:</strong>
      <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
        <li><a href="#provides" style={{ color: '#0f4a8a' }}>What BuddyRide provides</a></li>
        <li><a href="#responsibilities" style={{ color: '#0f4a8a' }}>Passenger and driver responsibilities</a></li>
        <li><a href="#fares" style={{ color: '#0f4a8a' }}>Fares, payments, and receipts</a></li>
        <li><a href="#refunds" style={{ color: '#0f4a8a' }}>Cancellations, refunds, and fare disputes</a></li>
        <li><a href="#safety" style={{ color: '#0f4a8a' }}>Safety and emergencies</a></li>
        <li><a href="#identity" style={{ color: '#0f4a8a' }}>Identity, account restrictions, and acceptable use</a></li>
        <li><a href="#privacy" style={{ color: '#0f4a8a' }}>Privacy and personal information</a></li>
        <li><a href="#liability" style={{ color: '#0f4a8a' }}>Availability, liability, and changes</a></li>
        <li><a href="#complaints" style={{ color: '#0f4a8a' }}>Complaints and governing law</a></li>
      </ol>
    </nav>

    <section id="provides" style={sectionStyle}>
      <h2>1. What BuddyRide provides</h2>
      <p>BuddyRide provides an electronic platform to request, arrange, and manage e-hailing trips between passengers and independent drivers. A booking is a request, not a guarantee: a trip is confirmed when an eligible driver accepts it. Drivers are responsible for providing the transport service and maintaining required licences, permits, roadworthiness, and insurance. BuddyRide is not an emergency service and does not guarantee a particular driver, vehicle, route, arrival time, or uninterrupted platform access.</p>
      <p>Use the service only in locations where it is available. You must provide accurate account, contact, pickup, and destination information and keep your login credentials secure. Accounts are personal and may not be transferred. You must be legally able to enter into the trip arrangement; minors may use the service only with appropriate parent or guardian involvement and subject to applicable law.</p>
    </section>

    <section id="responsibilities" style={sectionStyle}>
      <h2>2. Passenger and driver responsibilities</h2>
      <p>Passengers must be at the agreed pickup point, treat drivers and property respectfully, follow reasonable safety instructions, and not use the service for unlawful, dangerous, or abusive conduct. Do not request a ride for more passengers or items than the selected vehicle can lawfully carry.</p>
      {/* FIX: No payout details - Bundle model, drivers paid cash by rider */}
      <p>Drivers must hold and maintain the authorisations and vehicle documents required for their trips, keep their profile and vehicle details accurate, comply with road and safety laws, and only accept trips they can safely complete. BuddyRide may request documents and conduct manual review before allowing a driver to go online. Approval is not a guarantee of future eligibility or a representation that every identity document has been independently verified.</p>
    </section>

    <section id="fares" style={sectionStyle}>
      <h2>3. Fares, payments, and receipts</h2>
      <p>The app displays an estimated or quoted fare before a request. The final fare may be affected by the route, trip circumstances, and any lawful, disclosed adjustments. Do not rely on an estimate as a guaranteed amount unless it is expressly identified in the app as a fixed quote. Applicable payment methods and charges are shown before confirmation.</p>
      <p>Passengers pay drivers directly in cash. Paystack processes driver bundle purchases only; BuddyRide does not store full card credentials. Keep your receipt and contact support promptly if a charge or fare is disputed. Drivers retain 100% of the agreed trip fare. BuddyRide earns from prepaid driver bundles; bundle purchases are processed by Paystack. No percentage commission is deducted from trip fares. Nothing here promises settlement before payment processing and reconciliation.</p>
    </section>

    <section id="refunds" style={sectionStyle}>
      <h2>4. Cancellations, refunds, and fare disputes</h2>
      <p>A passenger may cancel through the app before or during a trip where the app allows it. A driver may cancel only for a legitimate safety, availability, or operational reason and should use the in-app process. Any cancellation fee, eligibility, or exception must be displayed to the passenger before it is charged. BuddyRide will not impose an undisclosed cancellation fee.</p>
      {/* FIX: Cash fares are between rider and driver - BuddyRide cannot refund cash it never held */}
      <p>If a bundle purchase via Paystack is duplicated or incorrectly charged, contact <a href="mailto:buddyride@outlook.com">buddyride@outlook.com</a> with your registered contact details, trip ID, date, and payment reference. We will investigate and, where a refund is due, return the relevant amount through the original payment method where practicable. Bank/provider processing times may apply. Cash fares are paid directly to the driver - cash fare disputes must be resolved between rider and driver, with BuddyRide support mediating where possible. Do not share banking passwords, PINs, or one-time codes. Disputes are assessed fairly under applicable consumer law and the disclosed fare rules; this section does not limit statutory rights.</p>
      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <a href="mailto:buddyride@outlook.com?subject=Refund%20Request%20-%20Trip%20ID%3A%20&body=Hi%20BuddyRide%2C%0A%0AMy%20Trip%20ID%3A%20%0ADate%20of%20trip%3A%20%0APayment%20reference%3A%20%0AAmount%3A%20R%0AReason%3A%20" style={{ padding: '10px 14px', borderRadius: 10, background: '#0066FF', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Request Refund</a>
        <a href="mailto:buddyride@outlook.com?subject=Fare%20Dispute%20-%20Trip%20ID%3A%20&body=Hi%20BuddyRide%2C%0A%0AMy%20Trip%20ID%3A%20%0AQuoted%20fare%3A%20R%0ACharged%20fare%3A%20R%0AWhat%20happened%3A%20" style={{ padding: '10px 14px', borderRadius: 10, background: '#fff', border: '1px solid #D0D5DD', color: '#182230', fontWeight: 800, textDecoration: 'none' }}>Dispute Fare</a>
      </div>
    </section>

    <section id="safety" style={sectionStyle}>
      <h2>5. Safety and emergencies</h2>
      <p>Confirm the vehicle and driver details in the app before getting in, wear a seat belt, and do not share your account or verification codes. Use any in-app safety or trip-sharing tools that are available, and report incidents to BuddyRide as soon as it is safe to do so. Tool availability may vary; the app is not a substitute for emergency services.</p>
      <p>For immediate danger, contact the appropriate South African emergency services directly (e.g. 10111 for police, 10177 for ambulance). BuddyRide support is available at <a href="mailto:buddyride@outlook.com">buddyride@outlook.com</a>, <a href="tel:+27641018991">064 101 8991</a>, and WhatsApp <a href="https://wa.me/27641018991" target="_blank" rel="noreferrer">064 101 8991</a> during published support hours 8am to 8pm daily. Telephone or WhatsApp contact does not guarantee an emergency response or continuous monitoring. Do not use the service if you reasonably believe a trip is unsafe.</p>
      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <a href="tel:10111" style={{ padding: '10px 14px', borderRadius: 10, background: '#DC2626', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>🚨 Call Police 10111</a>
        <a href="tel:10177" style={{ padding: '10px 14px', borderRadius: 10, background: '#fff', border: '1px solid #FECACA', color: '#B91C1C', fontWeight: 800, textDecoration: 'none' }}>🚑 Call Ambulance 10177</a>
        <a href="mailto:buddyride@outlook.com?subject=Safety%20Incident%20Report%20-%20Trip%20ID%3A%20&body=Hi%20BuddyRide%2C%0A%0AMy%20Trip%20ID%3A%20%0ADate%20and%20time%3A%20%0AWhat%20happened%3A%20%0AAre%20you%20safe%20now%3A%20" style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontWeight: 800, textDecoration: 'none' }}>Report Safety Issue</a>
      </div>
    </section>

    <section id="identity" style={sectionStyle}>
      <h2>6. Identity, account restrictions, and acceptable use</h2>
      <p>We may request identity, safety, and driver eligibility information to help protect users and comply with applicable requirements. Passenger verification may require manual admin review; submission does not mean approval. We may suspend or restrict an account, booking, or driver access when reasonably needed for safety, suspected fraud, legal compliance, unpaid charges, or a material breach. Where appropriate and lawful, we will provide a reason and a way to contact support or appeal.</p>
      <p>You may not interfere with the platform, falsify location or identity data, evade safety checks, scrape or reverse engineer the service, use another person’s account, or engage in harassment, discrimination, fraud, or unlawful activity.</p>
    </section>

    <section id="privacy" style={sectionStyle}>
      <h2>7. Privacy and personal information</h2>
      <p>Our collection and use of personal information is described in the <a href="/privacy">BuddyRide Privacy Policy</a>. By using the platform, you acknowledge that necessary information is processed to provide the service; where consent is the required legal basis, we will request it separately. You may exercise your rights using the contact details in that policy.</p>
    </section>

    <section id="liability" style={sectionStyle}>
      <h2>8. Availability, liability, and changes</h2>
      <p>We take reasonable steps to maintain the platform, but access may be interrupted for maintenance, connectivity, or events outside our reasonable control. To the extent allowed by law, BuddyRide is not responsible for indirect loss arising from inability to use the platform. Nothing in these terms excludes liability that South African law does not allow us to exclude, including liability for gross negligence, intentional misconduct, or consumer rights that cannot be waived. Drivers remain responsible for their conduct and the transport they provide.</p>
      <p>We may update these terms for legal, safety, or service changes. We will post the current version and effective date and, where required, give notice or seek renewed consent. Continued use after an effective update is subject to applicable law and any required consent.</p>
    </section>

    <section id="complaints" style={sectionStyle}>
      <h2>9. Complaints and governing law</h2>
      <p>Send service complaints to <a href="mailto:buddyride@outlook.com">buddyride@outlook.com</a>, including your trip ID and a description of the issue. We aim to acknowledge complaints within five business days and provide a substantive response as soon as reasonably practicable. These terms are governed by the laws of the Republic of South Africa, subject to mandatory consumer protections and the jurisdiction of competent South African courts.</p>
      <div className="no-print" style={{ marginTop: 12 }}>
        <a href="mailto:buddyride@outlook.com?subject=Complaint%20-%20Trip%20ID%3A%20&body=Hi%20BuddyRide%2C%0A%0AMy%20Trip%20ID%3A%20%0AWhat%20happened%3A%20%0AWhat%20would%20you%20like%20us%20to%20do%3A%20" style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 10, background: '#0066FF', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Lodge a Complaint</a>
      </div>
    </section>

    <p className="no-print"><a href="/privacy">Read the Privacy Policy</a> · <a href="/">Return to BuddyRide</a></p>
  </main>
}