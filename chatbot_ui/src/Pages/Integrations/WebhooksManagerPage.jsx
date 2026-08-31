import React, { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { flowAPI } from '../../services/api';
import api from '../../services/api';
import {
  Globe,
  Zap,
  Plug,
  Copy,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  ExternalLink,
  Code2,
  Clock,
  ArrowUpRight,
  Send,
  Sliders,
  Play,
  Check,
} from 'lucide-react';

export default function WebhooksManagerPage() {
  const [flows, setFlows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('INBOUND'); // 'INBOUND' | 'LOGS'
  const [copiedId, setCopiedId] = useState(null);
  const [selectedFlowForTest, setSelectedFlowForTest] = useState(null);
  const [testPayload, setTestPayload] = useState({
    name: 'Sarah Connor',
    phone: '+14155552671',
    email: 'sarah@example.com',
    channel: 'WHATSAPP',
  });
  const [testingTrigger, setTestingTrigger] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [queueStats, setQueueStats] = useState({ queueLength: 0, activeWorkers: 0, totalReceived: 0, totalProcessed: 0, throughputPerSec: 0 });
  const [enqueuingBatch, setEnqueuingBatch] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadQueueStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadQueueStats = async () => {
    try {
      const res = await api.get('/queue/stats');
      if (res.data?.stats) setQueueStats(res.data.stats);
    } catch {}
  };

  const handleEnqueueBatch = async () => {
    setEnqueuingBatch(true);
    try {
      await api.post('/queue/enqueue-test', { count: 25 });
      showToast('Enqueued 25 high-throughput webhook events!');
      loadQueueStats();
    } catch {
      showToast('Failed to enqueue batch', 'error');
    } finally {
      setEnqueuingBatch(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [flowsRes, logsRes, qRes] = await Promise.all([
        flowAPI.getAll().catch(() => ({ data: { flows: [] } })),
        api.get('/webhooks/logs').catch(() => ({ data: { logs: [] } })),
        api.get('/queue/stats').catch(() => ({ data: { stats: {} } })),
      ]);
      const flowList = flowsRes.data?.flows || [];
      setFlows(flowList);
      setLogs(logsRes.data?.logs || []);
      if (qRes.data?.stats) setQueueStats(qRes.data.stats);
      if (flowList.length > 0 && !selectedFlowForTest) {
        setSelectedFlowForTest(flowList[0]);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load webhook data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast('Inbound Webhook URL copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTestInboundTrigger = async (e) => {
    e.preventDefault();
    if (!selectedFlowForTest) return;
    setTestingTrigger(true);
    setTestResult(null);

    try {
      const res = await api.post(`/webhooks/inbound/${selectedFlowForTest.id}`, testPayload);
      setTestResult({ success: true, data: res.data });
      showToast(`Flow "${selectedFlowForTest.name}" triggered successfully!`);
      loadData();
    } catch (err) {
      console.error(err);
      setTestResult({ success: false, error: err.response?.data?.message || err.message });
      showToast('Failed to trigger inbound webhook', 'error');
    } finally {
      setTestingTrigger(false);
    }
  };

  const getBaseInboundUrl = (flowId) => {
    const origin = window.location.origin.replace('5173', '5000'); // point to API server
    return `${origin}/api/v1/webhooks/inbound/${flowId}`;
  };

  return (
    <AppLayout>
      <div className="webhooks-manager-page" style={{ width: '100%', padding: '14px 18px' }}>
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              zIndex: 99999,
              padding: '12px 20px',
              borderRadius: 10,
              background: toast.type === 'error' ? '#ef4444' : '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.84rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Webhooks, Zapier & Make.com Integration Hub
              </h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0 0' }}>
              Connect bot flows to external CRMs, Shopify, Zapier, Make, and Google Sheets via Inbound Triggers & Outbound Flow Webhooks.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 18 }}>
          {[
            { id: 'INBOUND', label: `📥 Inbound Triggers for Flows (${flows.length})`, icon: Zap },
            { id: 'LOGS', label: `📡 Outbound Delivery Logs (${logs.length})`, icon: Clock },
            { id: 'QUEUE', label: '⚡ Production Queue & Workers', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: active ? 800 : 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#0284c7' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB 1: INBOUND WEBHOOK TRIGGERS (ZAPIER / MAKE / SHOPIFY -> FLOW)
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'INBOUND' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
            {/* Left Column: List of Flow Webhook Endpoints */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Flow Inbound Trigger Endpoints
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Send a `POST` request to any of these unique URLs from Zapier, Make.com, or Shopify to immediately launch that flow for a recipient.
                </p>
              </div>

              {flows.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', background: '#f8fafc', borderRadius: 10 }}>
                  No bot flows created yet. Create a flow in Visual Bot Manager first.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {flows.map((flow) => {
                    const webhookUrl = getBaseInboundUrl(flow.id);
                    const isSelected = selectedFlowForTest?.id === flow.id;

                    return (
                      <div
                        key={flow.id}
                        onClick={() => setSelectedFlowForTest(flow)}
                        style={{
                          padding: 14,
                          borderRadius: 10,
                          border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                          background: isSelected ? '#f0f9ff' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          transition: 'all 0.12s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0284c7' }}>
                              FLOW #{flow.id}
                            </span>
                            <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>{flow.name}</strong>
                          </div>
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{flow.platform}</span>
                        </div>

                        {/* Webhook URL bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                          <code style={{ fontSize: '0.72rem', color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {webhookUrl}
                          </code>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyUrl(webhookUrl, flow.id);
                            }}
                            style={{ padding: '3px 8px', borderRadius: 4, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.7rem', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            {copiedId === flow.id ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                            {copiedId === flow.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Inbound Webhook Test Simulator */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Play size={15} color="#0284c7" /> Test Inbound Webhook Trigger
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Simulate an external payload sent from Zapier/Shopify to trigger the selected flow.
                </p>
              </div>

              {selectedFlowForTest ? (
                <form onSubmit={handleTestInboundTrigger} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.78rem', color: '#0f172a', background: '#f8fafc', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    Target Flow: <strong>{selectedFlowForTest.name} (#{selectedFlowForTest.id})</strong>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>Customer Name</label>
                    <input
                      type="text"
                      className="form-input w-full"
                      value={testPayload.name}
                      onChange={(e) => setTestPayload({ ...testPayload, name: e.target.value })}
                      style={{ fontSize: '0.78rem', height: 32 }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>Phone Number</label>
                      <input
                        type="text"
                        className="form-input w-full"
                        value={testPayload.phone}
                        onChange={(e) => setTestPayload({ ...testPayload, phone: e.target.value })}
                        style={{ fontSize: '0.78rem', height: 32 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: 3 }}>Email Address</label>
                      <input
                        type="email"
                        className="form-input w-full"
                        value={testPayload.email}
                        onChange={(e) => setTestPayload({ ...testPayload, email: e.target.value })}
                        style={{ fontSize: '0.78rem', height: 32 }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={testingTrigger}
                    style={{
                      marginTop: 4,
                      padding: '8px 16px',
                      borderRadius: 8,
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: testingTrigger ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Zap size={14} />
                    {testingTrigger ? 'Triggering Flow...' : 'Send Test Inbound Webhook'}
                  </button>

                  {testResult && (
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: testResult.success ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
                        fontSize: '0.74rem',
                        marginTop: 6,
                      }}
                    >
                      <div style={{ fontWeight: 800, color: testResult.success ? '#15803d' : '#b91c1c', marginBottom: 2 }}>
                        {testResult.success ? '✅ Trigger Successful (HTTP 200)' : '❌ Trigger Failed'}
                      </div>
                      <pre style={{ margin: 0, fontSize: '0.68rem', overflowX: 'auto' }}>
                        {JSON.stringify(testResult.data || testResult.error, null, 2)}
                      </pre>
                    </div>
                  )}
                </form>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: '0.76rem' }}>
                  Select a flow from the left to test.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 2: OUTBOUND FLOW WEBHOOK LOGS
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'LOGS' && (
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Recent Outbound Webhook Delivery Logs
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Shows real-time HTTP requests dispatched by your bot flows to Zapier, Make, and external webhooks.
                </p>
              </div>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{logs.length} logs</span>
            </div>

            {logs.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', background: '#f8fafc', borderRadius: 10 }}>
                No outbound flow webhook logs recorded yet. Add a Webhook Node in Flow Builder to dispatch data.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Method</th>
                      <th style={{ padding: '8px 10px' }}>Target URL</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px' }}>Response Time</th>
                      <th style={{ padding: '8px 10px' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0284c7' }}>
                            {log.http_method}
                          </span>
                        </td>
                        <td style={{ padding: '10px', color: '#0f172a', fontWeight: 600, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.target_url}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: log.status === 'SUCCESS' ? '#10b98120' : '#fee2e2', color: log.status === 'SUCCESS' ? '#059669' : '#dc2626' }}>
                            HTTP {log.response_status}
                          </span>
                        </td>
                        <td style={{ padding: '10px', color: '#64748b' }}>
                          {log.execution_time_ms || 0} ms
                        </td>
                        <td style={{ padding: '10px', color: '#94a3b8' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB 3: PRODUCTION QUEUE & BACKGROUND WORKER ENGINE
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'QUEUE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Top Queue Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>Queue Depth</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: queueStats.queueLength > 0 ? '#d97706' : '#10b981' }}>
                  {queueStats.queueLength} <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>pending</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>● Instant Non-Blocking Ingestion</span>
              </div>

              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>Active Worker Threads</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#2563eb' }}>
                  {queueStats.activeWorkers} / {queueStats.concurrency || 10}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Parallel Dequeue Concurrency</span>
              </div>

              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>Total Processed Webhooks</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>
                  {queueStats.totalProcessed}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 700 }}>● 100% Delivery Success</span>
              </div>

              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>Live Ingestion Rate</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#8b5cf6' }}>
                  {queueStats.throughputPerSec || '0.00'} <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>req/s</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Automatic Background Auto-Scale</span>
              </div>
            </div>

            {/* Stress Test Simulation Card */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={16} color="#0284c7" /> High-Throughput Load Simulator
                  </h3>
                  <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '3px 0 0 0' }}>
                    Simulate 25 simultaneous Meta WhatsApp / Telegram incoming webhook bursts to test asynchronous background worker execution.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleEnqueueBatch}
                  disabled={enqueuingBatch}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 8,
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: enqueuingBatch ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                  }}
                >
                  <Zap size={14} />
                  {enqueuingBatch ? 'Enqueuing 25 Webhooks...' : '⚡ Fire 25 Burst Webhooks'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
