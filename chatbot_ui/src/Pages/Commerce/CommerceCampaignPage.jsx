import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { commerceAPI, channelAPI, labelAPI, sequenceAPI, storeTemplateAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  ArrowLeft, ShoppingCart, MessageCircle, AlertTriangle, Loader2, Save, Sparkles, Clock, RefreshCw, Plus,
  CheckCircle2, XCircle, Settings2, ListChecks,
} from 'lucide-react';

/**
 * Automation → Commerce → a campaign, as a full page (was a modal):
 *   /commerce/campaigns/new?account=<integrationId>&returnTo=…
 *   /commerce/campaigns/:id?returnTo=…
 *
 * Picking a trigger picks that trigger's default store template
 * (chatbot_api/utils/storeTemplatePresets.js) when it's approved, and every
 * template variable named after a store value is filled in by itself
 * (`suggested_map` from GET /commerce/templates). A missing default can be
 * created right here; it's usable once Meta approves it.
 */

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
  codConfirmReply: '✅ Thank you, {{customer_first_name}}! Your order {{order_number}} is confirmed and will be shipped soon.',
  codCancelReply: 'Your order {{order_number}} has been cancelled. If this was a mistake, just reply to this message.',
  isActive: true,
};
const EMPTY_MAP = { header: {}, body: {}, buttons: {} };
const DEFAULT_DELAY = { ABANDONED_CART: 60, COD_VERIFICATION: 0 };
const CUSTOM = '__custom__';

// Only same-app paths are followed back (never another site / protocol-relative URL).
function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/bots?cat=commerce&tab=commerceCampaigns';
}

function parseMap(value) {
  let m = value;
  if (typeof value === 'string') {
    try { m = JSON.parse(value || '{}'); } catch { m = {}; }
  }
  m = m || {};
  return { header: m.header || {}, body: m.body || {}, buttons: m.buttons || {} };
}

/** Existing choices win; anything left empty takes the automatic match. */
function mergeMaps(current, suggested) {
  const out = parseMap(current);
  for (const section of ['header', 'body', 'buttons']) {
    for (const [k, v] of Object.entries(suggested?.[section] || {})) if (!out[section][k]) out[section][k] = v;
  }
  return out;
}

