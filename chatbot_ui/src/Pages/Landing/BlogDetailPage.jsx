import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router';
import { useAuth } from '../../Provider/AuthContext';
import { blogAPI } from '../../services/api';
import { MessageSquare, Clock, Eye, ArrowLeft, ArrowRight, Share2, Twitter, Linkedin, Link2, ChevronDown, ChevronUp, LayoutDashboard } from 'lucide-react';
import './landing.css';
import './blog.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function formatDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Table of Contents ─────────────────────────────────────────────────────────
function TableOfContents({ content }) {
  const [headings, setHeadings] = useState([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    if (!content) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const hEls = doc.querySelectorAll('h1, h2, h3');
    const list = [];
    hEls.forEach((el, idx) => {
      const id = `heading-${idx}`;
      el.id = id;
      list.push({ id, text: el.textContent, level: parseInt(el.tagName[1]) });
    });
    setHeadings(list);
  }, [content]);

  if (headings.length < 2) return null;

  return (
    <nav className="blog-toc">
      <h4 className="blog-toc__title">📋 Table of Contents</h4>
      <ul className="blog-toc__list">
        {headings.map((h) => (
          <li key={h.id} className={`blog-toc__item blog-toc__item--h${h.level} ${active === h.id ? 'blog-toc__item--active' : ''}`}>
            <a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); setActive(h.id); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── FAQ Accordion ─────────────────────────────────────────────────────────────
function FaqSection({ faqs }) {
  const [open, setOpen] = useState(null);
  if (!faqs?.length) return null;
  return (
    <section className="blog-faq">
      <h2 className="blog-faq__title">❓ Frequently Asked Questions</h2>
      <div className="blog-faq__list">
        {faqs.map((faq, idx) => (
          <div key={idx} className={`blog-faq__item ${open === idx ? 'blog-faq__item--open' : ''}`}>
            <button className="blog-faq__question" onClick={() => setOpen(open === idx ? null : idx)}>
              <span>{faq.question}</span>
              {open === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open === idx && <div className="blog-faq__answer">{faq.answer}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Social Share ──────────────────────────────────────────────────────────────
function ShareBar({ title, url }) {
  const [copied, setCopied] = useState(false);
  const share = (platform) => {
    const encUrl = encodeURIComponent(url);
    const encTitle = encodeURIComponent(title);
    const links = {
      twitter: `https://twitter.com/intent/tweet?text=${encTitle}&url=${encUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}`,
      whatsapp: `https://wa.me/?text=${encTitle}%20${encUrl}`,
    };
    window.open(links[platform], '_blank', 'noopener');
  };
  const copyLink = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="blog-share">
      <span className="blog-share__label"><Share2 size={14} /> Share:</span>
      <button className="blog-share__btn blog-share__btn--twitter" onClick={() => share('twitter')} title="Share on Twitter"><Twitter size={15} /></button>
      <button className="blog-share__btn blog-share__btn--linkedin" onClick={() => share('linkedin')} title="Share on LinkedIn"><Linkedin size={15} /></button>
      <button className="blog-share__btn blog-share__btn--whatsapp" onClick={() => share('whatsapp')} title="Share on WhatsApp">💬</button>
      <button className="blog-share__btn" onClick={copyLink} title="Copy link"><Link2 size={15} /> {copied ? 'Copied!' : ''}</button>
    </div>
  );
}

// ── Related Posts ──────────────────────────────────────────────────────────────
function RelatedPosts({ posts }) {
  if (!posts?.length) return null;
  return (
    <section className="blog-related">
      <h3 className="blog-related__title">More Articles You Might Like</h3>
      <div className="blog-related__grid">
        {posts.map((p) => (
          <Link key={p.id} to={`/blog/${p.slug}`} className="blog-related__card">
            {p.cover_image && <img src={p.cover_image} alt={p.title} className="blog-related__img" />}
            <div className="blog-related__body">
              <span className="blog-card__category" style={{ marginBottom: 6, display: 'inline-block' }}>{p.category}</span>
              <h4 className="blog-related__card-title">{p.title}</h4>
              <span className="blog-related__meta"><Clock size={12} /> {p.read_time || 1} min read</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── SEO Head injection ────────────────────────────────────────────────────────
function useSEO(post) {
  useEffect(() => {
    if (!post) return;
    const prev = { title: document.title };
    document.title = post.meta_title || post.title;

    const setMeta = (name, content, prop = false) => {
      const attr = prop ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); el._blog = true; }
      el.setAttribute('content', content || '');
    };

    setMeta('description', post.meta_description || post.excerpt);
    setMeta('og:title', post.meta_title || post.title, true);
    setMeta('og:description', post.meta_description || post.excerpt, true);
    setMeta('og:image', post.og_image || post.cover_image, true);
    setMeta('og:type', 'article', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', post.meta_title || post.title);
    setMeta('twitter:description', post.meta_description || post.excerpt);
    setMeta('twitter:image', post.og_image || post.cover_image);

    // JSON-LD Article schema
    let ldScript = document.getElementById('blog-jsonld');
    if (!ldScript) { ldScript = document.createElement('script'); ldScript.id = 'blog-jsonld'; ldScript.type = 'application/ld+json'; document.head.appendChild(ldScript); }
    const faqs = (() => { try { return JSON.parse(post.faqs || '[]'); } catch { return []; } })();
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.excerpt,
        image: post.cover_image,
        author: { '@type': 'Person', name: post.author_name },
        datePublished: post.published_at,
        dateModified: post.updated_at,
      },
    ];
    if (faqs.length) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
      });
    }
    ldScript.textContent = JSON.stringify(schemas);

    return () => {
      document.title = prev.title;
      document.querySelectorAll('meta[data-blog]').forEach((el) => el.remove());
      ldScript?.remove();
    };
  }, [post]);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BlogDetailPage() {
  const { user } = useAuth();
  const { slug } = useParams();
  const [post, setPost]       = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const contentRef = useRef(null);

  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : '/agency';

  useSEO(post);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    blogAPI.getBySlug(slug)
      .then((res) => {
        setPost(res.data.post);
        setRelated(res.data.related || []);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Inject heading IDs into rendered content for TOC
  useEffect(() => {
    if (!contentRef.current || !post) return;
    const headings = contentRef.current.querySelectorAll('h1, h2, h3');
    headings.forEach((el, idx) => { el.id = `heading-${idx}`; });
  }, [post]);

  const pageUrl = window.location.href;
  const tags    = (() => { try { return JSON.parse(post?.tags || '[]'); } catch { return []; } })();
  const faqs    = (() => { try { return JSON.parse(post?.faqs || '[]'); } catch { return []; } })();

  return (
    <div className="lp-wrapper">
      {/* ── Navbar ─────────────────────────────────────── */}
      <nav className="lp-navbar">
        <div className="lp-container">
          <div className="lp-nav-inner">
            <Link to="/" className="lp-logo">
              <div className="lp-logo-icon"><MessageSquare size={20} /></div>
              <span>Nexa AI Chat</span>
            </Link>
            <div className="lp-nav-links">
              <Link to="/" className="lp-nav-link">Home</Link>
              <Link to="/blog" className="lp-nav-link">Blog</Link>
            </div>
            <div className="lp-nav-actions">
              {user ? (
                <Link to={dashboardPath} className="lp-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <LayoutDashboard size={16} /> Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="lp-btn-login">Sign In</Link>
                  <Link to="/register" className="lp-btn-primary">Get Started <ArrowRight size={16} /></Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {loading && <div className="blog-loading" style={{ minHeight: '60vh' }}><div className="lp-spinner" /></div>}

      {notFound && (
        <div className="blog-empty" style={{ minHeight: '60vh' }}>
          <h2>Post Not Found</h2>
          <p>This post may have been moved or deleted.</p>
          <Link to="/blog" className="lp-btn-primary">← Back to Blog</Link>
        </div>
      )}

      {!loading && !notFound && post && (
        <>
          {/* ── Cover ─────────────────────────────────────── */}
          {post.cover_image && (
            <div className="blog-detail__cover">
              <img src={post.cover_image} alt={post.title} />
              <div className="blog-detail__cover-overlay" />
            </div>
          )}

          <div className="lp-container">
            <div className="blog-detail__layout">

              {/* ── Main content ────────────────────────── */}
              <article className="blog-detail__main">
                {/* Breadcrumb */}
                <div className="blog-detail__breadcrumb">
                  <Link to="/blog"><ArrowLeft size={14} /> Blog</Link>
                  <span> / </span>
                  <span>{post.category}</span>
                </div>

                {/* Category + title */}
                <span className="blog-card__category" style={{ marginBottom: 16, display: 'inline-block' }}>{post.category}</span>
                <h1 className="blog-detail__title">{post.title}</h1>

                {/* Meta row */}
                <div className="blog-detail__meta">
                  <div className="blog-detail__author">
                    {post.author_avatar
                      ? <img src={post.author_avatar} alt={post.author_name} className="blog-detail__avatar" />
                      : <div className="blog-detail__avatar-placeholder">{(post.author_name || 'A')[0]}</div>
                    }
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{post.author_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-muted)' }}>{formatDate(post.published_at)}</div>
                    </div>
                  </div>
                  <div className="blog-detail__stats">
                    <span><Clock size={14} /> {post.read_time || 1} min read</span>
                    <span><Eye size={14} /> {(post.views || 0).toLocaleString()} views</span>
                  </div>
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
                    {tags.map((tag) => <span key={tag} className="blog-tag">{tag}</span>)}
                  </div>
                )}

                {/* Share bar (top) */}
                <ShareBar title={post.title} url={pageUrl} />

                {/* Post content */}
                <div
                  ref={contentRef}
                  className="blog-detail__content"
                  dangerouslySetInnerHTML={{ __html: post.content || '' }}
                />

                {/* Share bar (bottom) */}
                <ShareBar title={post.title} url={pageUrl} />

                {/* FAQ */}
                <FaqSection faqs={faqs} />

                {/* Related posts */}
                <RelatedPosts posts={related} />

                {/* CTA */}
                <div className="blog-detail__cta">
                  <h3>Ready to automate your customer conversations?</h3>
                  <p>Try Nexa AI Chat free — no credit card required.</p>
                  <Link to="/register" className="lp-btn-primary">Get Started Free <ArrowRight size={16} /></Link>
                </div>
              </article>

              {/* ── Sidebar ──────────────────────────────── */}
              <aside className="blog-detail__sidebar">
                <TableOfContents content={post.content} />

                {/* Author card */}
                <div className="blog-detail__author-card">
                  {post.author_avatar
                    ? <img src={post.author_avatar} alt={post.author_name} className="blog-detail__author-card-avatar" />
                    : <div className="blog-detail__avatar-placeholder" style={{ width: 64, height: 64, fontSize: '1.5rem', margin: '0 auto 10px' }}>{(post.author_name || 'A')[0]}</div>
                  }
                  <div className="blog-detail__author-card-name">{post.author_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-muted)', textAlign: 'center' }}>Published {formatDate(post.published_at)}</div>
                </div>

                {/* CTA sidebar */}
                <div className="blog-sidebar__cta">
                  <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🤖</div>
                  <h4>Try Nexa AI Chat</h4>
                  <p>AI chatbots for WhatsApp, Instagram & more — free to start.</p>
                  <Link to="/register" className="lp-btn-primary" style={{ display: 'block', textAlign: 'center', marginTop: 12 }}>Get Started Free</Link>
                </div>
              </aside>
            </div>
          </div>
        </>
      )}

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <Link to="/" className="lp-footer-logo">
              <div className="lp-logo-icon" style={{ width: 32, height: 32 }}><MessageSquare size={16} /></div>
              <span>Nexa AI Chat</span>
            </Link>
            <div className="lp-footer-links">
              <Link to="/" className="lp-footer-link">Home</Link>
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
          <div className="lp-footer-bottom">&copy; {new Date().getFullYear()} Nexa AI Chat. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
