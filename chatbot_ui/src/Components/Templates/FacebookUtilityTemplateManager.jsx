import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Zap, RefreshCw, Search, Plus, Trash2, Library, FileText, AlertTriangle, CheckCircle2, Loader2,
  Image as ImageIcon, Link2, CornerDownRight, X, Info, ShieldAlert,
} from 'lucide-react';
import { messengerUtilityAPI, uploadAPI } from '../../services/api';
import { getSocketUrl, socketAuth } from '../../utils/socketAuth';
import { showAlert, notify, alert } from '../../utils/alerts';
import useUrlState from '../../hooks/useUrlState';
import { describeMessengerTemplate, placeholdersOf, fillPreview, STATUS_BADGE, REJECTION_HELP } from './messengerTemplateUtils';

/**
 * Messenger Utility templates of one Facebook Page (Bot Manager → Message
 * Templates). Utility templates are Meta's replacement for the removed
 * ACCOUNT_UPDATE / POST_PURCHASE_UPDATE / CONFIRMED_EVENT_UPDATE tags: the
 * only automated message a Page may send after the 24-hour window. Order,
 * account, appointment and event updates only — never marketing.
 *
 * Tabs: My templates (synced mirror + live status) · Meta library (copy a
 * pre-approved one) · Create (custom, with the same pre-checks Meta applies).
 */

const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'en_US', label: 'English (US)' }, { code: 'en_GB', label: 'English (UK)' },
  { code: 'bn', label: 'Bengali' }, { code: 'ar', label: 'Arabic' }, { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' }, { code: 'de', label: 'German' }, { code: 'hi', label: 'Hindi' },
  { code: 'id', label: 'Indonesian' }, { code: 'pt_BR', label: 'Portuguese (BR)' }, { code: 'ur', label: 'Urdu' },
  { code: 'tr', label: 'Turkish' },
];

const EMPTY_DRAFT = {
  name: '',
  language: 'en',
  parameterFormat: 'POSITIONAL',
  header: { type: 'NONE', text: '', imageUrl: '', examples: {} },
  body: { text: '', examples: {} },
  buttons: [],
};

