import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { blogAPI } from '../../services/api';
import { MessageSquare, Search, Clock, Eye, ChevronLeft, ChevronRight, Star } from 'lucide-react';

function formatDate(str) {
  if (!str) return '';
  return new Date(str).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function PostCard({ post, featured }) {
  const tags = (() => { try { return JSON.parse(post.tags || '[]'); } catch { return []; } })();
  return (
    <Link to={`/blog/${post.slug}`} className={`blog-card ${featured ? 'blog-card--featured' : ''}`}>
      <div className="blog-card__image">
        {post.cover_image
          ? <img src={post.cover_image} alt={post.title} />
          : <div className="blog-card__image-placeholder"><MessageSquare size={32} /></div>
        }
        <span className="blog-card__category">{post.category}</span>
        {featured && <span className="blog-card__featured-badge">⭐ Featured</span>}
      </div>
      <div className="blog-card__body">
        <h3 className="blog-card__title">{post.title}</h3>
        {post.excerpt && <p className="blog-card__excerpt">{post.excerpt}</p>}
        <div className="blog-card__meta">
          <div className="blog-card__author">
            {post.author_avatar
              ? <img src={post.author_avatar} alt={post.author_name} className="blog-card__avatar" />
              : <div className="blog-card__avatar-placeholder">{(post.author_name || 'A')[0]}</div>
            }
            <span>{post.author_name || 'Admin'}</span>
          </div>
          <div className="blog-card__stats">
            <span><Clock size={12} /> {post.read_time || 1} min</span>
            <span><Eye size={12} /> {(post.views || 0).toLocaleString()}</span>
          </div>
        </div>
        <div className="blog-card__date">{formatDate(post.published_at)}</div>
        {tags.length > 0 && (
          <div className="blog-card__tags">
            {tags.slice(0, 3).map((tag) => <span key={tag} className="blog-tag">{tag}</span>)}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function BlogListPage() {
  const [posts, setPosts]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory]     = useState('');
  const [page, setPage]             = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  useEffect(() => {
    blogAPI.categories().then((r) => setCategories(r.data?.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    blogAPI.list({ page, limit: 9, search: search || undefined, category: category || undefined })
      .then((r) => {
        setPosts(r.data?.posts || []);
        setPagination(r.data?.pagination || { total: 0, pages: 1 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, category]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const featuredPosts = posts.filter((p) => p.is_featured);
  const regularPosts  = posts.filter((p) => !p.is_featured);

  return (
    <>
      {/* ── Hero ──────────────────────────────────────── */}
      <section className="blog-list-hero">
        <div className="lp-container">
          <span className="lp-section-tag">Insights & Resources</span>
          <h1 className="blog-list-hero__title">Blog & Knowledge Hub</h1>
          <p className="blog-list-hero__desc">Guides, tutorials, product updates, and industry insights to help you grow with AI-powered conversational marketing.</p>
          <form onSubmit={handleSearch} className="blog-search-form">
            <Search size={18} className="blog-search-form__icon" />
            <input
              className="blog-search-form__input"
              placeholder="Search articles…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" className="blog-search-form__btn">Search</button>
          </form>
        </div>
      </section>

      {/* ── Category filter ───────────────────────────── */}
      {categories.length > 0 && (
        <div className="blog-category-bar">
          <div className="lp-container">
            <div className="blog-category-bar__inner">
              <button className={`blog-cat-btn ${!category ? 'blog-cat-btn--active' : ''}`} onClick={() => { setCategory(''); setPage(1); }}>All</button>
              {categories.map((cat) => (
                <button key={cat} className={`blog-cat-btn ${category === cat ? 'blog-cat-btn--active' : ''}`} onClick={() => { setCategory(cat); setPage(1); }}>{cat}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Posts ─────────────────────────────────────── */}
      <section className="lp-section" style={{ paddingTop: 40 }}>
        <div className="lp-container">
          {loading ? (
            <div className="blog-loading"><div className="lp-spinner" /></div>
          ) : posts.length === 0 ? (
            <div className="blog-empty">
              <MessageSquare size={48} />
              <h3>No posts found</h3>
              <p>{search ? `No results for "${search}"` : 'No blog posts published yet. Check back soon!'}</p>
              {search && <button className="lp-btn-secondary" onClick={() => { setSearch(''); setSearchInput(''); }}>Clear Search</button>}
            </div>
          ) : (
            <>
              {/* Featured */}
              {featuredPosts.length > 0 && (
                <div className="blog-featured-grid" style={{ marginBottom: 48 }}>
                  {featuredPosts.map((p) => <PostCard key={p.id} post={p} featured />)}
                </div>
              )}
              {/* Regular grid */}
              <div className="blog-grid">
                {regularPosts.map((p) => <PostCard key={p.id} post={p} />)}
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="blog-pagination">
                  <button className="blog-pagination__btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="blog-pagination__info">Page {page} of {pagination.pages} · {pagination.total} articles</span>
                  <button className="blog-pagination__btn" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
