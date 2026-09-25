import { useEffect, useState } from 'react';
import { templateAPI } from '../../services/api';
import { Loader2, FileText, AlertTriangle, Layers, MapPin, File } from 'lucide-react';
import { describeTemplateForElement, syncTemplateButtons } from './messageTemplateUtils';

/**
 * The Flow Builder's "Message Template" element (node type `whatsappTemplate`)
 * — sends one approved WhatsApp template, the only message WhatsApp accepts
 * outside the 24-hour window. Usable in any flow: Broadcast ("Anytime"),
 * Sequences (a step days after the last message), normal bot flows.
 *
 * Node data: { templateId, templateName, language, params: {header, body,
 * buttons, headerMedia, documentFilename, location: { latitude, longitude, name, address }, cards},
 * templateMeta, buttons }
 */

function ParamInput({ label, value, onChange, placeholder = 'Text or a variable, e.g. {{contact.name}}' }) {
  return (
    <div className="fb-field" style={{ margin: 0 }}>
      <label style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</label>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export default function MessageTemplateFields({ data, updateFields, integrationId, platform, routable = false, renderMediaField = null, renderButtonEditor = null }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!integrationId) { setTemplates([]); return undefined; }
    let alive = true;
    setLoading(true);
    setLoadError(false);
    templateAPI.getWATemplates({ integrationId, status: 'APPROVED' })
      .then((res) => { if (alive) setTemplates(res.data.templates || []); })
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [integrationId]);

  const selected = templates.find((t) => String(t.id) === String(data.templateId)) || null;
  const meta = selected ? describeTemplateForElement(selected) : data.templateMeta;
  const params = data.params || { header: {}, body: {}, buttons: {}, location: {} };

  // Keep the stored snapshot in step with the live template (e.g. re-synced from Meta).
  useEffect(() => {
    if (!selected) return;
    const fresh = describeTemplateForElement(selected);
    const buttons = syncTemplateButtons(fresh, data.buttons);
    const patch = {};
    if (JSON.stringify(fresh) !== JSON.stringify(data.templateMeta)) patch.templateMeta = fresh;
    if (JSON.stringify(buttons) !== JSON.stringify(data.buttons || [])) patch.buttons = buttons;
    if (Object.keys(patch).length) updateFields(patch);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickTemplate = (id) => {
    const tpl = templates.find((t) => String(t.id) === String(id));
    if (!tpl) {
      updateFields({ templateId: null, templateName: '', language: '', templateMeta: null, params: { header: {}, body: {}, buttons: {}, location: {} }, buttons: [] });
      return;
    }
    const freshMeta = describeTemplateForElement(tpl);
    updateFields({
      templateId: tpl.id,
      templateName: tpl.template_name,
      language: tpl.language,
      templateMeta: freshMeta,
      params: { header: {}, body: {}, buttons: {}, location: {} },
      buttons: syncTemplateButtons(freshMeta),
    });
  };

  const setParam = (section, key, value) => {
    updateFields({ params: { ...params, [section]: { ...(params[section] || {}), [key]: value } } });
  };

  const setLocationParam = (key, value) => {
    updateFields({ params: { ...params, location: { ...(params.location || {}), [key]: value } } });
  };

  if ((platform || '').toUpperCase() !== 'WHATSAPP') {
    return <span className="fb-hint">Message Templates are a WhatsApp feature — this element is skipped on other channels.</span>;
  }
  if (!integrationId) {
    return (
      <div className="fb-field">
        <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>
          This flow isn't linked to a WhatsApp account yet, so there are no templates to choose from.
        </span>
      </div>
    );
  }

  const dynamicButtons = (meta?.buttons || []).filter((b) => b.dynamic);
  const copyCodeButtons = (meta?.buttons || []).filter((b) => b.isCopyCode);
  const mediaKind = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(meta?.headerType) ? meta.headerType : null;
  const isLocationHeader = meta?.headerType === 'LOCATION';
  const hasParams = meta && (meta.header.length || meta.body.length || dynamicButtons.length || copyCodeButtons.length || isLocationHeader);

  return (
    <>
      <div className="fb-field">
        <label>Approved Template</label>
        {loading ? (
          <span className="fb-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading templates…
          </span>
        ) : loadError ? (
          <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>Couldn't load templates — reload the page to try again.</span>
        ) : templates.length === 0 ? (
          <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600, display: 'flex', gap: 6 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            This WhatsApp account has no approved templates yet. Create or sync them in Bot Manager → Templates first.
          </span>
        ) : (
          <select value={data.templateId || ''} onChange={(e) => pickTemplate(e.target.value)} aria-label="Approved template">
            <option value="">— Select an approved template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.template_name} · {t.language}{t.category ? ` · ${t.category}` : ''}</option>
            ))}
          </select>
        )}
        {data.templateId && !loading && !loadError && templates.length > 0 && !selected && (
          <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>
            The saved template "{data.templateName}" is no longer approved on this account — pick another.
          </span>
        )}
        <span className="fb-hint">Create or sync templates in Bot Manager → Templates.</span>
      </div>

      {meta && (
        <div className="fb-field">
          <label>Preview</label>
          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '0.8rem', lineHeight: 1.5 }}>
            {meta.headerType && meta.headerType !== 'TEXT' && (
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                [{meta.headerType} header]
              </div>
            )}
            {meta.headerText && <div style={{ fontWeight: 700, marginBottom: 4 }}>{meta.headerText}</div>}
            <div style={{ whiteSpace: 'pre-wrap' }}>{meta.bodyText}</div>
            {meta.footerText && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>{meta.footerText}</div>}
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

      {/* Header Media */}
      {meta && mediaKind && renderMediaField && (
        <div className="fb-field" style={{ gap: 6 }}>
          {renderMediaField({ kind: mediaKind, value: params.headerMedia || '', onChange: (v) => updateFields({ params: { ...params, headerMedia: v } }) })}
          <span className="fb-hint">
            {meta.hasHeaderSample
              ? `Leave empty to send the ${mediaKind.toLowerCase()} stored with the template.`
              : `This template's header needs a ${mediaKind.toLowerCase()} — upload one or paste a link.`}
            {' '}A link may contain a variable, e.g. {'{{product_image}}'}.
          </span>
          {meta.headerType === 'DOCUMENT' && (
            <ParamInput
              label="Document Filename (optional)"
              value={params.documentFilename}
              onChange={(v) => updateFields({ params: { ...params, documentFilename: v } })}
              placeholder="e.g. invoice_{{order_id}}.pdf"
            />
          )}
        </div>
      )}

      {/* Location Header Settings */}
      {isLocationHeader && (
        <div className="fb-field" style={{ gap: 8, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <MapPin size={14} style={{ color: 'var(--primary)' }} /> Location Header Coordinates
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ParamInput
              label="Latitude *"
              value={params.location?.latitude}
              onChange={(v) => setLocationParam('latitude', v)}
              placeholder="e.g. 37.483307 or {{lat}}"
            />
            <ParamInput
              label="Longitude *"
              value={params.location?.longitude}
              onChange={(v) => setLocationParam('longitude', v)}
              placeholder="e.g. -122.148331 or {{lng}}"
            />
          </div>
          <ParamInput
            label="Location Name (optional)"
            value={params.location?.name}
            onChange={(v) => setLocationParam('name', v)}
            placeholder="e.g. Our Office or {{store_name}}"
          />
          <ParamInput
            label="Address (optional)"
            value={params.location?.address}
            onChange={(v) => setLocationParam('address', v)}
            placeholder="e.g. 1 Hacker Way, Menlo Park, CA"
          />
        </div>
      )}

      {/* Carousel Cards */}
      {meta && meta.isCarousel && meta.cards?.length > 0 && (
        <div className="fb-field" style={{ gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={14} style={{ color: 'var(--primary)' }} /> Carousel Cards ({meta.cards.length})
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meta.cards.map((card, idx) => {
              const cardParam = (params.cards || [])[idx] || {};
              const cardMediaKind = ['IMAGE', 'VIDEO'].includes(card.headerType) ? card.headerType : 'IMAGE';
              return (
                <div
                  key={idx}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface, #f8fafc)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                      Card {idx + 1}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {card.headerType || 'IMAGE'}
                    </span>
                  </div>

                  {renderMediaField && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {renderMediaField({
                        kind: cardMediaKind,
                        value: cardParam.headerMedia || '',
                        onChange: (val) => {
                          const newCards = [...(params.cards || [])];
                          newCards[idx] = { ...(newCards[idx] || {}), headerMedia: val };
                          updateFields({ params: { ...params, cards: newCards } });
                        },
                      })}
                      <span className="fb-hint" style={{ marginTop: 2 }}>
                        {cardParam.headerMedia ? `Card ${idx + 1} ${cardMediaKind.toLowerCase()} selected` : `Select or upload ${cardMediaKind.toLowerCase()} for Card ${idx + 1}`}
                      </span>
                    </div>
                  )}

                  {card.bodyText && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                      {card.bodyText}
                    </div>
                  )}

                  {card.body?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {card.body.map((ph) => (
                        <ParamInput
                          key={`cb-${idx}-${ph}`}
                          label={`Card ${idx + 1} Body {{${ph}}}`}
                          value={cardParam.body?.[ph]}
                          onChange={(v) => {
                            const newCards = [...(params.cards || [])];
                            newCards[idx] = {
                              ...(newCards[idx] || {}),
                              body: { ...(newCards[idx]?.body || {}), [ph]: v },
                            };
                            updateFields({ params: { ...params, cards: newCards } });
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {card.buttons?.map((b) => (
                    <div key={b.index} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>Button:</span> {b.text}
                      </div>
                      {b.dynamic && (
                        <ParamInput
                          label={`Card ${idx + 1} Button "${b.text}" — link ending`}
                          value={cardParam.buttons?.[b.index]}
                          onChange={(v) => {
                            const newCards = [...(params.cards || [])];
                            newCards[idx] = {
                              ...(newCards[idx] || {}),
                              buttons: { ...(newCards[idx]?.buttons || {}), [b.index]: v },
                            };
                            updateFields({ params: { ...params, cards: newCards } });
                          }}
                        />
                      )}
                      {b.isCopyCode && (
                        <ParamInput
                          label={`Card ${idx + 1} Button "${b.text}" — coupon code`}
                          value={cardParam.buttons?.[b.index]}
                          onChange={(v) => {
                            const newCards = [...(params.cards || [])];
                            newCards[idx] = {
                              ...(newCards[idx] || {}),
                              buttons: { ...(newCards[idx]?.buttons || {}), [b.index]: v },
                            };
                            updateFields({ params: { ...params, cards: newCards } });
                          }}
                          placeholder="e.g. DISCOUNT20 or {{code}}"
                        />
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buttons */}
      {meta && meta.buttons.length > 0 && (
        <div className="fb-field" style={{ gap: 6 }}>
          <label>Buttons</label>
          {meta.buttons.map((b) => {
            if (b.type === 'QUICK_REPLY' && routable && renderButtonEditor) {
              const btn = (data.buttons || [])[b.index] || { title: b.text, type: b.type, action: 'flow' };
              return renderButtonEditor(btn, b.index, (next) => {
                const all = syncTemplateButtons(meta, data.buttons);
                all[b.index] = { ...next, title: b.text, type: b.type };
                updateFields({ buttons: all });
              });
            }
            return (
              <div key={b.index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{b.index + 1}.</span>
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.text}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                  {b.type === 'URL' ? 'Opens link' : b.type === 'PHONE_NUMBER' ? 'Calls' : b.type === 'COPY_CODE' ? 'Copies code' : 'Reply'}
                </span>
              </div>
            );
          })}
          <span className="fb-hint">
            {routable
              ? 'Quick-reply buttons: connect each one on the canvas, or open it to jump to another flow, add or remove labels, or enroll in a Sequence. Link and call buttons are fixed by the template.'
              : 'In a Sequence, button taps arrive as a normal reply — button actions are available in flows and broadcasts.'}
          </span>
        </div>
      )}

      {/* Parameters */}
      {hasParams ? (
        <div className="fb-field" style={{ gap: 10 }}>
          <label>Template Parameters</label>
          {meta.header.map((ph) => (
            <ParamInput key={`h-${ph}`} label={`Header {{${ph}}}`} value={params.header?.[ph]} onChange={(v) => setParam('header', ph, v)} />
          ))}
          {meta.body.map((ph) => (
            <ParamInput key={`b-${ph}`} label={`Body {{${ph}}}`} value={params.body?.[ph]} onChange={(v) => setParam('body', ph, v)} />
          ))}
          {dynamicButtons.map((b) => (
            <ParamInput key={`btn-${b.index}`} label={`Button "${b.text}" — link ending`} value={params.buttons?.[b.index]} onChange={(v) => setParam('buttons', b.index, v)} />
          ))}
          {copyCodeButtons.map((b) => (
            <ParamInput key={`btn-code-${b.index}`} label={`Button "${b.text}" — coupon / copy code`} value={params.buttons?.[b.index]} onChange={(v) => setParam('buttons', b.index, v)} placeholder="e.g. DISCOUNT50 or {{code}}" />
          ))}
          <span className="fb-hint">Each value can be fixed text or a subscriber variable like {'{{contact.name}}'} — filled in per subscriber when sent.</span>
        </div>
      ) : meta && !meta.isCarousel ? (
        <span className="fb-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FileText size={12} /> This template needs no parameters.
        </span>
      ) : null}
    </>
  );
}
