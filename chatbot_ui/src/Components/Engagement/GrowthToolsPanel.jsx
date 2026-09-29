import { useCallback, useEffect, useState } from 'react';
import { Plus, Copy, QrCode, Download, Trash2, Pencil, Loader2, Link2, Code2, X, Save } from 'lucide-react';
import { growthLinkAPI, flowAPI, labelAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';

/**
 * Bot Manager → Engagement → Growth Tools: trackable chat links + QR codes
 * that open a chat with this bot account and start one of its flows
 * (chatbot_api/utils/growthLinks.js). Each link counts clicks / QR scans,
 * chats started and new subscribers, and can add a label to everyone who
 * comes through it.
 */

const EMPTY_FORM = { name: '', flowId: '', labelId: '', prefillText: '' };
const num = (n) => Number(n || 0).toLocaleString();

const copyText = async (text, what) => {
  try { await navigator.clipboard.writeText(text); notify.success(`${what} copied`); } catch { notify.error('Copy failed — select and copy it by hand'); }
};

/** A floating "Chat with us" button for any website, pointing at the tracked link. */
const websiteButton = (url, platform) => {
  const colors = { WHATSAPP: '#25d366', FACEBOOK: '#0866ff', INSTAGRAM: '#e1306c', TELEGRAM: '#229ed9' };
  const bg = colors[platform] || '#2563eb';
  return `<a href="${url}" target="_blank" rel="noopener" style="position:fixed;right:20px;bottom:20px;z-index:9999;display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;background:${bg};color:#fff;font:600 15px/1 system-ui,sans-serif;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.18)">💬 Chat with us</a>`;
};

function QrDialog({ link, onClose }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null;
    growthLinkAPI.qr(link.id, 'png')
      .then((res) => { url = URL.createObjectURL(res.data); setSrc(url); })
      .catch(() => notify.error('Could not load the QR code'));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [link.id]);

  const download = async (format) => {
    try {
      const res = await growthLinkAPI.qr(link.id, format);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = `qr-${link.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || link.code}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { notify.error('Download failed'); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="QR code" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 20, width: 340, maxWidth: '100%', boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{link.name}</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={16} /></button>
        </div>
        <div style={{ width: 240, height: 240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 10, border: '1px solid var(--border)' }}>
          {src ? <img src={src} alt={`QR code for ${link.name}`} style={{ width: 228, height: 228 }} /> : <Loader2 size={20} className="animate-spin" />}
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', margin: '10px 0 14px' }}>Scans are counted as clicks. Print it on packaging, flyers, receipts or your shop window.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('png')}><Download size={13} /> PNG</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('svg')}><Download size={13} /> SVG (print)</button>
        </div>
      </div>
    </div>
  );
}

export default function GrowthToolsPanel({ account }) {
  const [data, setData] = useState(null);
  const [flows, setFlows] = useState([]);
  const [labels, setLabels] = useState([]);
  const [form, setForm] = useState(null); // null | { id?, ...fields }
  const [saving, setSaving] = useState(false);
  const [qrFor, setQrFor] = useState(null);

  const load = useCallback(() => {
    growthLinkAPI.list(account.id)
      .then((res) => setData(res.data))
      .catch(() => notify.error('Could not load the links'));
  }, [account.id]);

  useEffect(() => {
    load();
    flowAPI.getAll({ integrationId: account.id }).then((res) => setFlows(res.data?.flows || [])).catch(() => {});
    labelAPI.getAll().then((res) => setLabels(res.data?.labels || res.data || [])).catch(() => {});
  }, [account.id, load]);

  const platform = String(data?.platform || account.platform || '').toUpperCase();

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { notify.error('Give the link a name'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      flowId: form.flowId ? Number(form.flowId) : null,
      labelId: form.labelId ? Number(form.labelId) : null,
      prefillText: form.prefillText,
    };
    try {
      if (form.id) await growthLinkAPI.update(form.id, payload);
      else await growthLinkAPI.create({ ...payload, integrationId: account.id });
      notify.success(form.id ? 'Link updated' : 'Link created');
      setForm(null);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save the link');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (link) => {
    try { await growthLinkAPI.update(link.id, { isActive: !link.isActive }); load(); } catch { notify.error('Could not change it'); }
  };

  const remove = async (link) => {
    const ok = await showAlert.confirm({ title: `Delete "${link.name}"?`, text: 'The link and its QR code stop working, and its numbers are deleted.', confirmButtonText: 'Delete' });
    if (!ok) return;
    try { await growthLinkAPI.remove(link.id); notify.success('Link deleted'); load(); } catch { notify.error('Could not delete it'); }
  };

  if (!data) {
    return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;
  }

  if (!data.supported) {
    return (
      <div className="bm-content-card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>
        Chat links and QR codes work for WhatsApp, Messenger, Instagram and Telegram bot accounts.
      </div>
    );
  }

  return (
    <div className="bm-content-card">
      <div className="bm-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="bm-card-title">Growth Tools</h3>
          <p className="bm-card-sub">
            Links and QR codes that open a chat with {account.name || 'this bot'} and start the flow you choose — for your website, social bio, ads, packaging or shop window.
            Each one counts clicks, chats started and new subscribers.
          </p>
        </div>
        {!form && <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY_FORM })}><Plus size={14} /> New link</button>}
      </div>

      {form && (
        <form onSubmit={save} style={{ margin: '0 20px 16px', padding: 16, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-hover)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} maxLength={120} placeholder="e.g. Shop window QR" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Start this flow</label>
            <select className="form-input" value={form.flowId} onChange={(e) => setForm((f) => ({ ...f, flowId: e.target.value }))}>
              <option value="">— No flow (just open the chat) —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}{f.is_active ? '' : ' (off)'}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Add label</label>
            <select className="form-input" value={form.labelId} onChange={(e) => setForm((f) => ({ ...f, labelId: e.target.value }))}>
              <option value="">— None —</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {platform === 'WHATSAPP' && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Pre-filled message</label>
              <input className="form-input" value={form.prefillText} maxLength={300} placeholder={data.defaultPrefill} onChange={(e) => setForm((f) => ({ ...f, prefillText: e.target.value }))} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                WhatsApp opens with this text ready to send, followed by a short code like “(ref K7QM2PZX)” that tells the bot which link it was.
              </span>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {form.id ? 'Save' : 'Create link'}</button>
          </div>
        </form>
      )}

      {data.links.length === 0 && !form ? (
        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.84rem' }}>
          <Link2 size={26} style={{ opacity: 0.5, marginBottom: 6 }} />
          <div>No links yet. Create one to get a shareable link and a QR code.</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', padding: '0 20px 20px' }}>
          <table className="bm-table" style={{ width: '100%', minWidth: 760 }}>
            <thead>
              <tr>
                <th>Link</th><th>Starts flow</th><th style={{ textAlign: 'right' }}>Clicks</th><th style={{ textAlign: 'right' }}>Chats</th><th style={{ textAlign: 'right' }}>New</th><th>On</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.links.map((link) => (
                <tr key={link.id} style={{ opacity: link.isActive ? 1 : 0.6 }}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{link.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{link.shareUrl}</div>
                    {link.labelName && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Label: {link.labelName}</div>}
                    {!link.chatUrl && <div style={{ fontSize: '0.72rem', color: '#b45309' }}>This bot account has no public username / number yet, so the link can't open a chat.</div>}
                  </td>
                  <td>{link.flowName || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(link.clicks)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {num(link.starts)}
                    {link.clicks > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{Math.round((link.starts / link.clicks) * 100)}%</div>}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(link.newSubscribers)}</td>
                  <td>
                    <input type="checkbox" checked={link.isActive} onChange={() => toggle(link)} aria-label={link.isActive ? 'Switch the link off' : 'Switch the link on'} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="bm-row-action" title="Copy link" onClick={() => copyText(link.shareUrl, 'Link')}><Copy size={13} /></button>
                    <button type="button" className="bm-row-action" title="QR code" onClick={() => setQrFor(link)}><QrCode size={13} /></button>
                    <button type="button" className="bm-row-action" title="Copy website button code" onClick={() => copyText(websiteButton(link.shareUrl, platform), 'Website button code')}><Code2 size={13} /></button>
                    <button type="button" className="bm-row-action" title="Edit" onClick={() => setForm({ id: link.id, name: link.name, flowId: link.flowId || '', labelId: link.labelId || '', prefillText: link.prefillText || '' })}><Pencil size={13} /></button>
                    <button type="button" className="bm-row-action" title="Delete" onClick={() => remove(link)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(platform === 'FACEBOOK' || platform === 'INSTAGRAM') && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
              Someone who already chats with you is recognised through Meta's <code>messaging_referrals</code> webhook — make sure it's subscribed in your Meta app.
            </p>
          )}
        </div>
      )}

      {qrFor && <QrDialog link={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  );
}