const tabBtn = (active) => ({
  padding: '8px 14px', borderRadius: 8, border: '1px solid', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
  borderColor: active ? 'var(--primary)' : 'var(--border)',
  background: active ? 'var(--primary-soft)' : 'var(--bg-surface)',
  color: active ? 'var(--primary)' : 'var(--text-secondary)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

function TemplatePreview({ meta, headerImage, values = {} }) {
  if (!meta) return null;
  return (
    <div style={{ maxWidth: 320, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-card)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      {meta.headerType === 'IMAGE' && (
        headerImage
          ? <img src={headerImage} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
          : <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-hover)', color: 'var(--text-muted)', gap: 6, fontSize: '0.78rem' }}><ImageIcon size={16} /> Header image</div>
      )}
      <div style={{ padding: '12px 14px' }}>
        {meta.headerText && <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 4 }}>{fillPreview(meta.headerText, values)}</div>}
        <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{fillPreview(meta.bodyText, values) || <span style={{ color: 'var(--text-muted)' }}>Body text…</span>}</div>
      </div>
      {meta.buttons.map((b) => (
        <div key={b.index} style={{ borderTop: '1px solid var(--border)', padding: '9px 14px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {b.type === 'URL' ? <Link2 size={13} /> : <CornerDownRight size={13} />} {b.text}
        </div>
      ))}
    </div>
  );
}

/* ── Create form ─────────────────────────────────────────────────────────── */
function CreateTemplateForm({ account, onCreated }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [check, setCheck] = useState({ errors: [], warnings: [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const timer = useRef(null);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setHeader = (patch) => setDraft((d) => ({ ...d, header: { ...d.header, ...patch } }));
  const setBody = (patch) => setDraft((d) => ({ ...d, body: { ...d.body, ...patch } }));
  const setButton = (i, patch) => setDraft((d) => ({ ...d, buttons: d.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }));

  // Server-side pre-checks (same rules Meta rejects with), debounced.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      messengerUtilityAPI.validate(draft).then((res) => setCheck({ errors: res.data.errors || [], warnings: res.data.warnings || [] })).catch(() => {});
    }, 400);
    return () => clearTimeout(timer.current);
  }, [draft]);

  const bodyVars = placeholdersOf(draft.body.text);
  const headerVars = draft.header.type === 'TEXT' ? placeholdersOf(draft.header.text) : [];
  const exampleValues = { ...draft.body.examples, ...draft.header.examples };

  const previewMeta = useMemo(() => describeMessengerTemplate({
    parameter_format: draft.parameterFormat,
    components: [
      ...(draft.header.type === 'TEXT' ? [{ type: 'HEADER', format: 'TEXT', text: draft.header.text }] : []),
      ...(draft.header.type === 'IMAGE' ? [{ type: 'HEADER', format: 'IMAGE' }] : []),
      { type: 'BODY', text: draft.body.text },
      ...(draft.buttons.length ? [{ type: 'BUTTONS', buttons: draft.buttons.map((b) => ({ type: b.type, text: b.text || 'Button', url: b.url, payload: b.type === 'POSTBACK' ? '{{1}}' : undefined })) }] : []),
    ],
  }), [draft]);

  const insertVariable = async () => {
    let next;
    if (draft.parameterFormat === 'NAMED') {
      const name = await alert.prompt({
        title: 'Add a variable', label: 'Variable name', value: 'order_id', required: true, confirm: 'Add',
        validate: (v) => (/^[a-z][a-z0-9_]*$/.test(v.trim()) ? null : 'Lowercase letters, numbers and _ only (e.g. order_id).'),
      });
      if (name === null) return;
      next = `{{${name.trim()}}}`;
    } else {
      next = `{{${bodyVars.filter((v) => /^\d+$/.test(v)).length + 1}}}`;
    }
    setBody({ text: `${draft.body.text}${draft.body.text && !draft.body.text.endsWith(' ') ? ' ' : ''}${next} ` });
  };

  const uploadImage = async (file) => {
    if (!file) return;
    if (!/image\/(jpeg|png)/.test(file.type)) { notify.error('Use a JPEG or PNG image'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadAPI.uploadFile(fd);
      setHeader({ imageUrl: res.data.url });
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = await messengerUtilityAPI.create(account.id, draft);
      notify.success(res.data.message || 'Template submitted');
      setDraft(EMPTY_DRAFT);
      onCreated?.();
    } catch (err) {
      const data = err?.response?.data;
      if (data?.errors) setCheck({ errors: data.errors, warnings: data.warnings || [] });
      showAlert.error('Template not created', data?.message || 'Meta refused the template');
    } finally {
      setSaving(false);
    }
  };

  const backendBase = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/v1', '') : 'http://localhost:5000';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'start' }} className="mut-create-grid">
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Template name</label>
            <input className="form-input" value={draft.name} placeholder="order_shipped_update" onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
          </div>
          <div className="form-group">
            <label className="form-label">Language</label>
            <select className="form-input" value={draft.language} onChange={(e) => set({ language: e.target.value })}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Variables</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['POSITIONAL', 'Numbered {{1}}'], ['NAMED', 'Named {{order_id}}']].map(([id, label]) => (
              <button key={id} type="button" style={tabBtn(draft.parameterFormat === id)} onClick={() => set({ parameterFormat: id })}>{label}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Header (optional)</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            {[['NONE', 'None'], ['TEXT', 'Text'], ['IMAGE', 'Image']].map(([id, label]) => (
              <button key={id} type="button" style={tabBtn(draft.header.type === id)} onClick={() => setHeader({ type: id })}>{label}</button>
            ))}
          </div>
          {draft.header.type === 'TEXT' && (
            <input className="form-input" maxLength={60} value={draft.header.text} placeholder="Your order update" onChange={(e) => setHeader({ text: e.target.value })} />
          )}
          {draft.header.type === 'IMAGE' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                {uploading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ImageIcon size={14} />} {draft.header.imageUrl ? 'Replace image' : 'Upload JPEG / PNG'}
                <input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => uploadImage(e.target.files?.[0])} />
              </label>
              {draft.header.imageUrl && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sample image uploaded — each send can use its own image.</span>}
            </div>
          )}
          {headerVars.map((v) => (
            <input key={`hx-${v}`} className="form-input" style={{ marginTop: 6 }} placeholder={`Example for {{${v}}}`} value={draft.header.examples[v] || ''} onChange={(e) => setHeader({ examples: { ...draft.header.examples, [v]: e.target.value } })} />
          ))}
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="form-label">Body</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={insertVariable}><Plus size={13} /> Add variable</button>
          </div>
          <textarea className="form-input" rows={5} maxLength={1024} value={draft.body.text} placeholder="Hi {{1}}, your order {{2}} has shipped and should arrive by {{3}}. Reply here if you need help."
            onChange={(e) => setBody({ text: e.target.value })} />
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{draft.body.text.length}/1024 · Order, account, appointment or event updates only — no offers or promotions.</span>
          {bodyVars.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 6 }}>
              {bodyVars.map((v) => (
                <input key={`bx-${v}`} className="form-input" placeholder={`Example for {{${v}}}`} value={draft.body.examples[v] || ''} onChange={(e) => setBody({ examples: { ...draft.body.examples, [v]: e.target.value } })} />
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="form-label">Buttons (optional, up to 3)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={draft.buttons.length >= 3} onClick={() => set({ buttons: [...draft.buttons, { type: 'URL', text: '', url: 'https://', urlExample: '' }] })}><Link2 size={13} /> Link</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={draft.buttons.length >= 3} onClick={() => set({ buttons: [...draft.buttons, { type: 'POSTBACK', text: '' }] })}><CornerDownRight size={13} /> Reply</button>
            </div>
          </div>
          {draft.buttons.map((b, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: b.type === 'URL' ? '140px 1fr 150px 32px' : '140px 1fr 32px', gap: 8, alignItems: 'center' }}>
              <input className="form-input" maxLength={20} placeholder={b.type === 'URL' ? 'Track order' : 'Confirm'} value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} />
              {b.type === 'URL' ? (
                <>
                  <input className="form-input" placeholder="https://shop.com/orders/{{1}}" value={b.url} onChange={(e) => setButton(i, { url: e.target.value })} />
                  <input className="form-input" placeholder="Example ending" disabled={!/{{\s*1\s*}}$/.test(b.url || '')} value={b.urlExample || ''} onChange={(e) => setButton(i, { urlExample: e.target.value })} />
                </>
              ) : (
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Reply button — in a flow, each one gets its own next step (and Confirm / Cancel for COD).</span>
              )}
              <button type="button" className="btn btn-secondary btn-sm" aria-label="Remove button" onClick={() => set({ buttons: draft.buttons.filter((_, idx) => idx !== i) })}><X size={13} /></button>
            </div>
          ))}
        </div>

        {(check.errors.length > 0 || check.warnings.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {check.errors.map((e) => (
              <div key={e} style={{ display: 'flex', gap: 6, fontSize: '0.8rem', color: 'var(--danger)' }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {e}</div>
            ))}
            {check.warnings.map((w) => (
              <div key={w} style={{ display: 'flex', gap: 6, fontSize: '0.8rem', color: 'var(--warning)' }}><ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {w}</div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setDraft(EMPTY_DRAFT)}>Clear</button>
          <button type="button" className="btn btn-primary" disabled={saving || check.errors.length > 0 || !draft.name || !draft.body.text} onClick={submit}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <CheckCircle2 size={14} />} Submit to Meta
          </button>
        </div>
      </div>

      <div style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Preview</span>
        <TemplatePreview meta={previewMeta} values={exampleValues} headerImage={draft.header.imageUrl ? `${backendBase}${draft.header.imageUrl}` : null} />
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>Meta usually approves Utility templates within seconds. You'll see the status change here.</span>
      </div>
    </div>
  );
}

/* ── Library ─────────────────────────────────────────────────────────────── */
function LibraryPanel({ account, onCreated }) {
  const [q, setQ] = useState('');
  const [language, setLanguage] = useState('en');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);
  const [name, setName] = useState('');
  const [baseUrls, setBaseUrls] = useState({});
  const [saving, setSaving] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await messengerUtilityAPI.library(account.id, q, language);
      setItems(res.data.templates || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load Meta\'s template library');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [account.id, q, language]);

  useEffect(() => { search(); }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  const libButtons = (t) => (Array.isArray(t?.buttons) ? t.buttons : []);

  const use = async () => {
    setSaving(true);
    try {
      const buttonInputs = libButtons(picked).map((b, i) => ({ type: b.type, text: b.text, baseUrl: baseUrls[i] }));
      const res = await messengerUtilityAPI.createFromLibrary({ integrationId: account.id, name, language: picked.language || language, libraryTemplateName: picked.name, buttonInputs });
      notify.success(res.data.message);
      setPicked(null);
      onCreated?.();
    } catch (err) {
      showAlert.error('Not added', err?.response?.data?.message || 'Meta refused the template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search Meta's library, e.g. order, delivery, appointment" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        </div>
        <select className="form-input" style={{ width: 160 }} value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={search} disabled={loading}>{loading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={14} />} Search</button>
      </div>
      {error && <div className="card" style={{ padding: 14, color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</div>}
      {!loading && !error && items.length === 0 && <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>No library templates found — try another word.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {items.map((t) => (
          <div key={`${t.name}-${t.language}`} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{t.name}</strong>
              {t.topic && <span className="badge badge-muted">{t.topic}</span>}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{t.body}</div>
            {libButtons(t).length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{libButtons(t).map((b, i) => <span key={i} className="badge badge-primary">{b.text || b.type}</span>)}</div>}
            <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 'auto' }} onClick={() => { setPicked(t); setName(String(t.name || '').toLowerCase()); setBaseUrls({}); }}>
              <Plus size={13} /> Use this template
            </button>
          </div>
        ))}
      </div>

      {picked && (
        <div className="modal-overlay" onClick={() => !saving && setPicked(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add "{picked.name}" to this Page</div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Template name on your Page</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
            </div>
            {libButtons(picked).map((b, i) => (String(b.type).toUpperCase() === 'URL' ? (
              <div className="form-group" key={i} style={{ marginBottom: 12 }}>
                <label className="form-label">Link for "{b.text || 'button'}"</label>
                <input className="form-input" placeholder="https://yourshop.com/" value={baseUrls[i] || ''} onChange={(e) => setBaseUrls({ ...baseUrls, [i]: e.target.value })} />
              </div>
            ) : null))}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', padding: 10, borderRadius: 8, background: 'var(--bg-hover)' }}>{picked.body}</div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPicked(null)} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={use} disabled={saving || !name}>{saving ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <CheckCircle2 size={14} />} Add template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function FacebookUtilityTemplateManager({ selectedAccount }) {
  const [tab, setTab] = useUrlState('mtab', 'mine', { allowed: ['mine', 'library', 'create'] });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const accountId = selectedAccount?.id;

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    try {
      const res = await messengerUtilityAPI.list(accountId);
      setTemplates(res.data.templates || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load Utility templates');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const sync = useCallback(async (quiet = false) => {
    if (!accountId) return;
    setSyncing(true);
    try {
      const res = await messengerUtilityAPI.sync(accountId);
      if (!quiet) notify.success(res.data.message);
      await load();
    } catch (err) {
      if (!quiet) showAlert.error('Sync failed', err?.response?.data?.message || 'Meta refused the request');
    } finally {
      setSyncing(false);
    }
  }, [accountId, load]);

  useEffect(() => {
    if (!accountId) return;
    load().then(() => sync(true));
    messengerUtilityAPI.getStatus(accountId).then((res) => setStatus(res.data.utility)).catch(() => setStatus(null));
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live status (approved / rejected / paused) from the template webhook.
  useEffect(() => {
    if (!accountId) return undefined;
    let socket;
    try {
      socket = io(getSocketUrl(), { auth: socketAuth(), transports: ['websocket', 'polling'] });
      socket.on('messenger_template_update', (u) => { if (!u?.integrationId || Number(u.integrationId) === Number(accountId)) load(); });
    } catch { /* live updates unavailable — Sync still works */ }
    return () => { socket?.disconnect(); };
  }, [accountId, load]);

  const remove = async (t) => {
    const ok = await showAlert.confirm({ title: `Delete "${t.name}"?`, text: 'It is deleted from the Facebook Page on Meta too. Flows, broadcasts and store campaigns using it will stop sending it.', confirmButtonText: 'Delete' });
    if (!ok) return;
    try {
      await messengerUtilityAPI.remove(t.id);
      notify.success('Template deleted');
      load();
    } catch (err) {
      showAlert.error('Not deleted', err?.response?.data?.message || 'Meta refused the request');
    }
  };

  const filtered = templates.filter((t) => (statusFilter === 'ALL' || t.status === statusFilter)
    && (!searchTerm || `${t.name} ${t.meta?.bodyText || ''}`.toLowerCase().includes(searchTerm.toLowerCase())));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={22} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Messenger Utility Templates</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Order, account and appointment updates you can send to {selectedAccount?.fb_page_name || selectedAccount?.name || 'this Page'}'s subscribers at any time — even after the 24-hour window.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={tabBtn(tab === 'mine')} onClick={() => setTab('mine')}><FileText size={14} /> My templates</button>
          <button type="button" style={tabBtn(tab === 'library')} onClick={() => setTab('library')}><Library size={14} /> Meta library</button>
          <button type="button" style={tabBtn(tab === 'create')} onClick={() => setTab('create')}><Plus size={14} /> Create</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => sync(false)} disabled={syncing}><RefreshCw size={14} style={syncing ? { animation: 'spin 0.8s linear infinite' } : undefined} /> Sync</button>
        </div>
      </div>

      {status && !status.ok && (
        <div className="card" style={{ padding: 14, display: 'flex', gap: 10, borderColor: 'var(--warning)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-primary)' }}>This Page can't use Utility messages yet.</strong> {status.error}
            <div style={{ marginTop: 4 }}>Reconnect the Page (Connect Accounts → Facebook) and allow utility messaging when Facebook asks. Your Meta app needs the <code>pages_utility_messaging</code> permission.</div>
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <>
          <div className="card" style={{ padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Search templates…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select className="form-input" style={{ width: 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {['ALL', 'APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'].map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
          ) : error ? (
            <div className="card" style={{ padding: 16, color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <FileText size={32} style={{ color: 'var(--text-muted)' }} />
              <h3 style={{ margin: '10px 0 6px', fontSize: '1rem', color: 'var(--text-primary)' }}>{templates.length ? 'No template matches' : 'No Utility templates yet'}</h3>
              <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>Copy one from Meta's pre-approved library, or write your own.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setTab('library')}><Library size={14} /> Browse library</button>
                <button type="button" className="btn btn-primary" onClick={() => setTab('create')}><Plus size={14} /> Create template</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {filtered.map((t) => {
                const reasonKey = String(t.rejection_reason || '').toUpperCase();
                return (
                  <div key={t.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{t.name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{t.language} · {t.parameter_format === 'NAMED' ? 'named variables' : 'numbered variables'}{t.source === 'LIBRARY' ? ' · from Meta library' : ''}</div>
                      </div>
                      <span className={`badge ${STATUS_BADGE[t.status] || 'badge-muted'}`}>{t.status}</span>
                    </div>
                    <TemplatePreview meta={t.meta} />
                    {t.status === 'REJECTED' && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--danger)', display: 'flex', gap: 6, lineHeight: 1.45 }}>
                        <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span><strong>{t.rejection_reason || 'Rejected'}</strong>{REJECTION_HELP[reasonKey] ? ` — ${REJECTION_HELP[reasonKey]}` : ''}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(t)}><Trash2 size={13} /> Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'library' && <LibraryPanel account={selectedAccount} onCreated={() => { setTab('mine'); load(); }} />}
      {tab === 'create' && <CreateTemplateForm account={selectedAccount} onCreated={() => { setTab('mine'); load(); }} />}

      <style>{`@media (max-width: 900px) { .mut-create-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
