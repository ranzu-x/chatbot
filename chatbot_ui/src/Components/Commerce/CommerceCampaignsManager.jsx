import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { commerceAPI, channelAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { Plus, Pencil, Trash2, ShoppingCart, MessageCircle, Send, Clock } from 'lucide-react';

/**
 * Automation → Commerce → Automation Campaigns: order notifications, COD
 * verification and abandoned-cart recovery over WhatsApp templates, or order
 * updates / COD over Messenger Utility templates on a Facebook Page.
 * Scoped to the active bot account.
 */
export default function CommerceCampaignsManager({ onOpenStores, selectedAccount, integrationId }) {
  const [meta, setMeta] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [connections, setConnections] = useState([]);
  const [whatsappAccounts, setWhatsappAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const targetIntegrationId = integrationId || (selectedAccount?.id && selectedAccount.id !== 'all' ? selectedAccount.id : null);

  const load = () => {
    setLoading(true);
    const campaignParams = targetIntegrationId ? { integrationId: targetIntegrationId } : {};
    Promise.all([
      commerceAPI.getMeta(),
      commerceAPI.getCampaigns(campaignParams),
      commerceAPI.getConnections(),
      channelAPI.getWhatsApp().catch(() => ({ data: { accounts: [] } })),
      channelAPI.getFacebook().catch(() => ({ data: { pages: [] } })),
    ])
      .then(([m, c, s, w, fb]) => {
        setMeta(m.data);
        const rawCampaigns = c.data?.campaigns || [];
        // Scope strictly to the bot if an integration is selected
        const filtered = targetIntegrationId
          ? rawCampaigns.filter((camp) => String(camp.integration_id) === String(targetIntegrationId))
          : rawCampaigns;
        setCampaigns(filtered);
        setConnections(s.data?.connections || []);
        setWhatsappAccounts([
          ...(w.data?.accounts || []).filter((a) => a.is_active !== 0).map((a) => ({ ...a, platform: a.platform || 'WHATSAPP' })),
          ...(fb.data?.pages || []).filter((p) => p.is_active !== 0).map((p) => ({ ...p, platform: 'FACEBOOK' })),
        ]);
      })
      .catch(() => notify.error('Failed to load commerce campaigns'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [targetIntegrationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerLabel = useMemo(() => Object.fromEntries((meta?.triggers || []).map((t) => [t.id, t.label])), [meta]);

  // The campaign editor is a full page (Pages/Commerce/CommerceCampaignPage.jsx); it comes back here.
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const openNew = () => navigate(`/commerce/campaigns/new?returnTo=${returnTo}${targetIntegrationId ? `&account=${targetIntegrationId}` : ''}`);
  const openEdit = (c) => navigate(`/commerce/campaigns/${c.id}?returnTo=${returnTo}${targetIntegrationId ? `&account=${targetIntegrationId}` : ''}`);

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
        <div>
          {selectedAccount && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: '0.74rem', fontWeight: 700, marginBottom: 6, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <span>●</span>
              <span>{selectedAccount.name || selectedAccount.wa_display_phone || `Account #${selectedAccount.id}`}</span>
            </div>
          )}
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 580 }}>
            Each campaign sends one approved template when something happens in your store — a WhatsApp template, or a Messenger Utility template from a Facebook Page. Templates are required because store customers usually haven't messaged you in the last 24 hours.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew} disabled={!whatsappAccounts.length} title={whatsappAccounts.length ? '' : 'Connect a WhatsApp number or Facebook Page first'}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><MessageCircle size={28} /></div>
          <div className="empty-title">No campaigns for this bot yet</div>
          <div className="empty-desc">Create one for new orders, COD verification or abandoned carts on {selectedAccount?.name || 'this WhatsApp bot'}.</div>
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
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.integration_platform === 'FACEBOOK' ? 'Messenger · ' : ''}{c.integration_name || `Account #${c.integration_id}`}</div>
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

    </>
  );
}
