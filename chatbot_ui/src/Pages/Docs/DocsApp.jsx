import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useParams, useLocation } from 'react-router';
import { Search, Menu, X, ChevronRight, BookOpen, ArrowLeft, ArrowRight, Loader2, LayoutDashboard } from 'lucide-react';
import { docsAPI, assetUrl } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import usePublicSite from '../../hooks/usePublicSite';
import { prepareArticleHtml } from '../../utils/sanitizeHtml';
import './docs.css';

/**
 * Public documentation (/docs/*) — one catch-all route, like the Forum.
 *   /docs                          home: categories + first articles
 *   /docs/:category                → its first article
 *   /docs/:category/:article       article, with sidebar, breadcrumbs, TOC, previous / next
 * Data: chatbot_api/routes/docs.js. The sidebar is loaded one category at a
 * time and article bodies only one at a time, so it stays fast as it grows.
 * Shown on every domain; a Reseller's address shows the Reseller's brand.
 */

function useDocMeta(title, description) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;
    let tag = document.querySelector('meta[name="description"]');
    const prevDesc = tag?.getAttribute('content');
    if (description) {
      if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', 'description'); document.head.appendChild(tag); }
      tag.setAttribute('content', description);
    }
    return () => {
      document.title = prevTitle;
      if (tag && prevDesc !== null && prevDesc !== undefined) tag.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}

function useBrand() {
  const site = usePublicSite();
  const isReseller = site.kind === 'RESELLER';
  return {
    loading: site.loading,
    name: isReseller ? (site.brand?.brandName || site.brand?.name) : 'Nexa AI Chat',
    logo: isReseller ? site.brand?.logoUrl : '',
    homeHref: '/landing',
  };
}