function Card({ icon, title, children, aside }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{icon} {title}</div>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** One template placeholder → a store field, or custom text ("text:…"). */
function SourcePicker({ value, onChange, fields, auto }) {
  const isCustom = typeof value === 'string' && value.startsWith('text:');
  return (
    <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap', alignItems: 'center' }}>
      <select
        className="form-input"
        style={{ flex: '1 1 200px', minWidth: 0 }}
        value={isCustom ? CUSTOM : value || ''}
        onChange={(e) => onChange(e.target.value === CUSTOM ? 'text:' : e.target.value)}
      >
        <option value="">Choose a value…</option>
        {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        <option value={CUSTOM}>Custom text…</option>
      </select>
      {isCustom && (
        <input className="form-input" style={{ flex: '1 1 160px', minWidth: 0 }} placeholder="Text to send" maxLength={200} value={value.slice(5)} onChange={(e) => onChange(`text:${e.target.value}`)} />
      )}
      {auto && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', fontWeight: 700, color: '#059669' }}>
          <Sparkles size={11} /> Auto
        </span>
      )}
    </div>
  );
}

const STATUS_TEXT = { PENDING: 'in review at Meta', IN_APPEAL: 'in appeal at Meta', REJECTED: 'rejected by Meta', PAUSED: 'paused by Meta', DISABLED: 'disabled by Meta' };

/** The trigger's default template: use it, create it, or wait for Meta. */
function DefaultTemplateBox({ preset, selectedIsDefault, busy, onCreate, onRefresh, onUseDefault, approvedDefault }) {
  if (!preset) return null;
  const tpl = preset.template;
  const tone = { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 12 };
  if (tpl?.status === 'APPROVED') {
    if (selectedIsDefault) {
      return (
        <div style={{ ...tone, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--text-secondary)' }}>
          <CheckCircle2 size={15} style={{ color: '#059669', flexShrink: 0, marginTop: 2 }} />
          <span>Using the default <b>{preset.title}</b> template — its details are filled in automatically.</span>
        </div>
      );
    }
    return approvedDefault ? (
      <div style={{ ...tone, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span>A default <b>{preset.title}</b> template is ready for this trigger.</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onUseDefault}><Sparkles size={12} /> Use it</button>
      </div>
    ) : null;
  }
  if (tpl && tpl.status !== 'REJECTED') {
    return (
      <div style={{ ...tone, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.35)', color: 'var(--text-secondary)', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 8 }}><Clock size={15} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
          <span>The default <b>{preset.title}</b> template is {STATUS_TEXT[tpl.status] || 'waiting for Meta'}. Utility templates are usually approved within minutes — it's picked here automatically once approved.</span>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={busy}>{busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Check status</button>
      </div>
    );
  }
  return (
    <div style={{ ...tone, background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)', color: 'var(--text-secondary)', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', gap: 8 }}>
        {tpl ? <XCircle size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} /> : <Sparkles size={15} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />}
        <span>
          {tpl
            ? <>The default <b>{preset.title}</b> template was rejected by Meta. You can send it for review again.</>
            : <>No <b>{preset.title}</b> template on this number yet. Create the ready-made one in one click — it's sent to Meta for review.</>}
        </span>
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={onCreate} disabled={busy}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} {tpl ? 'Send again' : 'Create default template'}</button>
    </div>
  );
}

export default function CommerceCampaignPage() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const fixedAccountId = searchParams.get('account') || '';

  const [meta, setMeta] = useState(null);
  const [connections, setConnections] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [labels, setLabels] = useState([]);
  const [form, setForm] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [presets, setPresets] = useState(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [sequences, setSequences] = useState([]);
  const [saving, setSaving] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  // A person's own template choice / name is never overridden by the automatic pick.
  const [templateTouched, setTemplateTouched] = useState(Boolean(editId));
  const [nameTouched, setNameTouched] = useState(Boolean(editId));
  const editMerged = useRef(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Everything the form needs, plus the campaign when editing.
  useEffect(() => {
    Promise.all([
      commerceAPI.getMeta(),
      commerceAPI.getConnections(),
      channelAPI.getWhatsApp().catch(() => ({ data: { accounts: [] } })),
      channelAPI.getFacebook().catch(() => ({ data: { pages: [] } })),
      labelAPI.getAll().catch(() => ({ data: { labels: [] } })),
      editId ? commerceAPI.getCampaign(editId) : Promise.resolve(null),
    ])
      .then(([m, s, w, fb, l, c]) => {
        setMeta(m.data);
        const conns = s.data?.connections || [];
        setConnections(conns);
        const accs = [
          ...(w.data?.accounts || []).filter((a) => a.is_active !== 0).map((a) => ({ ...a, platform: a.platform || 'WHATSAPP' })),
          ...(fb.data?.pages || []).filter((p) => p.is_active !== 0).map((p) => ({ ...p, platform: 'FACEBOOK' })),
        ];
        setAccounts(accs);
        setLabels(l.data?.labels || []);
        if (c) {
          const x = c.data.campaign;
          setForm({
            id: x.id, name: x.name, connectionId: x.connection_id, triggerEvent: x.trigger_event, integrationId: x.integration_id,
            templateId: x.template_id, variableMap: parseMap(x.variable_map), delayMinutes: x.delay_minutes,
            defaultCountryCode: x.default_country_code || '', labelId: x.label_id || '', sequenceId: x.sequence_id || '',
            codConfirmAction: x.cod_confirm_action, codCancelAction: x.cod_cancel_action,
            codConfirmReply: x.cod_confirm_reply || '', codCancelReply: x.cod_cancel_reply || '', isActive: Boolean(x.is_active),
          });
        } else {
          const first = m.data.triggers[0];
          setForm({
            ...EMPTY,
            name: first?.label || '',
            triggerEvent: first?.id || 'ORDER_CREATED',
            connectionId: conns[0]?.id || '',
            integrationId: fixedAccountId || (accs.length === 1 ? accs[0].id : ''),
          });
        }
      })
      .catch((err) => notify.error(err.response?.data?.message || 'Failed to load the campaign'));
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTemplates = useCallback((integrationId) => {
    if (!integrationId) { setTemplates([]); setPresets(null); return Promise.resolve(); }
    setTemplatesLoading(true);
    return commerceAPI.getTemplates(integrationId)
      .then((res) => { setTemplates(res.data?.templates || []); setPresets(res.data?.presets || null); })
      .catch(() => notify.error('Failed to load templates'))
      .finally(() => setTemplatesLoading(false));
  }, []);

  useEffect(() => {
    if (!form?.integrationId) { setTemplates([]); setPresets(null); setSequences([]); return; }
    loadTemplates(form.integrationId);
    sequenceAPI.getAll({ integrationId: form.integrationId })
      .then((res) => setSequences(res.data?.sequences || []))
      .catch(() => setSequences([]));
  }, [form?.integrationId, loadTemplates]);

  const connection = form && connections.find((c) => String(c.id) === String(form.connectionId));
  const account = form && accounts.find((a) => String(a.id) === String(form.integrationId));
  const isMessenger = String(account?.platform || '').toUpperCase() === 'FACEBOOK';
  const triggers = useMemo(() => (meta?.triggers || [])
    .filter((t) => t.id !== 'ORDER_DELIVERED' || connection?.platform !== 'WOOCOMMERCE')
    .filter((t) => !isMessenger || t.id !== 'ABANDONED_CART'), [meta, connection, isMessenger]);
  const triggerGroups = useMemo(() => {
    const groups = [];
    for (const t of triggers) {
      const g = groups.find((x) => x.name === t.group);
      if (g) g.items.push(t); else groups.push({ name: t.group, items: [t] });
    }
    return groups;
  }, [triggers]);
  const trigger = meta?.triggers.find((t) => t.id === form?.triggerEvent);
  const isCart = form?.triggerEvent === 'ABANDONED_CART';
  const isCod = form?.triggerEvent === 'COD_VERIFICATION';
  const fields = (meta?.fields || []).filter((f) => !f.scope || (f.scope === 'cart') === isCart);
  const template = templates.find((t) => String(t.id) === String(form?.templateId));
  const ph = template?.placeholders;
  const preset = presets?.find((p) => p.trigger === form?.triggerEvent) || null;
  const approvedDefault = templates.find((t) => t.preset_key === form?.triggerEvent) || null;

  // The trigger's approved default template is picked (and its variables matched)
  // until the person chooses a template themselves.
  useEffect(() => {
    if (!form || templateTouched || templatesLoading || isMessenger) return;
    const next = approvedDefault ? String(approvedDefault.id) : '';
    if (String(form.templateId || '') === next) return;
    set({ templateId: next, variableMap: approvedDefault ? approvedDefault.suggested_map : EMPTY_MAP });
  }, [approvedDefault, templateTouched, templatesLoading, isMessenger, form?.triggerEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Editing: variables the saved campaign left empty take the automatic match (once).
  useEffect(() => {
    if (!editId || editMerged.current || !template) return;
    editMerged.current = true;
    set({ variableMap: mergeMaps(form.variableMap, template.suggested_map) });
  }, [template]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeTrigger = (id) => {
    const t = meta.triggers.find((x) => x.id === id);
    setTemplateTouched(false);
    set({
      triggerEvent: id,
      ...(form.id ? {} : { delayMinutes: DEFAULT_DELAY[id] ?? 0 }),
      ...(nameTouched ? {} : { name: t?.label || form.name }),
    });
  };

  const chooseTemplate = (value) => {
    const t = templates.find((x) => String(x.id) === String(value));
    setTemplateTouched(true);
    set({ templateId: value, variableMap: t?.suggested_map || EMPTY_MAP });
  };

  const useDefault = () => {
    setTemplateTouched(false);
    if (approvedDefault) set({ templateId: String(approvedDefault.id), variableMap: approvedDefault.suggested_map });
  };

  const createDefault = async () => {
    if (!preset) return;
    setPresetBusy(true);
    try {
      const res = await storeTemplateAPI.create(form.integrationId, [preset.key]);
      const r = (res.data.results || [])[0];
      if (r?.ok) notify.success(r.status === 'APPROVED' ? 'Template approved and selected' : 'Template sent to Meta for review');
      else notify.error(r?.message || 'Meta refused the template');
      setTemplateTouched(false);
      await loadTemplates(form.integrationId);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Meta refused the template');
    } finally {
      setPresetBusy(false);
    }
  };

  const refreshDefault = async () => {
    setPresetBusy(true);
    try {
      await storeTemplateAPI.refresh(form.integrationId);
      setTemplateTouched(false);
      await loadTemplates(form.integrationId);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not reach Meta');
    } finally {
      setPresetBusy(false);
    }
  };

  const setSource = (section, key, value) =>
    setForm((f) => ({ ...f, variableMap: { ...f.variableMap, [section]: { ...f.variableMap[section], [key]: value } } }));

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
      navigate(returnTo);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to save the campaign');
      setSaving(false);
    }
  };

  const goBack = () => navigate(returnTo);
  const hasMapping = ph && (ph.header.length || ph.body.length || ph.buttons.some((b) => b.dynamic));
  const autoCount = hasMapping ? [...ph.header.map((p) => ['header', p]), ...ph.body.map((p) => ['body', p])].filter(([s, p]) => form.variableMap[s]?.[p] === p).length : 0;
  const fixedAccount = fixedAccountId && account && String(account.id) === String(fixedAccountId);

  const header = (
    <>
      <button type="button" onClick={goBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, marginBottom: 14, color: 'var(--text-tertiary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
        <ArrowLeft size={14} /> Automation Campaigns
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
          <ShoppingCart size={20} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{editId ? `Edit ${form?.name || 'campaign'}` : 'New store campaign'}</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Sends an approved template when something happens in your store. The right template and its details are chosen for you from the trigger.
          </p>
        </div>
      </div>
    </>
  );

  if (!meta || !form) {
    return <AppLayout><div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 20px 40px' }}>{header}<div className="loading-overlay"><div className="loading-spinner" /></div></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 20px 40px' }}>
        {header}
        <form onSubmit={handleSave}>
          <Card icon={<Settings2 size={17} />} title="Trigger & store">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Trigger *</label>
                <select className="form-input" value={form.triggerEvent} onChange={(e) => changeTrigger(e.target.value)}>
                  {triggerGroups.map((g) => (g.items.length === 1 && g.items[0].label === g.name
                    ? <option key={g.name} value={g.items[0].id}>{g.items[0].label}</option>
                    : (
                      <optgroup key={g.name} label={g.name}>
                        {g.items.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </optgroup>
                    )))}
                </select>
                {trigger && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{trigger.description}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Store *</label>
                <select className="form-input" value={form.connectionId} onChange={(e) => set({ connectionId: e.target.value })} required>
                  <option value="">Choose a store…</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || c.store_name || c.store_domain} ({c.platform === 'SHOPIFY' ? 'Shopify' : 'WooCommerce'})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 4 }}>
              <label className="form-label">Campaign name *</label>
              <input className="form-input" value={form.name} onChange={(e) => { setNameTouched(true); set({ name: e.target.value }); }} maxLength={150} required placeholder="e.g. COD confirmation" />
            </div>
          </Card>

          <Card icon={<MessageCircle size={17} />} title="Message">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Send from *</label>
                {fixedAccount ? (
                  <div style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, minHeight: 38 }}>
                    <span style={{ color: '#10b981' }}>●</span>
                    {isMessenger ? 'Messenger · ' : 'WhatsApp · '}{account.name || account.fb_page_name || account.wa_display_phone || `Account #${account.id}`}
                  </div>
                ) : (
                  <select className="form-input" value={form.integrationId} onChange={(e) => { setTemplateTouched(false); set({ integrationId: e.target.value, templateId: '', sequenceId: '', variableMap: EMPTY_MAP }); }} required>
                    <option value="">Choose an account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {String(a.platform).toUpperCase() === 'FACEBOOK' ? 'Messenger · ' : 'WhatsApp · '}
                        {a.name || a.fb_page_name || a.wa_display_phone || `Account #${a.id}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{isMessenger ? 'Utility template *' : 'Message template *'}</label>
                <select className="form-input" value={form.templateId} onChange={(e) => chooseTemplate(e.target.value)} disabled={!form.integrationId || templatesLoading} required>
                  <option value="">{templatesLoading ? 'Loading…' : form.integrationId ? (templates.length ? 'Choose an approved template…' : 'No approved templates yet') : 'Choose the account first'}</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.preset_key === form.triggerEvent ? '★ ' : ''}{t.template_name} ({t.language})</option>)}
                </select>
              </div>
            </div>

            {!isMessenger && form.integrationId && !templatesLoading && (
              <DefaultTemplateBox
                preset={preset}
                selectedIsDefault={Boolean(approvedDefault) && String(approvedDefault.id) === String(form.templateId)}
                approvedDefault={approvedDefault}
                busy={presetBusy}
                onCreate={createDefault}
                onRefresh={refreshDefault}
                onUseDefault={useDefault}
              />
            )}

            {template && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-hover)', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                {template.header_type === 'TEXT' && template.header_text && <div style={{ fontWeight: 700, marginBottom: 4 }}>{template.header_text}</div>}
                {template.body_text}
                {template.footer_text && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>{template.footer_text}</div>}
                {ph.buttons.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {ph.buttons.map((b) => <span key={b.index} className="badge badge-muted">{b.text}</span>)}
                  </div>
                )}
                {isCod && ph.quickReplyCount < 2 && (
                  <div style={{ marginTop: 8, color: 'var(--danger)', display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'normal' }}>
                    <AlertTriangle size={13} /> {isMessenger
                      ? 'COD verification needs a Utility template with two Reply buttons created in this app (Bot Manager → Message Templates): the first confirms, the second cancels.'
                      : 'COD verification needs a template with two quick-reply buttons: the first confirms, the second cancels.'}
                  </div>
                )}
              </div>
            )}

            {isMessenger && (
              <div style={{ display: 'flex', gap: 8, fontSize: '0.76rem', color: 'var(--text-secondary)', padding: '10px 12px', borderRadius: 8, background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)', lineHeight: 1.5, marginTop: 12 }}>
                <MessageCircle size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--primary)' }} />
                <span>
                  Messenger can only reach customers who have already messaged this Page. Each order is matched to a Page subscriber by its <strong>email</strong> or <strong>phone</strong>. Orders with no matching subscriber are skipped and shown in Orders &amp; Activity.
                </span>
              </div>
            )}
          </Card>

          {hasMapping && (
            <Card
              icon={<Sparkles size={17} />}
              title="Template variables"
              aside={autoCount > 0 && <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#059669' }}>{autoCount} matched automatically</span>}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['header', 'Header'], ['body', 'Body']].flatMap(([section, label]) => ph[section].map((p) => (
                  <div key={`${section}-${p}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <code style={{ minWidth: 190, fontSize: '0.75rem' }}>{label} {`{{${p}}}`}</code>
                    <SourcePicker value={form.variableMap[section]?.[p]} onChange={(v) => setSource(section, p, v)} fields={fields} auto={form.variableMap[section]?.[p] === p} />
                  </div>
                )))}
                {ph.buttons.filter((b) => b.dynamic).map((b) => (
                  <div key={`btn-${b.index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <code style={{ minWidth: 190, fontSize: '0.75rem' }} title={b.url}>Button “{b.text}”</code>
                    <SourcePicker value={form.variableMap.buttons?.[b.index]} onChange={(v) => setSource('buttons', b.index, v)} fields={fields} />
                  </div>
                ))}
                {ph.buttons.some((b) => b.dynamic) && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    A link button only fills in the part after its fixed URL — use the “… URL path” values when the template's link is your store's address followed by {'{{1}}'}.
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card icon={<Clock size={17} />} title="Timing & follow-up">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
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
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{isMessenger ? 'Used to match the order\'s phone to a Page subscriber\'s phone.' : 'Added to phone numbers typed without one (e.g. 017… → 88017…).'}</span>
              </div>
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
          </Card>

          {isCod && (
            <Card icon={<ListChecks size={17} />} title="When the customer answers">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
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
                <textarea className="form-input" rows={2} maxLength={1000} value={form.codConfirmReply || ''} onChange={(e) => set({ codConfirmReply: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Reply after Cancel</label>
                <textarea className="form-input" rows={2} maxLength={1000} value={form.codCancelReply || ''} onChange={(e) => set({ codCancelReply: e.target.value })} />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                You can use {'{{customer_first_name}}'}, {'{{order_number}}'}, {'{{total}}'} and the other value names in these replies.
              </span>
            </Card>
          )}

          <div style={{ position: 'sticky', bottom: 0, zIndex: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 0', background: 'var(--bg-base)', borderTop: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
              Active
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={goBack} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !form.templateId}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save campaign
              </button>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
