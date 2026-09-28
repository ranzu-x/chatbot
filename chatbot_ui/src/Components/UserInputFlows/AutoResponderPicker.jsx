import { useEffect, useState } from 'react';
import { autoResponderAPI } from '../../services/api';

/**
 * User Input Flow Start element → "Send the email to an auto responder".
 * Saves `autoResponderId` + `autoResponderListId` (+ names for display) on the
 * Start element; chatbot_api/utils/flowEngine.js pushes the first email answer
 * there when the form is completed. Connections are managed in
 * Bot Settings → Auto Responder.
 */
export default function AutoResponderPicker({ data, updateFields }) {
  const [integrations, setIntegrations] = useState(null);
  const [lists, setLists] = useState([]);
  const [listLabel, setListLabel] = useState('List');
  const [listState, setListState] = useState('idle'); // idle | loading | error
  const [listError, setListError] = useState('');
  const selectedId = data.autoResponderId ? String(data.autoResponderId) : '';

  useEffect(() => {
    let alive = true;
    autoResponderAPI.getAll()
      .then((res) => { if (alive) setIntegrations(res.data?.integrations || []); })
      .catch(() => { if (alive) setIntegrations([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) { setLists([]); setListState('idle'); return undefined; }
    let alive = true;
    setListState('loading');
    autoResponderAPI.lists(selectedId)
      .then((res) => {
        if (!alive) return;
        setLists(res.data?.lists || []);
        setListLabel(res.data?.listLabel || 'List');
        setListState('idle');
      })
      .catch((err) => {
        if (!alive) return;
        setLists([]);
        setListError(err?.response?.data?.message || 'Could not load the lists');
        setListState('error');
      });
    return () => { alive = false; };
  }, [selectedId]);

  const choose = (id) => {
    const found = (integrations || []).find((i) => String(i.id) === id);
    updateFields({ autoResponderId: id ? Number(id) : null, autoResponderName: found ? found.name : '', autoResponderListId: null, autoResponderListName: '' });
  };

  const chooseList = (id) => {
    const found = lists.find((l) => String(l.id) === id);
    updateFields({ autoResponderListId: id || null, autoResponderListName: found ? found.name : '' });
  };

  const missingSaved = selectedId && integrations && !integrations.some((i) => String(i.id) === selectedId);

  return (
    <div className="fb-field">
      <label>Send Email To Auto Responder (optional)</label>
      {!integrations ? (
        <span className="fb-hint">Loading…</span>
      ) : integrations.length === 0 ? (
        <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px dashed #cbd5e1', background: '#f8fafc', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
          No auto responder connected. Connect Mailchimp, Brevo, ActiveCampaign or Mautic in
          <b> Bot Manager → Bot Settings → Auto Responder</b>.
        </div>
      ) : (
        <>
          <select value={selectedId} onChange={(e) => choose(e.target.value)}>
            <option value="">Don&apos;t send to an auto responder</option>
            {integrations.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.providerLabel}){i.status === 'ERROR' ? ' — error' : ''}</option>
            ))}
          </select>
          {missingSaved && <span className="fb-hint" style={{ color: '#ef4444' }}>The saved connection was removed — choose another.</span>}
          {selectedId && !missingSaved && (
            <select
              value={data.autoResponderListId || ''}
              onChange={(e) => chooseList(e.target.value)}
              disabled={listState === 'loading'}
              style={{ marginTop: 6 }}
            >
              <option value="">{listState === 'loading' ? 'Loading…' : `Select a ${listLabel.toLowerCase()}…`}</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              {data.autoResponderListId && !lists.some((l) => String(l.id) === String(data.autoResponderListId)) && listState !== 'loading' && (
                <option value={data.autoResponderListId}>{data.autoResponderListName || data.autoResponderListId}</option>
              )}
            </select>
          )}
          {listState === 'error' && <span className="fb-hint" style={{ color: '#ef4444' }}>{listError}</span>}
          <span className="fb-hint">
            When the form is completed, the first answer from an <b>Email</b> question (or the subscriber&apos;s saved email)
            is added to this {listLabel.toLowerCase()}, with their name.
          </span>
        </>
      )}
    </div>
  );
}