// ── Search (Ctrl / ⌘ + K anywhere in the docs) ──────────────────────────
function SearchDialog({ onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | done
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setState('idle'); return undefined; }
    setState('loading');
    const t = setTimeout(() => {
      docsAPI.search(term)
        .then((res) => { setResults(res.data?.results || []); setActive(0); })
        .catch(() => setResults([]))
        .finally(() => setState('done'));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r) => { onClose(); navigate(`/docs/${r.categorySlug}/${r.slug}`); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) go(results[active]);
  };

  return (
    <div className="dc-search-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search documentation">
      <div className="dc-search-box" onClick={(e) => e.stopPropagation()}>
        <div className="dc-search-input-row">
          <Search size={18} color="#64748b" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search the documentation…" maxLength={120} aria-label="Search" />
          {state === 'loading' && <Loader2 size={16} className="dc-spin" style={{ animation: 'spin 0.8s linear infinite' }} />}
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
        </div>
        <div className="dc-search-results">
          {q.trim().length < 2 ? (
            <div className="dc-search-hint">Type at least 2 characters.</div>
          ) : state === 'done' && results.length === 0 ? (
            <div className="dc-search-hint">No articles match “{q.trim()}”.</div>
          ) : (
            results.map((r, i) => (
              <Link
                key={r.slug}
                to={`/docs/${r.categorySlug}/${r.slug}`}
                onClick={onClose}
                onMouseEnter={() => setActive(i)}
                className={`dc-search-result${i === active ? ' dc-search-result--active' : ''}`}
              >
                <b>{r.title}</b>
                <small>{r.categoryName} › {r.sectionName}{r.excerpt ? ` — ${r.excerpt.slice(0, 110)}` : ''}</small>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DocsHeader({ onMenu, onSearch, showMenu }) {
  const brand = useBrand();
  const { user } = useAuth();
  return (
    <header className="dc-header">
      <div className="dc-header-inner">
        {showMenu && (
          <button type="button" className="dc-menu-btn" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
        )}
        <Link to="/docs" className="dc-brand">
          {brand.logo ? <img src={assetUrl(brand.logo)} alt={brand.name || ''} /> : <><BookOpen size={20} color="#2563eb" /> <span>{brand.name}</span></>}
          <span className="dc-brand-tag">Docs</span>
        </Link>
        <button type="button" className="dc-search-btn" onClick={onSearch}>
          <Search size={15} /> <span>Search docs…</span> <kbd>Ctrl K</kbd>
        </button>
        <nav className="dc-header-links">
          <a href={brand.homeHref} className="dc-hide-sm">Home</a>
          {user
            ? <Link to={user.role === 'ADMIN' ? '/admin' : '/agency'} className="dc-btn"><LayoutDashboard size={14} /> <span className="dc-hide-sm">Dashboard</span></Link>
            : <Link to="/login" className="dc-btn">Sign in</Link>}
        </nav>
      </div>
    </header>
  );
}

function Shell({ children, sidebar, categories, activeCategory }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="dc-root">
      <DocsHeader onMenu={() => setMenuOpen((o) => !o)} onSearch={() => setSearchOpen(true)} showMenu={Boolean(sidebar)} />
      {categories?.length > 1 && (
        <div className="dc-tabs">
          <div className="dc-tabs-inner">
            {categories.map((c) => (
              <Link key={c.slug} to={`/docs/${c.slug}`} className={`dc-tab${c.slug === activeCategory ? ' dc-tab--active' : ''}`}>{c.name}</Link>
            ))}
          </div>
        </div>
      )}
      {sidebar ? (
        <div className="dc-layout">
          <aside className={`dc-sidebar${menuOpen ? ' dc-sidebar--open' : ''}`} aria-label="Documentation navigation">{sidebar}</aside>
          {children}
        </div>
      ) : children}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────
function DocsHome() {
  const brand = useBrand();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useDocMeta(`Documentation — ${brand.name || ''}`.trim(), `Guides and help articles for ${brand.name || 'the platform'}.`);

  useEffect(() => {
    docsAPI.home().then((res) => setData(res.data?.categories || [])).catch(() => setError(true));
  }, []);

  return (
    <Shell>
      <section className="dc-home-hero">
        <h1>How can we help?</h1>
        <p>Guides, setup steps and answers for {brand.name || 'the platform'}.</p>
        <button type="button" className="dc-search-btn" onClick={() => setSearchOpen(true)}>
          <Search size={17} /> <span>Search the documentation…</span>
        </button>
      </section>
      {error ? (
        <div className="dc-empty">The documentation couldn&apos;t be loaded. Please try again.</div>
      ) : !data ? (
        <div className="dc-empty"><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
      ) : data.length === 0 ? (
        <div className="dc-empty">No documentation has been published yet.</div>
      ) : (
        <div className="dc-home-grid">
          {data.map((c) => (
            <div key={c.slug} className="dc-card">
              <h2><Link to={`/docs/${c.slug}`}>{c.name}</Link></h2>
              {c.description && <p>{c.description}</p>}
              <ul>
                {c.articles.map((a) => <li key={a.slug}><Link to={`/docs/${c.slug}/${a.slug}`}>{a.title}</Link></li>)}
              </ul>
              {c.articleCount > c.articles.length && (
                <Link to={`/docs/${c.slug}`} style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2563eb', textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
                  All {c.articleCount} articles →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </Shell>
  );
}

// ── Sidebar data (per category, cached for the visit) ───────────────────
const navCache = new Map();
function useCategoryNav(categorySlug) {
  const [nav, setNav] = useState(() => navCache.get(categorySlug) || null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (navCache.has(categorySlug)) { setNav(navCache.get(categorySlug)); return undefined; }
    let alive = true;
    setNav(null);
    setError(null);
    docsAPI.nav(categorySlug)
      .then((res) => { navCache.set(categorySlug, res.data); if (alive) setNav(res.data); })
      .catch((err) => { if (alive) setError(err?.response?.status === 404 ? 'notfound' : 'failed'); });
    return () => { alive = false; };
  }, [categorySlug]);
  return { nav, error };
}

function Sidebar({ nav, activeSlug }) {
  if (!nav) return <div style={{ padding: 8, color: '#94a3b8' }}><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /></div>;
  return (
    <>
      {nav.sections.map((s) => (
        <div key={s.id} className="dc-side-section">
          <div className="dc-side-title">{s.name}</div>
          {s.articles.map((a) => (
            <Link key={a.slug} to={`/docs/${nav.category.slug}/${a.slug}`} className={`dc-side-link${a.slug === activeSlug ? ' dc-side-link--active' : ''}`} aria-current={a.slug === activeSlug ? 'page' : undefined}>
              {a.title}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

function NotFound({ message = "This page doesn't exist." }) {
  return (
    <div className="dc-empty">
      <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Page not found</p>
      <p>{message}</p>
      <Link to="/docs" className="dc-btn" style={{ marginTop: 12 }}>Documentation home</Link>
    </div>
  );
}

// /docs/:category → first article of the category
function DocsCategory() {
  const { categorySlug } = useParams();
  const { nav, error } = useCategoryNav(categorySlug);
  if (error === 'notfound') return <Shell><NotFound /></Shell>;
  if (error) return <Shell><div className="dc-empty">Couldn&apos;t load this section.</div></Shell>;
  if (!nav) return <Shell><div className="dc-empty"><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} /></div></Shell>;
  const first = nav.sections[0]?.articles[0];
  if (!first) return <Shell categories={nav.categories} activeCategory={categorySlug}><NotFound message="This category has no published articles yet." /></Shell>;
  return <Navigate to={`/docs/${categorySlug}/${first.slug}`} replace />;
}

// /docs/:category/:article
function DocsArticle() {
  const { categorySlug, articleSlug } = useParams();
  const { nav } = useCategoryNav(categorySlug);
  const brand = useBrand();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    docsAPI.article(articleSlug)
      .then((res) => { if (alive) setData(res.data); })
      .catch((err) => { if (alive) setError(err?.response?.status === 404 ? 'notfound' : 'failed'); });
    return () => { alive = false; };
  }, [articleSlug]);

  const prepared = useMemo(() => (data ? prepareArticleHtml(data.article.content) : null), [data]);
  const article = data?.article;
  useDocMeta(
    article ? `${article.seo_title || article.title} — ${brand.name || 'Docs'}` : null,
    article ? (article.seo_description || article.excerpt || '') : null
  );

  // Land on #anchor / top when the article changes.
  useEffect(() => {
    if (!prepared) return;
    const id = decodeURIComponent(location.hash.replace('#', ''));
    if (id) document.getElementById(id)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [prepared, location.hash]);

  // The article belongs to another category than the URL says → correct the URL.
  if (article && article.categorySlug !== categorySlug) {
    return <Navigate to={`/docs/${article.categorySlug}/${article.slug}${location.hash}`} replace />;
  }

  const sidebar = <Sidebar nav={nav} activeSlug={articleSlug} />;
  return (
    <Shell sidebar={sidebar} categories={nav?.categories} activeCategory={categorySlug}>
      <main className="dc-main">
        {error === 'notfound' ? <NotFound message="This article doesn't exist or isn't published." />
          : error ? <div className="dc-empty">Couldn&apos;t load this article.</div>
            : !data ? <div className="dc-empty"><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
              : (
                <article>
                  <nav className="dc-breadcrumbs" aria-label="Breadcrumb">
                    {data.breadcrumbs.map((b, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && <ChevronRight size={13} />}
                        {b.to ? <Link to={b.to}>{b.label}</Link> : <span>{b.label}</span>}
                      </span>
                    ))}
                  </nav>
                  <h1 className="dc-article-title">{article.title}</h1>
                  {article.excerpt && <p className="dc-article-excerpt">{article.excerpt}</p>}
                  <div className="dc-article-meta">Updated {new Date(article.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <div className="dc-content" dangerouslySetInnerHTML={{ __html: prepared.html }} />
                  <nav className="dc-pager" aria-label="Previous and next article">
                    {data.prev && (
                      <Link to={`/docs/${categorySlug}/${data.prev.slug}`}>
                        <small><ArrowLeft size={11} /> Previous</small><span>{data.prev.title}</span>
                      </Link>
                    )}
                    {data.next && (
                      <Link to={`/docs/${categorySlug}/${data.next.slug}`} className="dc-pager-next">
                        <small>Next <ArrowRight size={11} /></small><span>{data.next.title}</span>
                      </Link>
                    )}
                  </nav>
                </article>
              )}
      </main>
      <aside className="dc-toc" aria-label="On this page">
        {prepared?.toc.length > 1 && (
          <>
            <div className="dc-toc-title">On this page</div>
            {prepared.toc.map((t) => (
              <a key={t.id} href={`#${t.id}`} className={t.level === 3 ? 'dc-toc-sub' : ''}>{t.text}</a>
            ))}
          </>
        )}
      </aside>
    </Shell>
  );
}

export default function DocsApp() {
  return (
    <Routes>
      <Route index element={<DocsHome />} />
      <Route path=":categorySlug" element={<DocsCategory />} />
      <Route path=":categorySlug/:articleSlug" element={<DocsArticle />} />
      <Route path="*" element={<Shell><NotFound /></Shell>} />
    </Routes>
  );
}
