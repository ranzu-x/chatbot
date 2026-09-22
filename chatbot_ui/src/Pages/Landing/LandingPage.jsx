import { Link } from "react-router";
import {
  MessageSquare, Bot, Users, BarChart3, Shield,
  CheckCircle, ArrowRight, Globe, Clock, Send, Sparkles,
  GitBranch, Play, ChevronDown, Workflow, CalendarClock, Network,
} from "lucide-react";
import { useState, useEffect } from "react";
import { blogAPI } from "../../services/api";
import PlatformIcon from "../../Components/Common/PlatformIcon";

// The channels the platform actually connects to (see routes/channels.js /
// routes/integrations.js) — real, not aspirational, so this list stays the
// single source of truth to update if that ever changes.
const channels = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "TELEGRAM", "TIKTOK", "WEBCHAT"];
const channelLabels = {
  WHATSAPP: "WhatsApp", FACEBOOK: "Messenger", INSTAGRAM: "Instagram",
  TELEGRAM: "Telegram", TIKTOK: "TikTok", WEBCHAT: "Webchat",
};

const features = [
  {
    icon: MessageSquare,
    title: "Omnichannel Shared Inbox",
    description: "Manage every conversation across WhatsApp, Messenger, Instagram, Telegram, TikTok and Webchat from one unified screen, with your whole team collaborating in real time."
  },
  {
    icon: Users,
    title: "CRM & Contact Management",
    description: "Organize customers with custom tags, custom fields, interaction history, and labels — so every follow-up and campaign targets the right audience."
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics & Insights",
    description: "Track message delivery, bot performance, agent response times, and campaign results with visual, exportable reporting dashboards."
  },
  {
    icon: CalendarClock,
    title: "Automated Booking & Reminders",
    description: "Let customers self-book appointments, and never let a lead go cold — automatic follow-up reminders bring your team back to the conversation on time."
  },
  {
    icon: Network,
    title: "White-Label Reseller Program",
    description: "Onboard your own clients under your own brand, with their own isolated workspace, team, and billing — a full sub-account model built in."
  },
  {
    icon: Shield,
    title: "Enterprise Multi-Tenant Security",
    description: "Every workspace is isolated at the database level — role-based permissions, audit-ready access control, and zero cross-tenant visibility, by design."
  },
];

const benefits = [
  "Convert more website and social media visitors into paying customers",
  "Automate the repetitive questions instantly, 24 hours a day",
  "Engage customers on the channels they already use: WhatsApp, Instagram & Messenger",
  "Official Meta & WhatsApp Business Cloud API integration",
  "Empower sales & support agents with a collaborative shared inbox",
  "Scale marketing with scheduled broadcasts, template messages & drip sequences",
];

const stats = [
  { value: "10M+", label: "Messages Delivered" },
  { value: "99.9%", label: "Platform Uptime" },
  { value: "< 1s", label: "Instant AI Response" },
  { value: "6", label: "Channels, One Inbox" },
];

const steps = [
  {
    step: "01",
    icon: Globe,
    title: "Connect Your Channels",
    desc: "Link WhatsApp Business, Facebook, Instagram, Telegram, TikTok, or your own Webchat widget in a couple of clicks."
  },
  {
    step: "02",
    icon: Workflow,
    title: "Build Your AI & Bot Flows",
    desc: "Create custom conversation flows, automated lead funnels, and AI bot responses tailored to your business — no code required."
  },
  {
    step: "03",
    icon: MessageSquare,
    title: "Automate, Sell & Support",
    desc: "Engage customers 24/7, send broadcast marketing campaigns, and let your team jump in whenever a real human is needed."
  },
];

