import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { broadcastAPI, contactAPI } from '../../services/api';
import { showBroadcastError } from './broadcastDialogs';

// The campaign behind a BROADCAST flow, shared by the Flow Builder's top bar
// (Save / Review & Send) and the Broadcast element's settings panel, so both
// work on the same audience and sending mode. Audience edits are saved to the
// campaign on their own shortly after they change (like the flow's autosave),
// so closing the panel with Done never loses them.

export const BroadcastCampaignContext = createContext(null);
export const useBroadcastCampaignContext = () => useContext(BroadcastCampaignContext);

const parseIds = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };
const EMPTY_AUDIENCE = { includeLabelIds: [], excludeLabelIds: [], includeContacts: [], excludeContacts: [], tagLabelId: null };
const AUTOSAVE_MS = 800;
const RESOLVE_NAMES_MAX = 50;

/** Stored contact ids → the picker's { id, name } (a deleted contact is dropped). */
export async function resolveContacts(ids) {
  const results = await Promise.allSettled(ids.slice(0, RESOLVE_NAMES_MAX).map((id) => contactAPI.getOne(id)));
  const named = results.map((r, i) => {
    if (r.status === 'fulfilled') {
      const c = r.value.data.contact;
      return c ? { id: c.id, name: c.name || c.phone || c.external_id } : null;
    }
    return r.reason?.response?.status === 404 ? null : { id: ids[i], name: `Subscriber #${ids[i]}` };
  }).filter(Boolean);
  // Past the cap, keep the ids without looking names up.
  return [...named, ...ids.slice(RESOLVE_NAMES_MAX).map((id) => ({ id, name: `Subscriber #${id}` }))];
}

export function accountLabelOf(account) {
  if (!account) return null;
  if (account.wa_display_phone) return `${account.name || 'WhatsApp'} (${account.wa_display_phone})`;
  return account.fb_page_name || account.name || `Account #${account.id}`;
}

