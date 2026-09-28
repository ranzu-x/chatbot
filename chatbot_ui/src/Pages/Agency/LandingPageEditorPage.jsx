import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { resellerSiteAPI, uploadAPI, assetUrl } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Save, Plus, Trash2, ExternalLink, Loader2, Upload, Globe, Package, AlertTriangle } from 'lucide-react';

/**
 * Reseller → Landing Page. What visitors of the Reseller's own address see
 * (Pages/Landing/ResellerLanding.jsx): headline, features, FAQ, the Docs link
 * and the Reseller's own plans (Packages & Modules). Saved by
 * chatbot_api/routes/resellerSite.js; brand and logo come from Custom Domain.
 */

const label = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
const section = { padding: 18, marginBottom: 18 };

function Toggle({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16 }} />
      {children}
    </label>
  );
}

export default function LandingPageEditorPage() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    resellerSiteAPI.get()
      .then((res) => { setData(res.data); setForm(res.data.site); setSaved(JSON.stringify(res.data.site)); })
      .catch((err) => setError(err?.response?.data?.message || 'Could not load the landing page'));
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const dirty = form && saved !== JSON.stringify(form);

  const save = async () => {
    setSaving(true);
    try {
      const res = await resellerSiteAPI.save(form);
      setForm(res.data.site);
      setSaved(JSON.stringify(res.data.site));
      notify.success('Landing page saved');
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const uploadHero = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { notify.error('Use a PNG, JPG or WEBP image'); return; }
    if (file.size > 3 * 1024 * 1024) { notify.error('Max 3 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadAPI.uploadFile(fd);
      set({ heroImage: res.data.url });
    } catch {
      notify.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (error) return <AppLayout><div className="page-body"><div className="card" style={{ padding: 30, textAlign: 'center' }}>{error}</div></div></AppLayout>;
  if (!form) return <AppLayout><div className="page-body" style={{ textAlign: 'center', padding: 40 }}><Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /></div></AppLayout>;

  const { addresses = {}, plans = [], limits = { features: 12, faqs: 20 } } = data;
  const liveAddress = addresses.customDomain || addresses.subdomainHost;
  const features = form.features || [];
  const faqs = form.faqs || [];

  return (
    <AppLayout>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Landing Page</h1>
          <p className="page-subtitle">The public page on your own address — your brand, your plans, your sign-up.</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={14} />} {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <div className="page-body" style={{ maxWidth: 900 }}>
        <div className="card" style={{ ...section, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Globe size={18} color="#2563eb" style={{ marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 220, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {liveAddress ? (
              <>Live at <a href={`https://${liveAddress}/landing`} target="_blank" rel="noopener noreferrer">https://{liveAddress} <ExternalLink size={12} /></a>.</>
            ) : addresses.subdomain ? (
              <>Shown on your subdomain <b>{addresses.subdomain}</b> and on your custom domain once it is active.</>
            ) : (
              <><AlertTriangle size={13} color="#b45309" /> Your page goes live on your own address. Set up a subdomain or custom domain first.</>
            )}{' '}
            Logo, brand name and colours come from <Link to="/agency/domain-settings">Custom Domain → Branding</Link>.
          </div>
          <Toggle checked={form.isEnabled} onChange={(v) => set({ isEnabled: v })}>Page switched on</Toggle>
        </div>

        <div className="card" style={section}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem' }}>Hero</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={label} htmlFor="lp-headline">Headline</label>
              <input id="lp-headline" className="form-input" value={form.headline} maxLength={160} placeholder={`Grow your business with ${data.brand?.brandName || 'us'}`}
                onChange={(e) => set({ headline: e.target.value })} style={{ width: '100%', height: 36 }} />
            </div>
            <div>
              <label style={label} htmlFor="lp-sub">Sub-headline</label>
              <textarea id="lp-sub" className="form-input" rows={2} value={form.subheadline} maxLength={400}
                onChange={(e) => set({ subheadline: e.target.value })} style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={label} htmlFor="lp-cta">Button text</label>
                <input id="lp-cta" className="form-input" value={form.ctaLabel} maxLength={40} onChange={(e) => set({ ctaLabel: e.target.value })} style={{ width: '100%', height: 36 }} />
              </div>
              <div style={{ flex: '2 1 280px' }}>
                <label style={label}>Hero image (optional)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {form.heroImage && <img src={assetUrl(form.heroImage)} alt="" style={{ height: 36, width: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { uploadHero(e.target.files?.[0]); e.target.value = ''; }} />
                  <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {uploading ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Upload size={13} />} Upload
                  </button>
                  {form.heroImage && <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ heroImage: '' })}>Remove</button>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Features <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.8rem' }}>({features.length}/{limits.features}) — empty shows a standard list</span></h3>
            <button type="button" className="btn btn-secondary btn-sm" disabled={features.length >= limits.features}
              onClick={() => set({ features: [...features, { title: '', description: '' }] })} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Add</button>
          </div>
          {features.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <input className="form-input" placeholder="Title" maxLength={80} value={f.title}
                onChange={(e) => set({ features: features.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} style={{ flex: '1 1 180px', height: 34 }} />
              <input className="form-input" placeholder="Short description" maxLength={300} value={f.description}
                onChange={(e) => set({ features: features.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} style={{ flex: '3 1 260px', height: 34 }} />
              <button type="button" className="btn btn-secondary btn-sm" aria-label="Remove feature" onClick={() => set({ features: features.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div className="card" style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}><Package size={15} /> Pricing</h3>
            <Toggle checked={form.showPricing} onChange={(v) => set({ showPricing: v })}>Show my plans</Toggle>
          </div>
          {plans.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
              You have no active plans yet. Create them in <Link to="/agency/packages">Packages & Modules</Link> — the page shows them automatically.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {plans.map((p) => (
                <span key={p.id} style={{ fontSize: '0.8rem', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <b>{p.name}</b> · {Number(p.price) ? `${p.price} ${p.currency}/${p.billingCycle}` : 'Free'}
                </span>
              ))}
              <Link to="/agency/packages" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>Edit plans →</Link>
            </div>
          )}
        </div>

        <div className="card" style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>FAQ <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.8rem' }}>({faqs.length}/{limits.faqs})</span></h3>
            <button type="button" className="btn btn-secondary btn-sm" disabled={faqs.length >= limits.faqs}
              onClick={() => set({ faqs: [...faqs, { q: '', a: '' }] })} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Add</button>
          </div>
          {faqs.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                <input className="form-input" placeholder="Question" maxLength={200} value={f.q}
                  onChange={(e) => set({ faqs: faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} style={{ height: 34 }} />
                <textarea className="form-input" placeholder="Answer" rows={2} maxLength={1000} value={f.a}
                  onChange={(e) => set({ faqs: faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} style={{ resize: 'vertical' }} />
              </div>
              <button type="button" className="btn btn-secondary btn-sm" aria-label="Remove question" onClick={() => set({ faqs: faqs.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div className="card" style={section}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>Documentation & footer</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <Toggle checked={form.showDocs} onChange={(v) => set({ showDocs: v })}>Show a “Docs” link</Toggle>
            {form.showDocs && (
              <div>
                <label style={label} htmlFor="lp-docs">Docs link (optional)</label>
                <input id="lp-docs" className="form-input" value={form.docsUrl} maxLength={512} placeholder="Empty = the built-in documentation (/docs)"
                  onChange={(e) => set({ docsUrl: e.target.value.trim() })} style={{ width: '100%', height: 36 }} />
              </div>
            )}
            <div>
              <label style={label} htmlFor="lp-footer">Footer text</label>
              <input id="lp-footer" className="form-input" value={form.footerText} maxLength={300} placeholder={`© ${new Date().getFullYear()} ${data.brand?.brandName || ''}. All rights reserved.`}
                onChange={(e) => set({ footerText: e.target.value })} style={{ width: '100%', height: 36 }} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
