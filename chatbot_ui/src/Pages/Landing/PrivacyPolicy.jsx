import "./landing.css";
import { Link } from "react-router";
import { MessageSquare, ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Introduction",
    content: `Welcome to Nexa AI Chat ("we," "our," or "us"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI chatbot, customer communication, and marketing automation platform (the "Service").

We are committed to protecting the privacy of our business clients, their team members, and their end customers. If you have any questions or concerns regarding this policy, please contact us at support@nexaaichat.com.

By accessing or using our Service, you agree to the collection, processing, and handling of information in accordance with this Privacy Policy.`,
  },
  {
    title: "2. Information We Collect",
    content: `We collect several categories of information to provide and improve our Service:

• Account & Business Details: Name, email address, company name, phone number, billing information, and account credentials provided during registration.
• Customer & Contact Data: Contacts, leads, subscriber lists, phone numbers, custom tags, and conversation notes imported or managed by your business on the platform.
• Messaging & Meta Platform Data: When you connect WhatsApp Business API, Facebook Messenger, Instagram, or Webchat channels, we process inbound and outbound message content, recipient phone numbers, user IDs, message delivery timestamps, and interaction history.
• Usage & Technical Analytics: Log files, IP addresses, browser types, device information, operating systems, and page interaction data automatically gathered during platform usage.`,
  },
  {
    title: "3. How We Use Your Information",
    content: `We process collected information for the following business purposes:

• Delivering and maintaining the Nexa AI Chat platform and AI chatbot features
• Processing and orchestrating multi-channel messages via WhatsApp, Messenger, Instagram, Telegram, and Webchat
• Executing automated chatbot conversation flows, broadcast campaigns, and drip sequences configured by you
• Providing analytics, delivery reporting, and performance insights for your customer support and marketing teams
• Enhancing platform security, preventing fraud, spam, and unauthorized API access
• Delivering technical support, critical operational notifications, and billing updates
• Ensuring adherence to Meta Platform Terms and global data protection standards`,
  },
  {
    title: "4. Data Sharing & Third-Party Infrastructure",
    content: `We do NOT sell, rent, or monetize your customer data or communication logs. Information is shared only with:

• Service Infrastructure Partners: Vetted cloud hosting providers, database services, and email delivery platforms operating under binding confidentiality and security agreements.
• Meta Platforms & Messaging Networks: Communication data (messages, phone numbers, delivery statuses) is transmitted across Meta's infrastructure to execute WhatsApp Business and Messenger API operations.
• Legal Authorities: When required by applicable law, court order, subpoena, or regulatory mandate.
• Business Transactions: In connection with any merger, acquisition, financing, or sale of company assets, with continued privacy protections.`,
  },
  {
    title: "5. WhatsApp & Meta Platform Compliance",
    content: `Nexa AI Chat connects directly with the WhatsApp Business Cloud API and Meta developer ecosystem:

• We enforce strict compliance with Meta Developer Policies, WhatsApp Business Messaging Policies, and commercial guidelines.
• Customers must ensure all outreach and marketing campaigns are sent exclusively to recipients who have provided documented opt-in consent.
• Outbound broadcast templates are validated and approved through Meta's official template submission procedures.
• We do not repurpose your proprietary customer messages or conversation logs for third-party advertising.`,
  },
  {
    title: "6. Data Retention & Erasure",
    content: `We retain personal and messaging data only for as long as your account remains active or as required to deliver our services and maintain regulatory compliance.

Upon account cancellation or receipt of a formal data deletion request, all associated customer records, contact lists, and message archives will be permanently deleted or anonymized within 90 days.`,
  },
  {
    title: "7. Security & Encryption Standards",
    content: `We implement enterprise-grade security protocols to protect your data against unauthorized access, loss, or alteration:

• HTTPS/TLS 1.3 encryption for all data in transit across public networks
• Encrypted database storage and secure credential vaulting for API tokens and passwords
• Role-Based Access Control (RBAC) enabling multi-user agency and workspace separation
• Salted cryptographic password hashing and JSON Web Token (JWT) session security
• Continuous system monitoring, DDoS mitigation, and vulnerability assessments`,
  },
  {
    title: "8. User & Data Subject Rights",
    content: `Depending on your location (including rights under GDPR, CCPA, and international privacy frameworks), you have the right to:

• Access & Portability: Request a copy of the personal information stored in your account.
• Correction: Update or rectify inaccurate or incomplete data records.
• Erasure: Request permanent deletion of your data and customer contact archives.
• Restrict Processing: Object to or limit specific automated data processing activities.

To submit a data request, please email support@nexaaichat.com.`,
  },
  {
    title: "9. Cookies & Tracking Technologies",
    content: `We use essential session cookies and local storage tokens strictly to maintain authenticated user sessions and interface preferences. We do not use third-party behavioral advertising trackers.`,
  },
  {
    title: "10. Children's Privacy",
    content: `Nexa AI Chat is a business-to-business (B2B) platform and is not intended for use by individuals under the age of 16. We do not knowingly collect personal data from minors.`,
  },
  {
    title: "11. Updates to This Policy",
    content: `We may revise this Privacy Policy periodically to reflect service enhancements or legislative changes. Material changes will be highlighted by updating the "Last Updated" date atop this page. Continued platform usage indicates acceptance of the revised terms.`,
  },
  {
    title: "12. Contact Information",
    content: `If you have questions, feedback, or regulatory inquiries regarding our privacy practices, please contact us:

Nexa AI Chat Privacy Team
Email: support@nexaaichat.com
Website: https://nexaaichat.com`,
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="lp-wrapper">
      {/* ─── Navbar ────────────────────────────────────────────── */}
      <nav className="lp-navbar">
        <div className="lp-container">
          <div className="lp-nav-inner">
            <Link to="/" className="lp-logo">
              <div className="lp-logo-icon">
                <MessageSquare size={20} />
              </div>
              <span>Nexa AI Chat</span>
            </Link>

            <div className="lp-nav-actions">
              <Link to="/" className="lp-btn-secondary" style={{ gap: "6px" }}>
                <ArrowLeft size={16} /> Back to Home
              </Link>
              <Link to="/terms-of-service" className="lp-nav-link" style={{ marginLeft: "12px" }}>
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Header Hero ───────────────────────────────────────── */}
      <section className="lp-legal-hero">
        <div className="lp-container-narrow">
          <h1 className="lp-legal-hero-title">Privacy Policy</h1>
          <p className="lp-legal-hero-subtitle">
            How Nexa AI Chat collects, processes, and protects your information across our multi-channel AI chatbot platform.
          </p>
          <div className="lp-legal-updated">Last Updated: August 25, 2025</div>
        </div>
      </section>

      {/* ─── Legal Content ─────────────────────────────────────── */}
      <section className="lp-legal-content">
        <div className="lp-container-narrow">
          {/* Table of Contents */}
          <div className="lp-legal-toc">
            <div className="lp-legal-toc-title">Table of Contents</div>
            <div className="lp-legal-toc-grid">
              {sections.map((s, idx) => (
                <a
                  key={idx}
                  href={`#sec-${idx}`}
                  className="lp-legal-toc-link"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </div>

          {/* Policy Cards */}
          {sections.map((s, idx) => (
            <div key={idx} id={`sec-${idx}`} className="lp-legal-card">
              <h2 className="lp-legal-card-title">{s.title}</h2>
              <div className="lp-legal-card-body">{s.content}</div>
            </div>
          ))}

          {/* Contact Box */}
          <div className="lp-contact-box">
            <h3 className="lp-contact-title">Have Privacy or Compliance Questions?</h3>
            <p className="lp-contact-subtitle">
              Our dedicated compliance team is available to assist you with data requests and security verification.
            </p>
            <a href="mailto:support@nexaaichat.com" className="lp-contact-btn">
              Contact Privacy Team
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <Link to="/" className="lp-footer-logo">
              <div className="lp-logo-icon" style={{ width: 32, height: 32 }}>
                <MessageSquare size={16} />
              </div>
              <span>Nexa AI Chat</span>
            </Link>

            <div className="lp-footer-links">
              <Link to="/" className="lp-footer-link">Home</Link>
              <Link to="/privacy-policy" className="lp-footer-link">Privacy Policy</Link>
              <Link to="/terms-of-service" className="lp-footer-link">Terms of Service</Link>
              <Link to="/login" className="lp-footer-link">Sign In</Link>
            </div>
          </div>

          <div className="lp-footer-bottom">
            &copy; {new Date().getFullYear()} Nexa AI Chat. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}