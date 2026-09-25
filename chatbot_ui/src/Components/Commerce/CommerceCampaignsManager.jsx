import { useState, useEffect, useMemo } from 'react';
import { commerceAPI, channelAPI, labelAPI, sequenceAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { Plus, Pencil, Trash2, Loader2, ShoppingCart, MessageCircle, Send, AlertTriangle, Clock } from 'lucide-react';

const EMPTY = {
  id: null,
  name: '',
  connectionId: '',
  triggerEvent: 'ORDER_CREATED',
  integrationId: '',
  templateId: '',
  variableMap: { header: {}, body: {}, buttons: {} },
  delayMinutes: 0,
  defaultCountryCode: '',
  labelId: '',
  sequenceId: '',
  codConfirmAction: 'NOTE',
  codCancelAction: 'CANCEL',
  codConfirmReply: '',
  codCancelReply: '',
  isActive: true,
};

const DEFAULT_DELAY = { ABANDONED_CART: 60, COD_VERIFICATION: 0 };
const CUSTOM = '__custom__';

function parseMap(value) {
  const m = typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
  return { header: m.header || {}, body: m.body || {}, buttons: m.buttons || {} };
}

/** One template placeholder → a store field, or custom text ("text:…"). */
function SourcePicker({ value, onChange, fields }) {
  const isCustom = typeof value === 'string' && value.startsWith('text:');
  return (
    <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
      <select
        className="form-input"
        style={{ flex: '1 1 180px', minWidth: 0 }}
        value={isCustom ? CUSTOM : value || ''}
        onChange={(e) => onChange(e.target.value === CUSTOM ? 'text:' : e.target.value)}
      >
        <option value="">Choose a value…</option>
        {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        <option value={CUSTOM}>Custom text…</option>
      </select>
      {isCustom && (
        <input
          className="form-input"
          style={{ flex: '1 1 160px', minWidth: 0 }}
          placeholder="Text to send"
          maxLength={200}
          value={value.slice(5)}
          onChange={(e) => onChange(`text:${e.target.value}`)}
        />
      )}
    </div>
  );
}

function CampaignEditor({ initial, meta, connections, whatsappAccounts, labels, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [sequences, setSequences] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const connection = connections.find((c) => String(c.id) === String(form.connectionId));
  const triggers = meta.triggers.filter((t) => t.id !== 'ORDER_DELIVERED' || connection?.platform !== 'WOOCOMMERCE');
  const trigger = meta.triggers.find((t) => t.id === form.triggerEvent);
  const isCart = form.triggerEvent === 'ABANDONED_CART';
  const isCod = form.triggerEvent === 'COD_VERIFICATION';
  const fields = meta.fields.filter((f) => !f.scope || (f.scope === 'cart') === isCart);
  const template = templates.find((t) => String(t.id) === String(form.templateId));
  const ph = template?.placeholders;

  useEffect(() => {
    if (!form.integrationId) { setTemplates([]); setSequences([]); return; }
    setTemplatesLoading(true);
    commerceAPI.getTemplates(form.integrationId)
      .then((res) => setTemplates(res.data?.templates || []))
      .catch(() => notify.error('Failed to load templates'))
      .finally(() => setTemplatesLoading(false));
    sequenceAPI.getAll({ integrationId: form.integrationId })
      .then((res) => setSequences(res.data?.sequences || []))
      .catch(() => setSequences([]));
  }, [form.integrationId]);

  const setSource = (section, key, value) =>
    setForm((f) => ({ ...f, variableMap: { ...f.variableMap, [section]: { ...f.variableMap[section], [key]: value } } }));

  const changeTrigger = (id) => {
    const scopeChanged = (id === 'ABANDONED_CART') !== isCart;
    set({
      triggerEvent: id,
      ...(form.id ? {} : { delayMinutes: DEFAULT_DELAY[id] ?? 0 }),
      // cart and order campaigns have different fields; drop mappings that no longer apply
      ...(scopeChanged ? { variableMap: { header: {}, body: {}, buttons: {} } } : {}),
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      connectionId: Number(form.connectionId),
      integrationId: Number(form.integrationId),
      templateId: Number(form.templateId),
      delayMinutes: Number(form.delayMinutes) || 0,
      labelId: form.labelId ? Number(form.labelId) : null,
      sequenceId: form.sequenceId ? Number(form.sequenceId) : null,
    };
    try {
      const res = form.id ? await commerceAPI.updateCampaign(form.id, payload) : await commerceAPI.createCampaign(payload);
      notify.success(res.data?.message || 'Campaign saved');
      onSaved();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to save the campaign');
    } finally {
      setSaving(false);
    }
  };

  const hasMapping = ph && (ph.header.length || ph.body.length || ph.buttons.some((b) => b.dynamic));

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 680, width: '100%', maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{form.id ? 'Edit campaign' : 'New commerce campaign'}</div>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Campaign name *</label>
            <input className="form-input" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={150} required placeholder="e.g. COD confirmation" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Store *</label>
              <select className="form-input" value={form.connectionId} onChange={(e) => set({ connectionId: e.target.value })} required>
                <option value="">Choose a store…</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.store_name || c.store_domain} ({c.platform === 'SHOPIFY' ? 'Shopify' : 'WooCommerce'})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Trigger *</label>
              <select className="form-input" value={form.triggerEvent} onChange={(e) => changeTrigger(e.target.value)}>
                {triggers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {trigger && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -6 }}>{trigger.description}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">WhatsApp account *</label>
              <select className="form-input" value={form.integrationId} onChange={(e) => set({ integrationId: e.target.value, templateId: '', sequenceId: '', variableMap: { header: {}, body: {}, buttons: {} } })} required>
                <option value="">Choose an account…</option>
                {whatsappAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.wa_display_phone || `Account #${a.id}`}{a.wa_display_phone && a.name ? ` (${a.wa_display_phone})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Message template *</label>
              <select
                className="form-input"
                value={form.templateId}
                onChange={(e) => set({ templateId: e.target.value, variableMap: { header: {}, body: {}, buttons: {} } })}
                disabled={!form.integrationId || templatesLoading}
                required
              >
                <option value="">{templatesLoading ? 'Loading…' : form.integrationId ? (templates.length ? 'Choose an approved template…' : 'No approved templates') : 'Choose the account first'}</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name} ({t.language})</option>)}
              </select>
            </div>
          </div>

          {template && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-hover)', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
              {template.header_type === 'TEXT' && template.header_text && <div style={{ fontWeight: 700, marginBottom: 4 }}>{template.header_text}</div>}
              {template.body_text}
              {ph.buttons.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {ph.buttons.map((b) => <span key={b.index} className="badge badge-muted">{b.text}</span>)}
                </div>
              )}
              {isCod && ph.quickReplyCount < 2 && (
                <div style={{ marginTop: 8, color: 'var(--danger)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <AlertTriangle size={13} /> COD verification needs a template with two quick-reply buttons: the first confirms, the second cancels.
                </div>
              )}
            </div>
          )}

          {hasMapping && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="form-label" style={{ marginBottom: 0 }}>Template variables</div>
              {[['header', 'Header'], ['body', 'Body']].flatMap(([section, label]) => ph[section].map((p) => (
                <div key={`${section}-${p}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <code style={{ minWidth: 90, fontSize: '0.75rem' }}>{label} {`{{${p}}}`}</code>
                  <SourcePicker value={form.variableMap[section]?.[p]} onChange={(v) => setSource(section, p, v)} fields={fields} />
                </div>
              )))}
              {ph.buttons.filter((b) => b.dynamic).map((b) => (
                <div key={`btn-${b.index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <code style={{ minWidth: 90, fontSize: '0.75rem' }} title={b.url}>Button “{b.text}”</code>
                  <SourcePicker value={form.variableMap.buttons?.[b.index]} onChange={(v) => setSource('buttons', b.index, v)} fields={fields} />
                </div>
              ))}
              {ph.buttons.some((b) => b.dynamic) && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  A link button only fills in the part after its fixed URL — use the “… URL path” values when the template's link is your store's address followed by {'{{1}}'}.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Send after (minutes)</label>
              <input className="form-input" type="number" min={isCart ? 10 : 0} max={10080} value={form.delayMinutes} onChange={(e) => set({ delayMinutes: e.target.value })} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {isCart ? 'Counted from the customer\'s last checkout activity. 30–120 minutes works best.' : '0 = as soon as the order is seen (about a minute).'}
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">Default country code</label>
              <input className="form-input" placeholder="e.g. 880" value={form.defaultCountryCode} onChange={(e) => set({ defaultCountryCode: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Added to phone numbers typed without one (e.g. 017… → 88017…).</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Assign label (optional)</label>
              <select className="form-input" value={form.labelId || ''} onChange={(e) => set({ labelId: e.target.value })}>
                <option value="">No label</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start sequence (optional)</label>
              <select className="form-input" value={form.sequenceId || ''} onChange={(e) => set({ sequenceId: e.target.value })} disabled={!form.integrationId}>
                <option value="">No sequence</option>
                {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {isCod && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-label" style={{ marginBottom: 0 }}>When the customer answers</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">On Confirm</label>
                  <select className="form-input" value={form.codConfirmAction} onChange={(e) => set({ codConfirmAction: e.target.value })}>
                    <option value="NOTE">{connection?.platform === 'WOOCOMMERCE' ? 'Add an order note only' : 'Tag the order "COD Confirmed"'}</option>
                    {connection?.platform === 'WOOCOMMERCE' && <option value="PROCESSING">Add a note and set status to Processing</option>}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">On Cancel</label>
                  <select className="form-input" value={form.codCancelAction} onChange={(e) => set({ codCancelAction: e.target.value })}>
                    <option value="CANCEL">Cancel the order in the store</option>
                    <option value="NOTE">{connection?.platform === 'WOOCOMMERCE' ? 'Add an order note only' : 'Tag the order "COD Cancelled" only'}</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reply after Confirm</label>
                <textarea className="form-input" rows={2} maxLength={1000} value={form.codConfirmReply || ''} onChange={(e) => set({ codConfirmReply: e.target.value })} placeholder="Thank you! Your order {{order_number}} is confirmed and will be shipped soon." />
              </div>
              <div className="form-group">
                <label className="form-label">Reply after Cancel</label>
                <textarea className="form-input" rows={2} maxLength={1000} value={form.codCancelReply || ''} onChange={(e) => set({ codCancelReply: e.target.value })} placeholder="Your order {{order_number}} has been cancelled. Reply here if this was a mistake." />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                You can use {'{{customer_first_name}}'}, {'{{order_number}}'}, {'{{total}}'} and the other value names in these replies.
              </span>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
            Active
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Automation → Commerce → Automation Campaigns: order notifications, COD
 * verification and abandoned-cart recovery over WhatsApp templates.
 * Engine: chatbot_api/utils/commerceEvents.js.
 */
export default function CommerceCampaignsManager({ onOpenStores }) {
  const [meta, setMeta] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [connections, setConnections] = useState([]);
  const [whatsappAccounts, setWhatsappAccounts] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      commerceAPI.getMeta(),
      commerceAPI.getCampaigns(),
      commerceAPI.getConnections(),
      channelAPI.getWhatsApp().catch(() => ({ data: { accounts: [] } })),
      labelAPI.getAll().catch(() => ({ data: { labels: [] } })),
    ])
      .then(([m, c, s, w, l]) => {
        setMeta(m.data);
        setCampaigns(c.data?.campaigns || []);
        setConnections(s.data?.connections || []);
        setWhatsappAccounts((w.data?.accounts || []).filter((a) => a.is_active !== 0));
        setLabels(l.data?.labels || []);
      })
      .catch(() => notify.error('Failed to load commerce campaigns'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const triggerLabel = useMemo(() => Object.fromEntries((meta?.triggers || []).map((t) => [t.id, t.label])), [meta]);

  const openNew = () => setEditing({ ...EMPTY, connectionId: connections[0]?.id || '', integrationId: whatsappAccounts.length === 1 ? whatsappAccounts[0].id : '' });
  const openEdit = (c) => setEditing({
    id: c.id,
    name: c.name,
    connectionId: c.connection_id,
    triggerEvent: c.trigger_event,
    integrationId: c.integration_id,
    templateId: c.template_id,
    variableMap: parseMap(c.variable_map),
    delayMinutes: c.delay_minutes,
    defaultCountryCode: c.default_country_code || '',
    labelId: c.label_id || '',
    sequenceId: c.sequence_id || '',
    codConfirmAction: c.cod_confirm_action,
    codCancelAction: c.cod_cancel_action,
    codConfirmReply: c.cod_confirm_reply || '',
    codCancelReply: c.cod_cancel_reply || '',
    isActive: Boolean(c.is_active),
  });

  const toggle = async (c) => {
    try {
      const res = await commerceAPI.toggleCampaign(c.id, !c.is_active);
      notify.success(res.data?.message);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to update');
    }
  };

  const remove = async (c) => {
    const ok = await showAlert.confirm({ title: `Delete "${c.name}"?`, text: 'Messages already queued by it are not sent.', confirmButtonText: 'Yes, delete' });
    if (!ok) return;
    try {
      await commerceAPI.deleteCampaign(c.id);
      notify.success('Campaign deleted');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  if (loading || !meta) return <div className="loading-overlay"><div className="loading-spinner" /></div>;

  if (!connections.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><ShoppingCart size={28} /></div>
        <div className="empty-title">Connect a store first</div>
        <div className="empty-desc">Campaigns run on orders and checkouts from a connected Shopify or WooCommerce store.</div>
        {onOpenStores && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onOpenStores}>Go to Store Connections</button>}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 580 }}>
          Each campaign sends one approved WhatsApp template when something happens in your store. Templates are required because store customers usually haven't messaged you in the last 24 hours.
        </p>
        <button className="btn btn-primary" onClick={openNew} disabled={!whatsappAccounts.length} title={whatsappAccounts.length ? '' : 'Connect a WhatsApp account first'}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><MessageCircle size={28} /></div>
          <div className="empty-title">No campaigns yet</div>
          <div className="empty-desc">Create one for new orders, COD verification or abandoned carts.</div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Store / Account</th>
                <th>Template</th>
                <th>Results</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium">{c.name}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {triggerLabel[c.trigger_event] || c.trigger_event}
                      {c.delay_minutes > 0 && <><Clock size={11} /> {c.delay_minutes} min</>}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {c.store_label || c.store_domain}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.integration_name || `WhatsApp #${c.integration_id}`}</div>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{c.template_name || <span style={{ color: 'var(--danger)' }}>Template missing</span>}</td>
                  <td style={{ fontSize: '0.78rem' }}>
                    <span title="Sent" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 8 }}><Send size={11} /> {c.sentCount}</span>
                    {Number(c.failedCount) > 0 && <span title="Failed" style={{ color: 'var(--danger)', marginRight: 8 }}>{c.failedCount} failed</span>}
                    {Number(c.scheduledCount) > 0 && <span title="Waiting" style={{ color: 'var(--text-muted)' }}>{c.scheduledCount} waiting</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <label title={c.is_active ? 'Active' : 'Paused'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={Boolean(c.is_active)} onChange={() => toggle(c)} />
                        {c.is_active ? 'Active' : 'Paused'}
                      </label>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)} title="Edit"><Pencil size={12} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(c)} title="Delete"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <CampaignEditor
          initial={editing}
          meta={meta}
          connections={connections}
          whatsappAccounts={whatsappAccounts}
          labels={labels}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}
