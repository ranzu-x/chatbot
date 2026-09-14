import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { blogAPI } from '../../services/api';
import { showAlert, notify } from '../../utils/alerts';
import { Link, useNavigate } from 'react-router';
import { Plus, Edit2, Trash2, Eye, Star, Globe, FileText, Search, RefreshCw } from 'lucide-react';

const STATUS_COLORS = {
  PUBLISHED: { bg: 'rgba(22,163,74,0.1)',  color: '#16a34a', label: 'Published' },
  DRAFT:     { bg: 'rgba(100,116,139,0.1)', color: '#64748b', label: 'Draft'     },
  SCHEDULED: { bg: 'rgba(245,158,11,0.1)',  color: '#d97706', label: 'Scheduled' },
};

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BlogManagerPage() {
  const navigate = useNavigate();
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [status, setStatus]   = useState('');
  const [page, setPage]       = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [deleting, setDeleting]     = useState(null);
  const [toggling, setToggling]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await blogAPI.adminList({ page, limit: 15, search: search || undefined, status: status || undefined });
      setPosts(res.data?.posts || []);
      setPagination(res.data?.pagination || { total: 0, pages: 1 });
    } catch {
      notify.error('Failed to load blog posts');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (post) => {
    const confirmed = await showAlert.confirm(`Delete "${post.title}"?`, 'This action cannot be undone.');
    if (!confirmed) return;
    setDeleting(post.id);
    try {
      await blogAPI.remove(post.id);
      notify.success('Post deleted');
      load();
    } catch {
      notify.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleTogglePublish = async (post) => {
    setToggling(post.id);
    try {
      const res = await blogAPI.togglePublish(post.id);
      notify.success(res.data.message || 'Status updated');
      load();
    } catch {
      notify.error('Failed to update status');
    } finally {
      setToggling(null);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.6rem' }}>📝</span>
          <div>
            <h1 className="page-title">Blog Manager</h1>
            <p className="page-subtitle">Create and manage public blog posts, FAQs, and SEO metadata</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/admin/blog/new')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> New Post
        </button>
      </div>

      <div className="page-body">
        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              className="form-input"
              placeholder="Search posts…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ paddingLeft: 36 }}
            />
          </div>
          <select className="form-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 150 }}>
            <option value="">All Statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
          </select>
          <button className="btn btn-secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* ── Table ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              {pagination.total} post{pagination.total !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}><div className="loading-spinner" /></div>
          ) : posts.length === 0 ? (
            <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <FileText size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>No posts yet</p>
              <p style={{ fontSize: '0.875rem' }}>Click "New Post" to write your first blog article.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                    {['Title', 'Category', 'Status', 'Views', 'Published', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => {
                    const sc = STATUS_COLORS[post.status] || STATUS_COLORS.DRAFT;
                    return (
                      <tr key={post.id} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '12px 16px', maxWidth: 320 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {post.is_featured ? <Star size={13} fill="#f59e0b" color="#f59e0b" title="Featured" /> : null}
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>{post.title}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/{post.slug} · {post.read_time} min read</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600 }}>{post.category}</span>
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600 }}>{sc.label}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Eye size={13} /> {(post.views || 0).toLocaleString()}</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(post.published_at)}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {/* View live (published only) */}
                            {post.status === 'PUBLISHED' && (
                              <Link to={`/blog/${post.slug}`} target="_blank"
                                style={{ padding: '5px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', color: '#6366f1', display: 'flex', alignItems: 'center' }}
                                title="View live post"
                              >
                                <Globe size={14} />
                              </Link>
                            )}
                            {/* Edit */}
                            <button
                              className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => navigate(`/admin/blog/${post.id}/edit`)}
                            ><Edit2 size={13} /> Edit</button>
                            {/* Publish toggle */}
                            <button
                              className={`btn ${post.status === 'PUBLISHED' ? 'btn-secondary' : 'btn-primary'}`}
                              style={{ padding: '5px 10px', fontSize: '0.78rem', opacity: toggling === post.id ? 0.6 : 1 }}
                              onClick={() => handleTogglePublish(post)}
                              disabled={toggling === post.id}
                            >
                              {toggling === post.id ? '…' : post.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                            </button>
                            {/* Delete */}
                            <button
                              style={{ padding: '5px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: deleting === post.id ? 0.6 : 1 }}
                              onClick={() => handleDelete(post)}
                              disabled={deleting === post.id}
                              title="Delete post"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ── */}
          {pagination.pages > 1 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: '6px 14px' }}>← Prev</button>
              <span style={{ padding: '6px 12px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Page {page} of {pagination.pages}</span>
              <button className="btn btn-secondary" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} style={{ padding: '6px 14px' }}>Next →</button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
