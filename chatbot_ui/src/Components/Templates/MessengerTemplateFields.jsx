import { useEffect, useState } from 'react';
import { Loader2, FileText, AlertTriangle } from 'lucide-react';
import { messengerUtilityAPI } from '../../services/api';
import { describeMessengerTemplate, syncMessengerButtons } from './messengerTemplateUtils';

/**
 * The Flow Builder's "Utility Template" element (node type `messengerTemplate`)
 * — one approved Messenger Utility template of the flow's own Facebook Page:
 * the only automated Messenger message allowed after the 24-hour window.
 * Order / account / appointment updates only. Used in flows, Sequences and
 * Broadcasts ("Utility template" type).
 *
 * Node data: { messengerTemplateId, messengerTemplateName, language, templateMeta,
 *   params: { header: {ph: text}, body: {ph: text}, buttons: {index: text}, headerImage },
 *   buttons: [...] }   — buttons[i] = tap options of Reply button i (canvas handle btn-<i>).
 */

function ParamInput({ label, value, onChange, placeholder = 'Text or a variable, e.g. {{contact.name}}' }) {
  return (
    <div className="fb-field" style={{ margin: 0 }}>
      <label style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</label>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

const EMPTY_PARAMS = { header: {}, body: {}, buttons: {} };

export default function MessengerTemplateFields({ data, updateFields, integrationId, platform, routable = false, renderImageField = null, renderButtonEditor = null }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!integrationId || (platform || '').toUpperCase() !== 'FACEBOOK') { setTemplates([]); return undefined; }
    let alive = true;
    setLoading(true);
    setLoadError('');
    messengerUtilityAPI.list(integrationId, 'APPROVED')
      .then((res) => { if (alive) setTemplates(res.data.templates || []); })
      .catch((err) => { if (alive) setLoadError(err?.response?.data?.message || "Couldn't load Utility templates"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [integrationId, platform]);

  const selected = templates.find((t) => String(t.id) === String(data.messengerTemplateId)) || null;
  const meta = selected ? describeMessengerTemplate(selected) : data.templateMeta;
  const params = data.params || EMPTY_PARAMS;

  // Keep the saved snapshot in step with the live template (re-synced from Meta).
  useEffect(() => {
    if (!selected) return;
    const fresh = describeMessengerTemplate(selected);
    const buttons = syncMessengerButtons(fresh, data.buttons);
    const patch = {};
    if (JSON.stringify(fresh) !== JSON.stringify(data.templateMeta)) patch.templateMeta = fresh;
    if (JSON.stringify(buttons) !== JSON.stringify(data.buttons || [])) patch.buttons = buttons;
    if (Object.keys(patch).length) updateFields(patch);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickTemplate = (id) => {
    const tpl = templates.find((t) => String(t.id) === String(id));
    if (!tpl) {
      updateFields({ messengerTemplateId: null, messengerTemplateName: '', language: '', templateMeta: null, params: EMPTY_PARAMS, buttons: [] });
      return;
    }
    const fresh = describeMessengerTemplate(tpl);
    updateFields({
      messengerTemplateId: tpl.id,
      messengerTemplateName: tpl.name,
      language: tpl.language,
      templateMeta: fresh,
      params: EMPTY_PARAMS,
      buttons: syncMessengerButtons(fresh),
    });
  };

  const setParam = (section, key, value) => updateFields({ params: { ...params, [section]: { ...(params[section] || {}), [key]: value } } });

  if ((platform || '').toUpperCase() !== 'FACEBOOK') {
    return <span className="fb-hint">Utility templates are a Messenger feature — this element is skipped on other channels.</span>;
  }
  if (!integrationId) {
    return <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>This flow isn't linked to a Facebook Page yet, so there are no templates to choose from.</span>;
  }

  const fillableButtons = (meta?.buttons || []).filter((b) => b.dynamic && !(b.routable && routable));
  const hasParams = meta && (meta.header.length || meta.body.length || fillableButtons.length);

  return (
    <>
      <div className="fb-field">
        <label>Approved Utility Template</label>
        {loading ? (
          <span className="fb-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading templates…
          </span>
        ) : loadError ? (
          <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>{loadError}</span>
        ) : templates.length === 0 ? (
          <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600, display: 'flex', gap: 6 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            This Page has no approved Utility templates yet. Create or sync them in Bot Manager → Message Templates.
          </span>
        ) : (
          <select value={data.messengerTemplateId || ''} onChange={(e) => pickTemplate(e.target.value)} aria-label="Approved Utility template">
            <option value="">— Select an approved template —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language}</option>)}
          </select>
        )}
        {data.messengerTemplateId && !loading && !loadError && templates.length > 0 && !selected && (
          <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>
            The saved template "{data.messengerTemplateName}" is no longer approved on this Page — pick another.
          </span>
        )}
        <span className="fb-hint">Order, account, appointment or event updates only — Meta treats anything promotional as marketing.</span>
      </div>

      {meta && (
        <div className="fb-field">
          <label>Preview</label>
          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '0.8rem', lineHeight: 1.5 }}>
            {meta.headerType === 'IMAGE' && <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>[Image header]</div>}
            {meta.headerText && <div style={{ fontWeight: 700, marginBottom: 4 }}>{meta.headerText}</div>}
            <div style={{ whiteSpace: 'pre-wrap' }}>{meta.bodyText}</div>
            {meta.buttons.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {meta.buttons.map((b) => (
                  <span key={b.index} style={{ padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 600, background: 'var(--bg-surface)' }}>{b.text}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {meta?.headerType === 'IMAGE' && renderImageField && (
        <div className="fb-field" style={{ gap: 6 }}>
          {renderImageField({ value: params.headerImage || '', onChange: (v) => updateFields({ params: { ...params, headerImage: v } }) })}
          <span className="fb-hint">
            {meta.hasHeaderSample ? 'Leave empty to send the image stored with the template. ' : 'This template needs a header image. '}
            A link may contain a variable, e.g. {'{{product_image}}'}.
          </span>
        </div>
      )}

      {meta && meta.buttons.length > 0 && (
        <div className="fb-field" style={{ gap: 6 }}>
          <label>Buttons</label>
          {meta.buttons.map((b) => {
            if (b.routable && routable && renderButtonEditor) {
              const btn = (data.buttons || [])[b.index] || { title: b.text, type: b.type, action: 'flow' };
              return renderButtonEditor(btn, b.index, (next) => {
                const all = syncMessengerButtons(meta, data.buttons);
                all[b.index] = { ...next, title: b.text, type: b.type };
                updateFields({ buttons: all });
              });
            }
            return (
              <div key={b.index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{b.index + 1}.</span>
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.text}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{b.type === 'URL' ? 'Opens link' : 'Reply'}</span>
              </div>
            );
          })}
          <span className="fb-hint">
            {routable
              ? 'Reply buttons made in this app: connect each on the canvas, or open it to jump to another flow, add or remove labels, or enroll in a Sequence.'
              : 'In a Sequence, a Reply button tap arrives as a normal reply — button actions work in flows and broadcasts.'}
          </span>
        </div>
      )}

      {hasParams ? (
        <div className="fb-field" style={{ gap: 10 }}>
          <label>Template Parameters</label>
          {meta.header.map((ph) => <ParamInput key={`h-${ph}`} label={`Header {{${ph}}}`} value={params.header?.[ph]} onChange={(v) => setParam('header', ph, v)} />)}
          {meta.body.map((ph) => <ParamInput key={`b-${ph}`} label={`Body {{${ph}}}`} value={params.body?.[ph]} onChange={(v) => setParam('body', ph, v)} />)}
          {fillableButtons.map((b) => (
            <ParamInput key={`btn-${b.index}`} label={b.type === 'URL' ? `Button "${b.text}" — link ending` : `Button "${b.text}" — reply payload`} value={params.buttons?.[b.index]} onChange={(v) => setParam('buttons', b.index, v)} />
          ))}
          <span className="fb-hint">Each value can be fixed text or a subscriber variable like {'{{contact.name}}'} — filled in per subscriber when sent. A broadcast must use at least one subscriber variable.</span>
        </div>
      ) : meta ? (
        <span className="fb-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={12} /> This template needs no parameters.</span>
      ) : null}
    </>
  );
}
