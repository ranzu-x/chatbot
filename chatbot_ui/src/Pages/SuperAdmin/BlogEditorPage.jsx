import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import TipTapEditor from '../../Components/Blog/TipTapEditor';
import { blogAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { Save, Eye, Upload, Plus, Trash2, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';

const CATEGORIES = ['General', 'News', 'Tutorial', 'Product Update', 'Case Study', 'Guide', 'Tips & Tricks', 'Industry Insights', 'Announcements'];

const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverImage: '',
  authorName: 'Admin',
  authorAvatar: '',
  category: 'General',
  tags: [],
  status: 'DRAFT',
  isFeatured: false,
  scheduledAt: '',
  metaTitle: '',
  metaDescription: '',
  ogImage: '',
  canonicalUrl: '',
  faqs: [],
};

function SideSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-hover)', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  );
}

function FormField({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

export default function BlogEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading]   = useState(isEdit);
  const [saving, setSaving]     = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('settings'); // settings | seo | faq
  const coverInputRef = useRef(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // Auto-generate slug from title
  const handleTitleChange = (val) => {
    set('title', val);
    if (!isEdit || !form.slug) {
      const slug = val.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 100);
      set('slug', slug);
    }
    if (!form.metaTitle) set('metaTitle', val);
  };

  // Load existing post
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    blogAPI.adminGet(id)
      .then((res) => {
        const p = res.data.post;
        setForm({
          title:       p.title       || '',
          slug:        p.slug        || '',
          excerpt:     p.excerpt     || '',
          content:     p.content     || '',
          coverImage:  p.cover_image || '',
          authorName:  p.author_name || 'Admin',
          authorAvatar:p.author_avatar || '',
          category:    p.category    || 'General',
          tags:        JSON.parse(p.tags || '[]'),
          status:      p.status      || 'DRAFT',
          isFeatured:  Boolean(p.is_featured),
          scheduledAt: p.scheduled_at ? p.scheduled_at.substring(0, 16) : '',
          metaTitle:   p.meta_title        || '',
          metaDescription: p.meta_description || '',
          ogImage:     p.og_image          || '',
          canonicalUrl:p.canonical_url     || '',
          faqs:        JSON.parse(p.faqs   || '[]'),
        });
      })
      .catch(() => notify.error('Failed to load post'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // Cover image upload
  const handleCoverUpload = async (file) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await blogAPI.uploadImage(fd);
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${res.data.url}`;
      set('coverImage', url);
      notify.success('Cover image uploaded');
    } catch {
      notify.error('Cover upload failed');
    } finally {
      setCoverUploading(false);
    }
  };

  // Tags
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || form.tags.includes(t)) { setTagInput(''); return; }
    set('tags', [...form.tags, t]);
    setTagInput('');
  };
  const removeTag = (tag) => set('tags', form.tags.filter((t) => t !== tag));

  // FAQs
  const addFaq = () => set('faqs', [...form.faqs, { question: '', answer: '' }]);
  const updateFaq = (idx, field, val) => {
    const updated = [...form.faqs];
    updated[idx] = { ...updated[idx], [field]: val };
    set('faqs', updated);
  };
  const removeFaq = (idx) => set('faqs', form.faqs.filter((_, i) => i !== idx));

  // Save
  const handleSave = async (publishNow = false) => {
    if (!form.title.trim()) { notify.error('Title is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, status: publishNow ? 'PUBLISHED' : form.status };
      if (isEdit) {
        await blogAPI.update(id, payload);
        notify.success('Post updated');
      } else {
        const res = await blogAPI.create(payload);
        notify.success('Post created');
        navigate(`/admin/blog/${res.data.post.id}/edit`, { replace: true });
      }
    } catch (err) {
      notify.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const metaTitleLen = form.metaTitle.length;
  const metaDescLen  = form.metaDescription.length;

  if (loading) return <AppLayout><div style={{ padding: 48, textAlign: 'center' }}><div className="loading-spinner" /></div></AppLayout>;

  return (
    <AppLayout>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 20px', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/blog')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}>
            <ArrowLeft size={14} /> All Posts
          </button>
          <div>
            <h1 style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{isEdit ? 'Edit Post' : 'New Blog Post'}</h1>
            {form.slug && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/blog/{form.slug}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isEdit && form.status === 'PUBLISHED' && (
            <a href={`/blog/${form.slug}`} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
              <Eye size={15} /> Preview
            </a>
          )}
          <button className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="btn btn-primary" onClick={() => handleSave(true)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}>
            🚀 {form.status === 'PUBLISHED' ? 'Update & Keep Live' : 'Publish Now'}
          </button>
        </div>
      </div>

      {/* ── 2-column layout ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

        {/* ── Left: Title + Editor ───────────────────────────────── */}
        <div>
          {/* Title */}
          <input
            className="form-input"
            placeholder="Post title…"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: 10, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 10 }}
          />
          {/* Slug */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>URL slug:</span>
            <input
              className="form-input"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.replace(/\s+/g, '-').toLowerCase())}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            />
          </div>
          {/* Excerpt */}
          <textarea
            className="form-input"
            placeholder="Short excerpt / summary shown in blog listing cards…"
            value={form.excerpt}
            onChange={(e) => set('excerpt', e.target.value)}
            rows={2}
            style={{ marginBottom: 16, resize: 'vertical' }}
          />
          {/* Rich Text Editor */}
          <TipTapEditor
            content={form.content}
            onChange={(html) => set('content', html)}
            placeholder="Start writing your blog post…"
          />
        </div>

        {/* ── Right: Sidebar ─────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 88 }}>

          {/* Sidebar tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
            {[['settings', '⚙️ Settings'], ['seo', '🔍 SEO'], ['faq', '❓ FAQ']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setActiveTab(key)}
                style={{ flex: 1, padding: '8px 4px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: activeTab === key ? 700 : 500, fontSize: '0.8rem', color: activeTab === key ? '#6366f1' : 'var(--text-secondary)', borderBottom: activeTab === key ? '2px solid #6366f1' : '2px solid transparent' }}
              >{label}</button>
            ))}
          </div>

          {/* ── Settings tab ── */}
          {activeTab === 'settings' && (
            <>
              <SideSection title="Cover Image">
                {form.coverImage && (
                  <img src={form.coverImage} alt="Cover" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
                )}
                <button type="button" className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => coverInputRef.current?.click()} disabled={coverUploading}
                >
                  <Upload size={14} /> {coverUploading ? 'Uploading…' : 'Upload Cover Image'}
                </button>
                <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.[0]) handleCoverUpload(e.target.files[0]); e.target.value = ''; }}
                />
                {form.coverImage && (
                  <input className="form-input" value={form.coverImage} onChange={(e) => set('coverImage', e.target.value)} placeholder="Or paste image URL" style={{ marginTop: 8, fontSize: '0.78rem' }} />
                )}
              </SideSection>

              <SideSection title="Publish Settings">
                <FormField label="Status">
                  <select className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="SCHEDULED">Scheduled</option>
                  </select>
                </FormField>
                {form.status === 'SCHEDULED' && (
                  <FormField label="Publish Date & Time">
                    <input type="datetime-local" className="form-input" value={form.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
                  </FormField>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
                  <span>⭐ Featured post (shown prominently)</span>
                </label>
              </SideSection>

              <SideSection title="Category & Tags">
                <FormField label="Category">
                  <select className="form-input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </FormField>
                <FormField label="Tags">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {form.tags.map((tag) => (
                      <span key={tag} style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 0, fontSize: '1rem', lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-input" placeholder="Add tag…" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem' }}
                    />
                    <button type="button" className="btn btn-secondary" onClick={addTag} style={{ padding: '6px 10px' }}><Plus size={14} /></button>
                  </div>
                </FormField>
              </SideSection>

              <SideSection title="Author">
                <FormField label="Author Name">
                  <input className="form-input" value={form.authorName} onChange={(e) => set('authorName', e.target.value)} placeholder="Author name" />
                </FormField>
                <FormField label="Author Avatar URL" hint="Paste image URL for author photo">
                  <input className="form-input" value={form.authorAvatar} onChange={(e) => set('authorAvatar', e.target.value)} placeholder="https://…" />
                </FormField>
              </SideSection>
            </>
          )}

          {/* ── SEO tab ── */}
          {activeTab === 'seo' && (
            <>
              <SideSection title="SEO Metadata" defaultOpen>
                <FormField label={`Meta Title (${metaTitleLen}/60)`} hint="Appears in browser tab and Google search results">
                  <input className="form-input" value={form.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} placeholder="SEO title…" maxLength={100} />
                  <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, marginTop: 6 }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, (metaTitleLen / 60) * 100)}%`, background: metaTitleLen > 60 ? '#ef4444' : metaTitleLen > 50 ? '#f59e0b' : '#22c55e', transition: 'all 0.2s' }} />
                  </div>
                </FormField>
                <FormField label={`Meta Description (${metaDescLen}/160)`} hint="Shown in Google search snippets">
                  <textarea className="form-input" value={form.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} placeholder="Brief description for search engines…" rows={3} maxLength={300} />
                  <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, marginTop: 6 }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, (metaDescLen / 160) * 100)}%`, background: metaDescLen > 160 ? '#ef4444' : metaDescLen > 140 ? '#f59e0b' : '#22c55e', transition: 'all 0.2s' }} />
                  </div>
                </FormField>
              </SideSection>

              <SideSection title="Open Graph (Social Sharing)">
                <FormField label="OG Image URL" hint="Shown when shared on Facebook, LinkedIn, Twitter (1200×630px recommended)">
                  <input className="form-input" value={form.ogImage} onChange={(e) => set('ogImage', e.target.value)} placeholder="https://… or leave blank to use cover" />
                  {(form.ogImage || form.coverImage) && (
                    <img src={form.ogImage || form.coverImage} alt="OG preview" style={{ marginTop: 8, width: '100%', height: 80, objectFit: 'cover', borderRadius: 6 }} />
                  )}
                </FormField>
              </SideSection>

              <SideSection title="Advanced">
                <FormField label="Canonical URL" hint="Override the canonical URL if this content appears elsewhere">
                  <input className="form-input" value={form.canonicalUrl} onChange={(e) => set('canonicalUrl', e.target.value)} placeholder="https://yourdomain.com/blog/…" />
                </FormField>
              </SideSection>
            </>
          )}

          {/* ── FAQ tab ── */}
          {activeTab === 'faq' && (
            <SideSection title="FAQ Section" defaultOpen>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                FAQs appear at the bottom of the blog post and generate FAQPage JSON-LD schema for Google rich snippets.
              </p>
              {form.faqs.map((faq, idx) => (
                <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10, position: 'relative' }}>
                  <button type="button" onClick={() => removeFaq(idx)}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem' }}>×</button>
                  <FormField label={`Q${idx + 1} — Question`}>
                    <input className="form-input" value={faq.question} onChange={(e) => updateFaq(idx, 'question', e.target.value)} placeholder="What is…?" style={{ fontSize: '0.82rem' }} />
                  </FormField>
                  <FormField label="Answer">
                    <textarea className="form-input" value={faq.answer} onChange={(e) => updateFaq(idx, 'answer', e.target.value)} placeholder="Answer…" rows={3} style={{ fontSize: '0.82rem', resize: 'vertical' }} />
                  </FormField>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={addFaq} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={14} /> Add FAQ Item
              </button>
            </SideSection>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
