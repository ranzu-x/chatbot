import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import TipTapEditor from '../../Components/Blog/TipTapEditor';
import { docsAdminAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { ArrowLeft, Save, ExternalLink, Loader2 } from 'lucide-react';

/**
 * Super Admin → Documentation → article editor (new / edit).
 * Rich text via the shared TipTap editor; images go to /admin/docs/upload.
 */
const EMPTY = { title: '', slug: '', excerpt: '', content: '', status: 'DRAFT', sectionId: '', seoTitle: '', seoDescription: '' };

const label = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };

export default function DocsEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tree, setTree] = useState([]);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null); // snapshot for the unsaved-changes guard
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    docsAdminAPI.tree().then((res) => setTree(res.data.categories || [])).catch(() => setTree([]));
    if (isNew) {
      const initial = { ...EMPTY, sectionId: params.get('section') || '' };
      setForm(initial);
      setSaved(JSON.stringify(initial));
      return;
    }
    docsAdminAPI.getArticle(id)
      .then((res) => {
        const a = res.data.article;
        const loaded = {
          title: a.title || '', slug: a.slug || '', excerpt: a.excerpt || '', content: a.content || '',
          status: a.status, sectionId: String(a.section_id), seoTitle: a.seo_title || '', seoDescription: a.seo_description || '',
          categorySlug: a.categorySlug,
        };
        setForm(loaded);
        setSaved(JSON.stringify(loaded));
        setSlugTouched(true);
      })
      .catch((err) => setError(err?.response?.data?.message || 'Article not found'));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- load once per article

  const dirty = form && saved !== JSON.stringify(form);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const autoSlug = (title) => title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 120);

  const sections = useMemo(() => tree.flatMap((c) => c.sections.map((s) => ({ ...s, categoryName: c.name, categorySlug: c.slug }))), [tree]);
  const currentSection = sections.find((s) => String(s.id) === String(form?.sectionId));

  const save = async (statusOverride) => {
    if (!form.title.trim()) { notify.error('Title is required'); return; }
    if (!form.sectionId) { notify.error('Choose a section'); return; }
    setSaving(true);
    const payload = {
      title: form.title, slug: form.slug || undefined, excerpt: form.excerpt, content: form.content,
      status: statusOverride || form.status, sectionId: Number(form.sectionId), seoTitle: form.seoTitle, seoDescription: form.seoDescription,
    };
    try {
      if (isNew) {
        const res = await docsAdminAPI.createArticle(payload);
        notify.success('Article created');
        setSaved(JSON.stringify(form));
        navigate(`/admin/docs/articles/${res.data.id}/edit`, { replace: true });
      } else {
        const res = await docsAdminAPI.updateArticle(id, payload);
        const next = { ...form, status: payload.status, slug: res.data.slug, categorySlug: currentSection?.categorySlug };
        setForm(next);
        setSaved(JSON.stringify(next));
        notify.success(payload.status === 'PUBLISHED' ? 'Saved and published' : 'Saved');
      }
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <AppLayout>
        <div className="page-body"><div className="card" style={{ padding: 30, textAlign: 'center' }}>{error}</div></div>
      </AppLayout>
    );
  }
  if (!form) {
    return <AppLayout><div className="page-body" style={{ textAlign: 'center', padding: 40 }}><Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/docs')} aria-label="Back"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">{isNew ? 'New article' : 'Edit article'}</h1>
            <p className="page-subtitle">{dirty ? 'Unsaved changes' : form.status === 'PUBLISHED' ? 'Published' : 'Draft'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isNew && form.status === 'PUBLISHED' && form.categorySlug && (
            <a className="btn btn-secondary" href={`/docs/${form.categorySlug}/${form.slug}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={14} /> View
            </a>
          )}
          {form.status === 'PUBLISHED' ? (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => save('DRAFT')}>Unpublish</button>
          ) : (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => save('DRAFT')}>Save draft</button>
          )}
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save('PUBLISHED')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={14} />}
            {form.status === 'PUBLISHED' ? 'Save' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            className="form-input"
            value={form.title}
            maxLength={200}
            placeholder="Article title"
            onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: autoSlug(e.target.value) }) })}
            style={{ fontSize: '1.3rem', fontWeight: 800, height: 50 }}
          />
          <textarea className="form-input" rows={2} maxLength={500} value={form.excerpt} onChange={(e) => set({ excerpt: e.target.value })}
            placeholder="Short summary shown under the title and in search results (optional)" style={{ resize: 'vertical' }} />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <TipTapEditor
              content={form.content}
              onChange={(html) => set({ content: html })}
              placeholder="Write the article… Use Heading 2 / 3 for sections — they build the page's table of contents."
              uploadImage={docsAdminAPI.uploadImage}
            />
          </div>
        </div>

        <div className="card" style={{ flex: '1 1 260px', maxWidth: 360, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label} htmlFor="doc-section">Section *</label>
            <select id="doc-section" className="form-input" value={form.sectionId} onChange={(e) => set({ sectionId: e.target.value })} style={{ width: '100%', height: 36 }}>
              <option value="">Choose…</option>
              {tree.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              ))}
            </select>
            {tree.length === 0 && <div style={{ fontSize: '0.74rem', color: '#b45309', marginTop: 5 }}>Create a category and a section on the Documentation page first.</div>}
          </div>
          <div>
            <label style={label} htmlFor="doc-slug">URL</label>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>/docs/{currentSection?.categorySlug || '…'}/</div>
            <input id="doc-slug" className="form-input" value={form.slug} maxLength={180}
              onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }); }}
              style={{ width: '100%', height: 34 }} />
            {!isNew && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Changing it breaks links to the old address.</div>}
          </div>
          <div>
            <label style={label} htmlFor="doc-seo-title">SEO title</label>
            <input id="doc-seo-title" className="form-input" value={form.seoTitle} maxLength={200} placeholder={form.title || 'Defaults to the title'}
              onChange={(e) => set({ seoTitle: e.target.value })} style={{ width: '100%', height: 34 }} />
          </div>
          <div>
            <label style={label} htmlFor="doc-seo-desc">SEO description <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({form.seoDescription.length}/320)</span></label>
            <textarea id="doc-seo-desc" className="form-input" rows={3} value={form.seoDescription} maxLength={320} placeholder="Defaults to the summary"
              onChange={(e) => set({ seoDescription: e.target.value })} style={{ width: '100%', resize: 'vertical' }} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
