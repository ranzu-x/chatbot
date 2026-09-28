import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import useUrlState from '../../hooks/useUrlState';
import { docsAdminAPI } from '../../services/api';
import { notify, showAlert, alert } from '../../utils/alerts';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ExternalLink, FolderOpen, Folder, FileText, Search, Loader2 } from 'lucide-react';

/**
 * Super Admin → Content → Documentation (chatbot_api/routes/docs.js).
 * Left: the Category → Section tree (add / rename / delete / order).
 * Right: the articles of the selected category or section, paged.
 * Public site: /docs.
 */

const statusChip = (status) => (
  <span style={{
    fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
    background: status === 'PUBLISHED' ? '#ecfdf5' : '#f1f5f9', color: status === 'PUBLISHED' ? '#047857' : '#475569',
  }}>{status === 'PUBLISHED' ? 'Published' : 'Draft'}</span>
);

const iconBtn = { padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' };

async function ask(title, value = '') {
  const res = await alert.prompt({ title, value, required: true, confirm: 'Save' });
  return res === null ? null : String(res).trim();
}

function move(list, index, dir) {
  const next = [...list];
  const j = index + dir;
  if (j < 0 || j >= next.length) return null;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export default function DocsManagerPage() {
  const navigate = useNavigate();
  const [tree, setTree] = useState(null);
  const [treeError, setTreeError] = useState('');
  const [catId, setCatId] = useUrlState('category', '');
  const [secId, setSecId] = useUrlState('section', '');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useUrlState('page', 1, { type: 'number' });
  const [articles, setArticles] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const loadTree = useCallback(() => {
    setTreeError('');
    docsAdminAPI.tree().then((res) => setTree(res.data.categories || [])).catch((err) => setTreeError(err?.response?.data?.message || 'Could not load'));
  }, []);
  useEffect(() => { loadTree(); }, [loadTree]);

  const loadArticles = useCallback(() => {
    setArticles(null);
    docsAdminAPI.listArticles({ categoryId: secId ? undefined : catId || undefined, sectionId: secId || undefined, status: status || undefined, search: search || undefined, page, limit: 25 })
      .then((res) => { setArticles(res.data.articles || []); setPagination(res.data.pagination); })
      .catch(() => setArticles([]));
  }, [catId, secId, status, search, page]);
  useEffect(() => { const t = setTimeout(loadArticles, search ? 300 : 0); return () => clearTimeout(t); }, [loadArticles, search]);

  const run = async (fn, okMsg) => {
    try { await fn(); if (okMsg) notify.success(okMsg); loadTree(); loadArticles(); }
    catch (err) { notify.error(err?.response?.data?.message || 'Something went wrong'); }
  };

  const addCategory = async () => {
    const name = await ask('New category (e.g. Getting Started)');
    if (name) run(() => docsAdminAPI.createCategory({ name }), 'Category added');
  };
  const addSection = async (categoryId) => {
    const name = await ask('New section');
    if (name) run(() => docsAdminAPI.createSection({ categoryId, name }), 'Section added');
  };
  const reorder = (type, list, index, dir) => {
    const next = move(list, index, dir);
    if (next) run(() => docsAdminAPI.reorder(type, next.map((x) => x.id)));
  };

  const selectedSection = tree?.flatMap((c) => c.sections).find((s) => String(s.id) === String(secId));
  const canOrderArticles = Boolean(selectedSection) && !status && !search && pagination.pages <= 1;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Documentation</h1>
          <p className="page-subtitle">Categories, sections and articles of the public documentation site</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/docs" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ExternalLink size={14} /> View site
          </a>
          <button className="btn btn-primary" disabled={!tree?.some((c) => c.sections.length)}
            onClick={() => navigate(`/admin/docs/articles/new${secId ? `?section=${secId}` : ''}`)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> New article
          </button>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        {/* Tree */}
        <div className="card" style={{ padding: 14, flex: '1 1 260px', maxWidth: 340 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: '0.85rem' }}>Structure</strong>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addCategory} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Category</button>
          </div>
          <button type="button" onClick={() => { setCatId(''); setSecId(''); setPage(1); }}
            style={{ width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: !catId && !secId ? 700 : 500, background: !catId && !secId ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-primary)' }}>
            All articles
          </button>
          {treeError && <div style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: 8 }}>{treeError}</div>}
          {!tree && !treeError && <div style={{ padding: 12, color: 'var(--text-muted)' }}><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /></div>}
          {tree?.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '10px 4px' }}>Start with a category, then add sections to it. Articles live in sections.</p>}
          {tree?.map((c, ci) => (
            <div key={c.id} style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button type="button" onClick={() => { setCatId(String(c.id)); setSecId(''); setPage(1); }}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', fontWeight: 700,
                    background: String(catId) === String(c.id) && !secId ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-primary)' }}>
                  <FolderOpen size={14} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </button>
                <button type="button" style={iconBtn} title="Move up" onClick={() => reorder('categories', tree, ci, -1)}><ArrowUp size={12} /></button>
                <button type="button" style={iconBtn} title="Move down" onClick={() => reorder('categories', tree, ci, 1)}><ArrowDown size={12} /></button>
                <button type="button" style={iconBtn} title="Rename" onClick={async () => { const name = await ask('Rename category', c.name); if (name) run(() => docsAdminAPI.updateCategory(c.id, { name }), 'Saved'); }}><Pencil size={12} /></button>
                <button type="button" style={iconBtn} title="Delete" onClick={async () => {
                  if (await showAlert.confirm({ title: `Delete "${c.name}"?`, text: 'Only an empty category can be deleted.', confirmButtonText: 'Delete' })) run(() => docsAdminAPI.deleteCategory(c.id), 'Deleted');
                }}><Trash2 size={12} /></button>
              </div>
              <div style={{ paddingLeft: 14 }}>
                {c.sections.map((s, si) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button type="button" onClick={() => { setCatId(String(c.id)); setSecId(String(s.id)); setPage(1); }}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '5px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem',
                        background: String(secId) === String(s.id) ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-secondary)', fontWeight: String(secId) === String(s.id) ? 700 : 500 }}>
                      <Folder size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.published}/{s.total}</span>
                    </button>
                    <button type="button" style={iconBtn} title="Move up" onClick={() => reorder('sections', c.sections, si, -1)}><ArrowUp size={11} /></button>
                    <button type="button" style={iconBtn} title="Move down" onClick={() => reorder('sections', c.sections, si, 1)}><ArrowDown size={11} /></button>
                    <button type="button" style={iconBtn} title="Rename" onClick={async () => { const name = await ask('Rename section', s.name); if (name) run(() => docsAdminAPI.updateSection(s.id, { name }), 'Saved'); }}><Pencil size={11} /></button>
                    <button type="button" style={iconBtn} title="Delete" onClick={async () => {
                      if (await showAlert.confirm({ title: `Delete "${s.name}"?`, text: 'Only an empty section can be deleted.', confirmButtonText: 'Delete' })) run(() => docsAdminAPI.deleteSection(s.id), 'Deleted');
                    }}><Trash2 size={11} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => addSection(c.id)} style={{ ...iconBtn, fontSize: '0.78rem', color: 'var(--primary, #2563eb)', fontWeight: 600, padding: '5px 8px', gap: 4 }}>
                  <Plus size={12} /> Section
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Articles */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: '999 1 420px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, padding: 14, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search titles…" style={{ width: '100%', paddingLeft: 30, height: 34 }} />
            </div>
            <select className="form-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 150, height: 34 }}>
              <option value="">All statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
          {!articles ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
          ) : articles.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>No articles here yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 560 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Title</th>
                  <th style={{ padding: '10px 14px' }}>Where</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Updated</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {articles.map((a, i) => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={13} color="var(--text-muted)" /> {a.title}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{a.categoryName} › {a.sectionName}</td>
                    <td style={{ padding: '10px 14px' }}>{statusChip(a.status)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{new Date(a.updated_at).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canOrderArticles && (
                        <>
                          <button type="button" style={iconBtn} title="Move up" onClick={() => reorder('articles', articles, i, -1)}><ArrowUp size={13} /></button>
                          <button type="button" style={iconBtn} title="Move down" onClick={() => reorder('articles', articles, i, 1)}><ArrowDown size={13} /></button>
                        </>
                      )}
                      {a.status === 'PUBLISHED' && (
                        <a href={`/docs/${a.categorySlug}/${a.slug}`} target="_blank" rel="noopener noreferrer" style={iconBtn} title="View"><ExternalLink size={13} /></a>
                      )}
                      <button type="button" style={iconBtn} title="Edit" onClick={() => navigate(`/admin/docs/articles/${a.id}/edit`)}><Pencil size={13} /></button>
                      <button type="button" style={{ ...iconBtn, color: '#dc2626' }} title="Delete" onClick={async () => {
                        if (await showAlert.confirm({ title: `Delete "${a.title}"?`, text: 'The article is removed from the documentation site.', confirmButtonText: 'Delete' })) run(() => docsAdminAPI.deleteArticle(a.id), 'Article deleted');
                      }}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span style={{ alignSelf: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Page {page} of {pagination.pages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
          {selectedSection && !canOrderArticles && articles?.length > 1 && (
            <div style={{ padding: '8px 14px', fontSize: '0.74rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
              Clear the search and status filter to change the order of this section&apos;s articles.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
