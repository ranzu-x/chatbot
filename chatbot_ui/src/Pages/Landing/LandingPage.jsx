import "./landing.css";
import "./blog.css";
import { Link } from "react-router";
import {
  MessageSquare, Bot, Users, Zap, BarChart3, Shield,
  CheckCircle, ArrowRight, Globe, Clock, Layers, Send, Menu, X, Sparkles, LayoutDashboard
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../../Provider/AuthContext";
import { blogAPI } from "../../services/api";

const features = [
  { 
    icon: Bot, 
    title: "AI-Powered Smart Chatbots", 
    description: "Deploy intelligent AI bots that qualify leads, answer FAQs, handle support tickets, and close sales 24/7." 
  },
  { 
    icon: MessageSquare, 
    title: "Omnichannel Shared Inbox", 
    description: "Manage conversations across WhatsApp, Facebook Messenger, Instagram, Telegram, and Webchat from one unified screen." 
  },
  { 
    icon: Layers, 
    title: "Visual Drag & Drop Flow Builder", 
    description: "Design automated sales funnels, interactive menus, and support workflows without writing a single line of code." 
  },
  { 
    icon: Send, 
    title: "Broadcast Campaigns & Sequences", 
    description: "Send high-converting WhatsApp marketing broadcasts and automated drip sequences with Meta-approved templates." 
  },
  { 
    icon: Users, 
    title: "CRM & Contact Management", 
    description: "Organize customers with custom tags, attributes, interaction history, and lead scoring for targeted outreach." 
  },
  { 
    icon: BarChart3, 
    title: "Real-Time Analytics & Insights", 
    description: "Track message delivery, open rates, bot performance, and team response times with visual reporting dashboards." 
  },
  { 
    icon: Clock, 
    title: "Automated Booking & Reminders", 
    description: "Schedule consultations, appointments, orders, and send instant WhatsApp confirmations and reminders automatically." 
  },
  { 
    icon: Shield, 
    title: "Enterprise Multi-Tenant Security", 
    description: "Built for businesses & marketing agencies with multi-workspace support, team role permissions (RBAC), and SSL security." 
  },
];

const benefits = [
  "Convert 3x more website and social media visitors into paying customers",
  "Automate up to 80% of repetitive customer support inquiries instantly",
  "Engage customers on their favorite channels: WhatsApp, Instagram & Messenger",
  "Official Meta & WhatsApp Business Cloud API integration",
  "Empower sales & support agents with a collaborative shared inbox",
  "Scale marketing with scheduled broadcasts, template messages & drip campaigns",
];

const stats = [
  { value: "10M+", label: "Messages Delivered" },
  { value: "99.9%", label: "Platform Uptime" },
  { value: "< 1s", label: "Instant AI Response" },
  { value: "5x", label: "Average Lead Conversion Boost" },
];

const steps = [
  { 
    step: "01", 
    icon: Globe, 
    title: "Connect Your Channels", 
    desc: "Link WhatsApp Business, Facebook, Instagram, Telegram, or Webchat in a couple of clicks." 
  },
  { 
    step: "02", 
    icon: Layers, 
    title: "Build Your AI & Bot Flows", 
    desc: "Create custom conversation flows, automated lead funnels, and AI bot responses tailored to your business." 
  },
  { 
    step: "03", 
    icon: MessageSquare, 
    title: "Automate, Sell & Support", 
    desc: "Engage customers 24/7, send broadcast marketing campaigns, and let your team jump in whenever needed." 
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [latestPosts, setLatestPosts] = useState([]);

  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : '/agency';

  useEffect(() => {
    blogAPI.list({ limit: 3, page: 1 })
      .then((r) => setLatestPosts(r.data?.posts || []))
      .catch(() => {});
  }, []);

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

            <div className="lp-nav-links">
              <a href="#features" className="lp-nav-link">Features</a>
              <a href="#benefits" className="lp-nav-link">Benefits</a>
              <a href="#how-it-works" className="lp-nav-link">How It Works</a>
              <Link to="/blog" className="lp-nav-link">Blog</Link>
              <Link to="/privacy-policy" className="lp-nav-link">Privacy Policy</Link>
              <Link to="/terms-of-service" className="lp-nav-link">Terms</Link>
            </div>

            <div className="lp-nav-actions">
              {user ? (
                <Link to={dashboardPath} className="lp-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <LayoutDashboard size={16} /> Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="lp-btn-login">Sign In</Link>
                  <Link to="/register" className="lp-btn-primary">
                    Get Started Free <ArrowRight size={16} />
                  </Link>
                </>
              )}
            </div>

            <button
              className="lp-mobile-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="lp-mobile-menu">
            <a href="#features" className="lp-nav-link" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#benefits" className="lp-nav-link" onClick={() => setMenuOpen(false)}>Benefits</a>
            <a href="#how-it-works" className="lp-nav-link" onClick={() => setMenuOpen(false)}>How It Works</a>
            <Link to="/blog" className="lp-nav-link" onClick={() => setMenuOpen(false)}>Blog</Link>
            <Link to="/privacy-policy" className="lp-nav-link" onClick={() => setMenuOpen(false)}>Privacy Policy</Link>
            <Link to="/terms-of-service" className="lp-nav-link" onClick={() => setMenuOpen(false)}>Terms of Service</Link>
            {user ? (
              <div style={{ marginTop: "8px" }}>
                <Link to={dashboardPath} className="lp-btn-primary" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }} onClick={() => setMenuOpen(false)}>
                  <LayoutDashboard size={16} /> Dashboard
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <Link to="/login" className="lp-btn-login" style={{ flex: 1, textAlign: "center" }} onClick={() => setMenuOpen(false)}>Sign In</Link>
                <Link to="/register" className="lp-btn-primary" style={{ flex: 1, textAlign: "center" }} onClick={() => setMenuOpen(false)}>Get Started</Link>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ─── Hero Section ──────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-container">
          <div className="lp-badge">
            <Sparkles size={14} />
            <span>AI Chatbot & WhatsApp Business Platform for Every Business</span>
          </div>

          <h1 className="lp-hero-title">
            Automate Customer Conversations, <br />
            <span className="lp-gradient-text">Scale Sales & Support with AI</span>
          </h1>

          <p className="lp-hero-desc">
            Nexa AI Chat empowers businesses, agencies, and e-commerce brands to capture leads, 
            automate customer support, and run high-converting WhatsApp marketing campaigns on autopilot.
          </p>

          <div className="lp-hero-buttons">
            <Link to="/register" className="lp-btn-primary" style={{ padding: "14px 28px", fontSize: "1.05rem" }}>
              Start Free Trial <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="lp-btn-secondary" style={{ padding: "14px 28px", fontSize: "1.05rem" }}>
              Sign In to Dashboard
            </Link>
          </div>

          <p className="lp-hero-subtext">
            No credit card required · Free setup · Meta WhatsApp Cloud API partner ready
          </p>
        </div>
      </section>

      {/* ─── Stats Banner ──────────────────────────────────────── */}
      <section className="lp-stats-section">
        <div className="lp-container">
          <div className="lp-stats-grid">
            {stats.map((s, idx) => (
              <div key={idx}>
                <div className="lp-stat-val">{s.value}</div>
                <div className="lp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Grid ─────────────────────────────────────── */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">Powerful Capabilities</span>
            <h2 className="lp-section-title">
              Everything Your Business Needs to <span className="lp-gradient-text">Grow Faster</span>
            </h2>
            <p className="lp-section-desc">
              From lead capture and automated visual flows to broadcast campaigns and team collaboration — all in one place.
            </p>
          </div>

          <div className="lp-features-grid">
            {features.map((f, idx) => {
              const IconComp = f.icon;
              return (
                <div key={idx} className="lp-feature-card">
                  <div className="lp-feature-icon-wrap">
                    <IconComp size={24} />
                  </div>
                  <h3 className="lp-feature-card-title">{f.title}</h3>
                  <p className="lp-feature-card-desc">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Benefits Section ──────────────────────────────────── */}
      <section id="benefits" className="lp-benefits-section">
        <div className="lp-container">
          <div className="lp-benefits-grid">
            <div className="lp-benefits-content">
              <h2>Why Leading Businesses & Agencies Choose Nexa AI Chat</h2>
              <p>
                Whether you run an e-commerce brand, a local service agency, a SaaS startup, or an enterprise team, 
                Nexa AI Chat helps you turn every conversation into revenue.
              </p>
              <Link to="/register" className="lp-btn-secondary" style={{ color: "#4f46e5", fontWeight: 700 }}>
                Get Started Today <ArrowRight size={16} />
              </Link>
            </div>

            <div className="lp-benefits-list">
              {benefits.map((b, idx) => (
                <div key={idx} className="lp-benefit-item">
                  <CheckCircle size={22} className="lp-benefit-check" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── How It Works ──────────────────────────────────────── */}
      <section id="how-it-works" className="lp-section" style={{ background: "#f8fafc" }}>
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">How It Works</span>
            <h2 className="lp-section-title">Launch Your Smart Chatbot in 3 Steps</h2>
            <p className="lp-section-desc">Connect your channels, design your conversations, and start engaging customers in minutes.</p>
          </div>

          <div className="lp-steps-grid">
            {steps.map((s, idx) => {
              const IconComp = s.icon;
              return (
                <div key={idx} className="lp-step-card">
                  <div className="lp-step-number">{s.step}</div>
                  <div className="lp-step-icon">
                    <IconComp size={26} />
                  </div>
                  <h3 className="lp-step-title">{s.title}</h3>
                  <p className="lp-step-desc">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Blog Preview Section ────────────────────────────── */}
      {latestPosts.length > 0 && (
        <section className="lp-blog-preview">
          <div className="lp-container">
            <div className="lp-section-header">
              <span className="lp-section-tag">Knowledge Hub</span>
              <h2 className="lp-section-title">
                Latest from <span className="lp-gradient-text">Our Blog</span>
              </h2>
              <p className="lp-section-desc">
                Guides, tutorials, and industry insights to help you grow with AI-powered conversational marketing.
              </p>
            </div>
            <div className="lp-blog-preview-grid">
              {latestPosts.map((post) => (
                <Link key={post.id} to={`/blog/${post.slug}`} className="lp-blog-mini-card">
                  <div className="lp-blog-mini-card__img">
                    {post.cover_image
                      ? <img src={post.cover_image} alt={post.title} />
                      : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #e2e8f0, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}><MessageSquare size={28} /></div>
                    }
                  </div>
                  <div className="lp-blog-mini-card__body">
                    <div className="lp-blog-mini-card__cat">{post.category}</div>
                    <div className="lp-blog-mini-card__title">{post.title}</div>
                    <div className="lp-blog-mini-card__meta">
                      <Clock size={12} /> {post.read_time || 1} min read
                      <span>·</span>
                      <span>{new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <Link to="/blog" className="lp-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', fontWeight: 700 }}>
                View All Articles <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── CTA Box ───────────────────────────────────────────── */}
      <section className="lp-cta-section">
        <div className="lp-container">
          <div className="lp-cta-box">
            <h2 className="lp-cta-title">Ready to Put Your Customer Conversations on Autopilot?</h2>
            <p className="lp-cta-desc">
              Start building intelligent bots, managing omnichannel inboxes, and launching WhatsApp campaigns in minutes.
            </p>
            <Link to="/register" className="lp-btn-primary" style={{ padding: "14px 32px", fontSize: "1.05rem" }}>
              Get Started for Free <ArrowRight size={18} />
            </Link>
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
              <a href="#features" className="lp-footer-link">Features</a>
              <a href="#benefits" className="lp-footer-link">Benefits</a>
              <Link to="/blog" className="lp-footer-link">Blog</Link>
              <Link to="/privacy-policy" className="lp-footer-link">Privacy Policy</Link>
              <Link to="/terms-of-service" className="lp-footer-link">Terms of Service</Link>
              {user ? (
                <Link to={dashboardPath} className="lp-footer-link">Dashboard</Link>
              ) : (
                <Link to="/login" className="lp-footer-link">Sign In</Link>
              )}
            </div>
          </div>

          <div className="lp-footer-bottom">
            &copy; {new Date().getFullYear()} Nexa AI Chat. All rights reserved. Omnichannel AI Chatbot & Marketing Platform for Modern Businesses.
          </div>
        </div>
      </footer>
    </div>
  );
}