const faqs = [
  {
    q: "Which messaging channels do you support?",
    a: "WhatsApp Business, Facebook Messenger, Instagram DMs, Telegram, TikTok, and your own Webchat widget — all connected to one shared inbox and one set of bot flows, so you build the conversation once and it works everywhere."
  },
  {
    q: "Do I need to know how to code to build a bot?",
    a: "No. The visual, drag-and-drop Flow Builder lets you design conversation flows, conditional logic, and automated replies by connecting nodes on a canvas — the same way you'd sketch a flowchart."
  },
  {
    q: "Can I white-label this and resell it to my own clients?",
    a: "Yes. The built-in Reseller program lets you onboard your own customers under your own brand, each with their own isolated workspace, team, and channel connections — you set the pricing."
  },
  {
    q: "Is my data isolated from other businesses on the platform?",
    a: "Yes. Every workspace is isolated at the database level with no cross-tenant visibility — a design decision enforced on every request, not just in the UI."
  },
  {
    q: "Can my whole team work from one inbox?",
    a: "Yes. Assign conversations, set team roles and permissions, leave internal notes, and track response times — all from a single collaborative shared inbox."
  },
  {
    q: "What happens if a conversation needs a real person?",
    a: "Any bot flow can hand off to a live agent at any point in the conversation, with the full message history already in front of them — nothing gets lost in the handoff."
  },
];