export default function useBroadcastCampaign({ enabled, flowId, platform, flowName, onSetFirstStep }) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [account, setAccount] = useState(null);
  const [audienceForm, setAudienceFormState] = useState(EMPTY_AUDIENCE);
  const [previewCount, setPreviewCount] = useState(null);
  const [mode, setMode] = useState('WINDOW');
  const [modeBusy, setModeBusy] = useState(false);
  const dirty = useRef(false);
  const autoConnected = useRef(false);
  const flowNameRef = useRef(flowName);
  flowNameRef.current = flowName;

  const editable = Boolean(campaign && ['DRAFT', 'FAILED'].includes(campaign.status));
  const canSend = Boolean(campaign && ['DRAFT', 'FAILED', 'SCHEDULED'].includes(campaign.status));

  const load = useCallback(async () => {
    if (!enabled || !flowId) return;
    setLoading(true);
    try {
      const campRes = await broadcastAPI.getByFlow(flowId);
      const c = campRes.data.campaign;
      // Individually picked subscribers are stored as ids; the picker needs names.
      // They must be loaded back, or the next audience save would clear them.
      const [includeContacts, excludeContacts] = await Promise.all([
        resolveContacts(parseIds(c.include_contact_ids)),
        resolveContacts(parseIds(c.exclude_contact_ids)),
      ]);
      setCampaign(c);
      dirty.current = false;
      setAudienceFormState({
        includeLabelIds: parseIds(c.include_label_ids),
        excludeLabelIds: parseIds(c.exclude_label_ids),
        includeContacts,
        excludeContacts,
        tagLabelId: c.tag_label_id,
      });
      setMode(c.mode === 'TEMPLATE' ? 'TEMPLATE' : 'WINDOW');
      const formRes = await broadcastAPI.getFormData(c.platform || platform, c.integration_id);
      setLabels(formRes.data.labels || []);
      setAccount((formRes.data.integrations || []).find((i) => String(i.id) === String(c.integration_id)) || null);
    } catch {
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, flowId, platform]);

  useEffect(() => { load(); }, [load]);

  // Older broadcasts may have nothing connected to the Broadcast element yet.
  useEffect(() => {
    if (!campaign || autoConnected.current) return;
    autoConnected.current = true;
    onSetFirstStep?.(campaign.mode === 'TEMPLATE' ? 'template' : 'message', { onlyIfEmpty: true });
  }, [campaign, onSetFirstStep]);

  const setAudienceForm = useCallback((next) => {
    dirty.current = true;
    setAudienceFormState(next);
  }, []);

  const targeting = useCallback((form) => ({
    includeLabelIds: form.includeLabelIds,
    excludeLabelIds: form.excludeLabelIds,
    includeContactIds: form.includeContacts.map((c) => c.id),
    excludeContactIds: form.excludeContacts.map((c) => c.id),
  }), []);

  // Live audience count — the server's own calculation for this campaign's bot account.
  useEffect(() => {
    if (!campaign) return undefined;
    setPreviewCount(null);
    const t = setTimeout(async () => {
      try {
        const res = await broadcastAPI.audiencePreview({ campaignId: campaign.id, ...targeting(audienceForm) });
        setPreviewCount(res.data.count);
      } catch { setPreviewCount(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [campaign, audienceForm, targeting]);

  const audienceRef = useRef(audienceForm);
  audienceRef.current = audienceForm;

  /**
   * Saves name + audience to the campaign (drafts only) and returns the
   * server's readiness: { audienceCount, noFilter, large, largeAudienceThreshold, readyErrors }.
   * A scheduled campaign isn't edited here — only its current audience is counted.
   */
  const persist = useCallback(async () => {
    if (!campaign) return null;
    if (!['DRAFT', 'FAILED'].includes(campaign.status)) {
      const res = await broadcastAPI.audiencePreview({
        campaignId: campaign.id,
        includeLabelIds: parseIds(campaign.include_label_ids),
        excludeLabelIds: parseIds(campaign.exclude_label_ids),
        includeContactIds: parseIds(campaign.include_contact_ids),
        excludeContactIds: parseIds(campaign.exclude_contact_ids),
      });
      return { audienceCount: res.data.count, noFilter: res.data.noFilter, largeAudienceThreshold: res.data.largeAudienceThreshold, readyErrors: [] };
    }
    dirty.current = false;
    const res = await broadcastAPI.update(campaign.id, {
      name: flowNameRef.current || undefined,
      ...targeting(audienceRef.current),
      tagLabelId: audienceRef.current.tagLabelId,
    });
    return res.data;
  }, [campaign, targeting]);

  // Audience autosave — only after the user actually changed something.
  useEffect(() => {
    if (!editable || !dirty.current) return undefined;
    const t = setTimeout(() => {
      persist().catch((err) => { dirty.current = true; showBroadcastError(err, 'Could not save the audience'); });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [audienceForm, editable, persist]);

  /** Saves pending audience edits right away (e.g. before leaving the builder). */
  const flush = useCallback(async () => {
    if (!editable || !dirty.current) return;
    try { await persist(); } catch { dirty.current = true; }
  }, [editable, persist]);

  const changeMode = useCallback(async (next) => {
    if (next === mode || !campaign) return;
    setMode(next);
    onSetFirstStep?.(next === 'TEMPLATE' ? 'template' : 'message');
    setModeBusy(true);
    try {
      await broadcastAPI.update(campaign.id, { mode: next, ...targeting(audienceRef.current), tagLabelId: audienceRef.current.tagLabelId });
      dirty.current = false;
      setCampaign((c) => (c ? { ...c, mode: next } : c));
    } catch (err) {
      showBroadcastError(err, 'Could not change the sending mode');
    } finally {
      setModeBusy(false);
    }
  }, [mode, campaign, onSetFirstStep, targeting]);

  const cancelSchedule = useCallback(async () => {
    if (!campaign) return;
    try {
      await broadcastAPI.cancelSchedule(campaign.id);
      await load();
    } catch (err) {
      showBroadcastError(err, 'Could not cancel the schedule');
    }
  }, [campaign, load]);

  return {
    enabled: Boolean(enabled),
    campaign, loading, labels, account, accountLabel: accountLabelOf(account),
    audienceForm, setAudienceForm, previewCount,
    mode, changeMode, modeBusy,
    editable, canSend,
    persist, flush, reload: load, cancelSchedule,
  };
}
