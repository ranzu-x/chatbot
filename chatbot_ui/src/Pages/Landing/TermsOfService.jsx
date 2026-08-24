import "./landing.css";
import { Link } from "react-router";
import { MessageSquare, ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Agreement to Terms",
    content: `These Terms of Service constitute a legally binding agreement between you (whether individually or representing an organization or agency) and Nexa AI Chat governing your access to and use of our SaaS customer communication, AI chatbot, and marketing automation platform.

By creating an account, accessing, or using the platform, you acknowledge that you have read, understood, and agreed to be bound by all of these Terms. If you do not agree, you are prohibited from using the platform.`,
  },
  {
    title: "2. Description of the Service",
    content: `Nexa AI Chat delivers a cloud-based multi-channel communication and automation suite designed for businesses of all sizes, featuring:

• Omnichannel shared team inbox (WhatsApp Business API, Meta Messenger, Instagram Direct, Telegram, Webchat)
• Visual drag-and-drop conversational AI bot builder and flow orchestrator
• Automated broadcast marketing campaigns and scheduled messaging drip sequences
• Contact management, custom tagging, lead qualification, and CRM capabilities
• Multi-tenant agency workspaces and granular Role-Based Access Control (RBAC)`,
  },
  {
    title: "3. User Account Responsibilities",
    content: `To utilize the service, you must register for an account and provide accurate, current, and complete business information. You are responsible for safeguarding your credentials and for all operations executed under your account.

You agree to notify us immediately at support@nexaaichat.com if you suspect unauthorized access or security compromises.`,
  },
  {
    title: "4. Acceptable Use Policy",
    content: `You agree not to use the Service for any prohibited activities, including:

• Transmitting unsolicited commercial spam, unlawful mass marketing, or deceptive solicitations
• Distributing defamatory, abusive, fraudulent, harassing, or illegal content
• Attempting to reverse engineer, decompile, or extract source code from the software
• Circumventing security protocols or scanning system infrastructure without authorization
• Uploading malware, spyware, or malicious code designed to disrupt services
• Impersonating any business, government entity, or individual`,
  },
  {
    title: "5. Meta & WhatsApp Platform Compliance",
    content: `Our service interfaces with Meta Platforms, Inc. and the official WhatsApp Business Cloud API. By using messaging channels:

• You must strictly comply with the WhatsApp Business Messaging Policy and Meta Platform Terms.
• You represent that all message recipients have provided verifiable opt-in consent to receive communications from your organization.
• You acknowledge that Meta enforces message quality ratings and reserves the right to throttle or suspend phone numbers violating policy.
• Nexa AI Chat is not liable for channel suspensions or restrictions imposed directly by Meta due to policy non-compliance.`,
  },
  {
    title: "6. Data Processing & Customer Privacy",
    content: `You act as the Data Controller regarding all customer contact records, leads, and communication data stored on the platform, while Nexa AI Chat operates as a Data Processor.

You warrant that you have obtained all necessary legal consents and notices required to collect customer information and dispatch messages through our platform in compliance with applicable global privacy laws.`,
  },
  {
    title: "7. Subscriptions, Invoicing, and Cancellation",
    content: `Platform access is offered through tiered subscription plans billed in advance on a recurring monthly or annual cycle.

All payments are non-refundable except where explicitly required by law. You may cancel your subscription at any time via the billing portal, which will take effect at the conclusion of the current billing cycle.`,
  },
  {
    title: "8. Proprietary & Intellectual Property Rights",
    content: `The Nexa AI Chat platform, visual flow builder, user interface designs, logos, software architecture, and documentation are the exclusive intellectual property of Nexa AI Chat.

You retain full ownership of your proprietary business data, imported contact lists, custom chatbot prompts, and campaign content.`,
  },
  {
    title: "9. Warranty Disclaimer",
    content: `The service is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express, implied, or statutory. We do not guarantee uninterrupted, error-free operations or specific financial outcomes from automated marketing campaigns.`,
  },
  {
    title: "10. Limitation of Liability",
    content: `To the maximum extent permitted by applicable law, Nexa AI Chat shall not be liable for indirect, incidental, special, consequential, or punitive damages, or loss of profits, data, or operational continuity arising out of your platform use.

Our aggregate liability for any claims under these terms is strictly capped at the total fees paid by you in the twelve (12) months preceding the incident.`,
  },
  {
    title: "11. Suspension & Termination",
    content: `We reserve the right to suspend or terminate your account access immediately, without prior notice, if you breach these Terms of Service, engage in fraudulent behavior, or violate Meta platform policies.`,
  },
  {
    title: "12. Governing Law",
    content: `These Terms shall be governed by and interpreted under applicable laws without regard to conflict of law provisions. Disputes shall be resolved through binding arbitration or competent courts having jurisdiction.`,
  },
  {
    title: "13. Legal Contact",
    content: `For legal notices or questions regarding these Terms of Service, please contact:

Nexa AI Chat Legal Department
Email: support@nexaaichat.com
Website: https://nexaaichat.com`,
  },
];

export default function TermsOfService() {
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
              <Link to="/privacy-policy" className="lp-nav-link" style={{ marginLeft: "12px" }}>
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Header Hero ───────────────────────────────────────── */}
      <section className="lp-legal-hero" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 50%, #4f46e5 100%)" }}>
        <div className="lp-container-narrow">
          <h1 className="lp-legal-hero-title">Terms of Service</h1>
          <p className="lp-legal-hero-subtitle">
            Rules, guidelines, and legal commitments governing the use of the Nexa AI Chat multi-channel platform.
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
                  href={`#terms-${idx}`}
                  className="lp-legal-toc-link"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </div>

          {/* Terms Cards */}
          {sections.map((s, idx) => (
            <div key={idx} id={`terms-${idx}`} className="lp-legal-card">
              <h2 className="lp-legal-card-title">{s.title}</h2>
              <div className="lp-legal-card-body">{s.content}</div>
            </div>
          ))}

          {/* Contact Box */}
          <div className="lp-contact-box" style={{ background: "linear-gradient(135deg, #3730a3 0%, #4f46e5 100%)" }}>
            <h3 className="lp-contact-title">Need Clarification on Our Terms?</h3>
            <p className="lp-contact-subtitle">
              Our legal and support team is ready to answer any questions about our service agreements.
            </p>
            <a href="mailto:support@nexaaichat.com" className="lp-contact-btn">
              Contact Legal Team
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