function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <div className="lp-faq-list">
      {faqs.map((item, idx) => {
        const open = openIdx === idx;
        return (
          <div key={item.q} className={`lp-faq-item${open ? ' lp-faq-item--open' : ''}`}>
            <button type="button" className="lp-faq-question" onClick={() => setOpenIdx(open ? -1 : idx)}>
              <span>{item.q}</span>
              <ChevronDown size={18} className="lp-faq-chevron" />
            </button>
            {open && <div className="lp-faq-answer">{item.a}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function LandingPage() {
  const [latestPosts, setLatestPosts] = useState([]);

  useEffect(() => {
    blogAPI.list({ limit: 3, page: 1 })
      .then((r) => setLatestPosts(r.data?.posts || []))
      .catch(() => {});
  }, []);

  return (
    <>
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

          <div className="lp-hero-channels">
            <span className="lp-hero-channels-label">One inbox for:</span>
            {channels.map((c) => (
              <span key={c} className="lp-channel-chip">
                <PlatformIcon platform={c} size={20} style={{ borderRadius: 5 }} />
                {channelLabels[c]}
              </span>
            ))}
          </div>

          {/* Live-inbox style product visual — floating "browser" card with a
              couple of at-a-glance stat badges, giving the hero real visual
              weight without duplicating the three deep-dive sections below. */}
          <div className="lp-hero-visual">
            <div className="lp-hero-float-badge lp-hero-float-badge--top">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              3 agents online
            </div>
            <div className="lp-hero-float-badge lp-hero-float-badge--bottom">
              <Bot size={16} /> AI resolved 128 chats today
            </div>

            <div className="lp-hero-visual-dots"><span /><span /><span /></div>

            <div className="lp-hero-visual-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { name: 'Sarah M.', msg: 'Is this still in stock in blue?', platform: 'INSTAGRAM', time: '2m', unread: true },
                  { name: 'David R.', msg: 'Perfect, thank you for the quick help!', platform: 'WHATSAPP', time: '9m', unread: false },
                  { name: 'Amelia T.', msg: 'Can I reschedule my appointment?', platform: 'WEBCHAT', time: '14m', unread: true },
                ].map((row) => (
                  <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: row.unread ? '#f8fafc' : 'transparent' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {row.name[0]}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.msg}</div>
                    </div>
                    <PlatformIcon platform={row.platform} size={18} style={{ borderRadius: 4, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{row.time}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4338ca' }}>8s</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5' }}>Avg. first response</div>
                </div>
                <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0e7490' }}>73%</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0891b2' }}>Fully resolved by AI</div>
                </div>
              </div>
            </div>
          </div>
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

      {/* ─── Showcase: Visual Flow Builder ─────────────────────── */}
      <section className="lp-showcase-section">
        <div className="lp-container">
          <div className="lp-showcase-grid">
            <div className="lp-showcase-content">
              <span className="lp-showcase-badge" style={{ background: '#eef2ff', color: '#4338ca' }}>
                <Workflow size={15} /> Visual Flow Builder
              </span>
              <h2 className="lp-showcase-title">Design bot conversations by dragging, not coding</h2>
              <p className="lp-showcase-desc">
                Build automated sales funnels, support menus, and lead-qualification flows on a visual
                canvas. Branch on a customer's answer, collect their details, hand off to a human, or
                start a whole new automation — all without writing a line of code.
              </p>
              <div className="lp-showcase-bullets">
                {[
                  'Drag-and-drop nodes: messages, buttons, conditions, delays, and more',
                  'Branch conversations based on what the customer actually says',
                  'Reusable across every channel — build once, run on WhatsApp, Messenger, Instagram & more',
                ].map((b) => (
                  <div key={b} className="lp-showcase-bullet-item">
                    <CheckCircle size={18} style={{ color: '#6366f1', flexShrink: 0, marginTop: 1 }} />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lp-showcase-visual">
              <div className="lp-flow-mock">
                <div className="lp-flow-node" style={{ '--node-color': '#059669' }}>
                  <div className="lp-flow-node-icon"><Play size={13} /></div>
                  <div>New lead clicks your ad<span className="lp-flow-node-sub">Trigger: Start</span></div>
                </div>
                <div className="lp-flow-connector" />
                <div className="lp-flow-node" style={{ '--node-color': '#4f46e5' }}>
                  <div className="lp-flow-node-icon"><MessageSquare size={13} /></div>
                  <div>"Hey! What are you looking for today? 👋"<span className="lp-flow-node-sub">Send Message</span></div>
                </div>
                <div className="lp-flow-connector" />
                <div className="lp-flow-node" style={{ '--node-color': '#d97706' }}>
                  <div className="lp-flow-node-icon"><GitBranch size={13} /></div>
                  <div>Ready to buy?<span className="lp-flow-node-sub">Condition</span></div>
                </div>
                <div className="lp-flow-branch-row">
                  <div className="lp-flow-node" style={{ '--node-color': '#0284c7' }}>
                    <div className="lp-flow-node-icon"><Send size={13} /></div>
                    <div>Send Pricing<span className="lp-flow-node-sub">Yes</span></div>
                  </div>
                  <div className="lp-flow-node" style={{ '--node-color': '#7c3aed' }}>
                    <div className="lp-flow-node-icon"><CalendarClock size={13} /></div>
                    <div>Book a Call<span className="lp-flow-node-sub">Not yet</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Showcase: Broadcasting ─────────────────────────────── */}
      <section className="lp-showcase-section" style={{ background: '#f8fafc' }}>
        <div className="lp-container">
          <div className="lp-showcase-grid lp-showcase-grid--reverse">
            <div className="lp-showcase-content">
              <span className="lp-showcase-badge" style={{ background: '#ecfeff', color: '#0e7490' }}>
                <Send size={15} /> Broadcasting & Sequences
              </span>
              <h2 className="lp-showcase-title">Reach thousands with one Meta-approved message</h2>
              <p className="lp-showcase-desc">
                Send high-converting WhatsApp marketing broadcasts and automated drip sequences using
                approved templates — then watch delivery, read, and click rates roll in on the same screen.
              </p>
              <div className="lp-showcase-bullets">
                {[
                  'Schedule one-off campaigns or multi-step drip Sequences',
                  'Delivery, read, click, and reply rates tracked in real time',
                  'Segment your audience with labels and custom fields before you send',
                ].map((b) => (
                  <div key={b} className="lp-showcase-bullet-item">
                    <CheckCircle size={18} style={{ color: '#06b6d4', flexShrink: 0, marginTop: 1 }} />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lp-showcase-visual">
              <div className="lp-broadcast-mock">
                <div className="lp-broadcast-mock-header">
                  <PlatformIcon platform="WHATSAPP" size={30} style={{ borderRadius: 8 }} />
                  <div>
                    <div className="lp-broadcast-mock-title">Black Friday Flash Sale</div>
                    <div className="lp-broadcast-mock-sub">Sent to 12,480 contacts</div>
                  </div>
                </div>
                <div className="lp-broadcast-mock-bubble">
                  <strong>🎉 Flash Sale — 50% OFF everything!</strong>
                  Today only. Tap below to shop before it's gone.
                </div>
                <div className="lp-broadcast-stats">
                  {[
                    { label: 'Delivered', pct: 98 },
                    { label: 'Read', pct: 91 },
                    { label: 'Clicked', pct: 47 },
                    { label: 'Replied', pct: 22 },
                  ].map((row) => (
                    <div key={row.label} className="lp-broadcast-stat-row">
                      <span>{row.label}</span>
                      <div className="lp-broadcast-stat-track">
                        <div className="lp-broadcast-stat-fill" style={{ width: `${row.pct}%` }} />
                      </div>
                      <span className="lp-broadcast-stat-val">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Showcase: AI Chatbots ──────────────────────────────── */}
      <section className="lp-showcase-section">
        <div className="lp-container">
          <div className="lp-showcase-grid">
            <div className="lp-showcase-content">
              <span className="lp-showcase-badge" style={{ background: '#fdf4ff', color: '#a21caf' }}>
                <Bot size={15} /> AI-Powered Chatbots
              </span>
              <h2 className="lp-showcase-title">A bot that answers like your best support agent</h2>
              <p className="lp-showcase-desc">
                Deploy intelligent AI bots that qualify leads, answer FAQs, handle support questions, and
                close sales — instantly, in your brand voice, around the clock.
              </p>
              <div className="lp-showcase-bullets">
                {[
                  'Instant, always-on replies — no more waiting for business hours',
                  'Understands free-text questions, not just button taps',
                  'Hands off to a live agent the moment a conversation needs a human',
                ].map((b) => (
                  <div key={b} className="lp-showcase-bullet-item">
                    <CheckCircle size={18} style={{ color: '#a21caf', flexShrink: 0, marginTop: 1 }} />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lp-showcase-visual">
              <div className="lp-phone-mock">
                <div className="lp-phone-mock-notch" />
                <div className="lp-phone-mock-screen">
                  <div className="lp-phone-mock-header">
                    <PlatformIcon platform="WEBCHAT" size={26} style={{ borderRadius: 6 }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Support</div>
                    <span className="lp-phone-mock-ai-badge"><Sparkles size={11} /> AI</span>
                  </div>
                  <div className="lp-chat-bubble lp-chat-bubble--out">Do you ship to Canada? 🇨🇦</div>
                  <div className="lp-chat-bubble lp-chat-bubble--in">
                    Yes! We ship worldwide 🌍 Orders over $50 ship free. Want me to check delivery time to your city?
                  </div>
                  <div className="lp-chat-qr-row">
                    <span className="lp-chat-qr-chip">Yes please</span>
                    <span className="lp-chat-qr-chip">No thanks</span>
                  </div>
                  <div className="lp-chat-typing"><span /><span /><span /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features Grid ─────────────────────────────────────── */}
      <section id="features" className="lp-section" style={{ background: '#f8fafc' }}>
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">...And Everything Else You Need</span>
            <h2 className="lp-section-title">
              Built for Businesses That Want to <span className="lp-gradient-text">Grow Faster</span>
            </h2>
            <p className="lp-section-desc">
              From lead capture and team collaboration to reselling the whole platform under your own brand.
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
      <section id="how-it-works" className="lp-section">
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

      {/* ─── FAQ ─────────────────────────────────────────────── */}
      <section id="faq" className="lp-section" style={{ background: '#f8fafc' }}>
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">Frequently Asked Questions</span>
            <h2 className="lp-section-title">Everything You're Wondering, Answered</h2>
          </div>
          <FaqAccordion />
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
    </>
  );
}
