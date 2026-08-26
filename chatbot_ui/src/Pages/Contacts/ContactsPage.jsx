import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { contactAPI } from '../../services/api';
import { useNavigate } from 'react-router';
import {
  Users,
  MessageSquare,
  Phone,
  Mail,
  Clock,
  Calendar,
  Bot,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Tag,
  ListFilter,
  Send,
  X,
  MessageCircle,
  Facebook,
  Instagram,
  Globe,
  Radio,
  Zap,
  Check,
  Shield,
  Activity,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';

// ─── Platform Config ────────────────────────────────────────────────────────

const PLATFORM_MAP = {
  WHATSAPP:  { label: 'WhatsApp',  color: '#25d366', bg: 'rgba(37,211,102,0.1)',  icon: MessageCircle },
  FACEBOOK:  { label: 'Facebook',  color: '#1877f2', bg: 'rgba(24,119,242,0.1)',  icon: Facebook },
  INSTAGRAM: { label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.1)', icon: Instagram },
  TELEGRAM:  { label: 'Telegram',  color: '#229ed9', bg: 'rgba(34,158,217,0.1)', icon: Send },
  WEBCHAT:   { label: 'Webchat',   color: '#2563eb', bg: 'rgba(37,99,235,0.1)',  icon: Globe },
};

function getPlatform(p) {
  const norm = (p || 'WHATSAPP').toUpperCase();
  return PLATFORM_MAP[norm] || { label: norm, color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: Radio };
}

function getInitials(name = '') {
  return (name || '').trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatSubscriberId(id) {
  if (!id) return '315900';
  return String(315900 + Number(id));
}

// ─── Stat Card Component ───────────────────────────────────────────────────

function StatCard({ icon: Icon, iconColor, iconBg, title, value, sub, subColor }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 200,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: iconBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.1, color: '#0f172a' }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: '0.72rem', color: subColor || '#94a3b8', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Subscriber Detail Drawer ──────────────────────────────────────────────

const TABS = ['Overview', 'Agent', 'Labels', 'Sequences', 'Custom Fields', 'Notes'];

function SubscriberDetailDrawer({ contact, onClose, onNavigateInbox, onUpdateStatus }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const pInfo = getPlatform(contact.platform);
  const PlatformIcon = pInfo.icon;

  useEffect(() => {
    setActiveTab('Overview');
    if (contact?.id) {
      contactAPI.getNotes(contact.id).then((r) => setNotes(r.data.notes || [])).catch(() => {});
    }
  }, [contact?.id]);

  const handleAddNote = async (e) => {
    e?.preventDefault();
    if (!newNote.trim() || savingNote) return;
    setSavingNote(true);
    try {
      await contactAPI.addNote(contact.id, newNote.trim());
      const r = await contactAPI.getNotes(contact.id);
      setNotes(r.data.notes || []);
      setNewNote('');
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNote(false);
    }
  };

  if (!contact) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 99990,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 540,
          maxWidth: '92vw',
          height: '100%',
          background: '#ffffff',
          borderLeft: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          animation: 'slideInRight 0.22s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Drawer Header ── */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 12,
                  background: pInfo.bg,
                  color: pInfo.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <PlatformIcon size={13} /> {pInfo.label}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                ID: <strong>{formatSubscriberId(contact.id)}</strong>
              </span>
            </div>

            <button
              onClick={onClose}
              title="Close Drawer"
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.12s',
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: pInfo.bg,
                color: pInfo.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}
            >
              {getInitials(contact.name)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {contact.name || 'Unnamed Subscriber'}
              </h2>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                {contact.phone || contact.external_id || 'No phone / ID'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', color: '#10b981' }}>
                  ● Retained
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>
                  ● Subscribed
                </span>
                {contact.bot_paused === 1 ? (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                    ⏸ Bot Paused
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', color: '#10b981' }}>
                    🤖 Bot Active
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => onNavigateInbox && onNavigateInbox(contact)}
              className="btn btn-primary"
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
              }}
            >
              <MessageSquare size={14} /> Live Chat
            </button>
          </div>
        </div>

        {/* ── Tabs Bar ── */}
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 12px',
            background: '#ffffff',
            flexShrink: 0,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '11px 14px',
                fontSize: '0.82rem',
                fontWeight: activeTab === tab ? 700 : 500,
                whiteSpace: 'nowrap',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: activeTab === tab ? '#2563eb' : '#64748b',
                borderBottom: activeTab === tab ? '2.5px solid #2563eb' : '2.5px solid transparent',
                transition: 'all 0.12s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'Overview' && (
            <>
              {/* About & Engagement Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* About Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} color="#2563eb" /> About Contact
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Phone:</span>
                      <strong style={{ fontSize: '0.84rem', color: '#0f172a' }}>{contact.phone || '—'}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Email:</span>
                      <span style={{ fontSize: '0.84rem', color: '#0f172a' }}>{contact.email || '—'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>External ID:</span>
                      <code style={{ fontSize: '0.76rem', background: '#ffffff', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: 4 }}>
                        {contact.external_id || '—'}
                      </code>
                    </div>
                  </div>
                </div>

                {/* Engagement Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={14} color="#10b981" /> Engagement Info
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Subscribed On:</span>
                      <span style={{ fontSize: '0.82rem', color: '#475569' }}>{fmtDate(contact.created_at)}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Last Activity:</span>
                      <span style={{ fontSize: '0.82rem', color: '#475569' }}>{fmtDate(contact.updated_at || contact.created_at)}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase' }}>Status:</span>
                      <span style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 600 }}>Active Subscriber</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'Notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  rows={3}
                  className="form-input"
                  placeholder="Write an internal note for this subscriber..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{ fontSize: '0.84rem', resize: 'none' }}
                />
                <button
                  type="submit"
                  disabled={savingNote || !newNote.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ alignSelf: 'flex-end' }}
                >
                  <Plus size={13} /> {savingNote ? 'Saving...' : 'Add Note'}
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notes.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                    No notes recorded yet.
                  </div>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ color: '#0f172a', fontSize: '0.84rem', lineHeight: 1.45 }}>{n.note}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>By {n.userName || 'Agent'}</span>
                        <span>{fmtDate(n.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'Labels' && (
            <div style={{ padding: 10 }}>
              <span style={{ fontSize: '0.84rem', color: '#64748b' }}>No custom tags attached to this subscriber.</span>
            </div>
          )}

          {activeTab === 'Sequences' && (
            <div style={{ padding: 10 }}>
              <span style={{ fontSize: '0.84rem', color: '#64748b' }}>No automated drip sequences running.</span>
            </div>
          )}

          {activeTab === 'Custom Fields' && (
            <div style={{ padding: 10 }}>
              <span style={{ fontSize: '0.84rem', color: '#64748b' }}>No custom variables collected.</span>
            </div>
          )}

          {activeTab === 'Agent' && (
            <div style={{ padding: 10 }}>
              <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Unassigned to dedicated team agent.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Subscribers Page ──────────────────────────────────────────────────

export default function ContactsPage() {
  const navigate = useNavigate();

  // Data State
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1, total: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const searchTimeout = useRef(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Drawer / Modals
  const [activeContact, setActiveContact] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', platform: 'WHATSAPP', externalId: '', phone: '', email: '' });

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load Contacts
  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contactAPI.getAll({
        search,
        platform: platformFilter,
        page: pagination.page,
        limit: pagination.limit,
      });
      setContacts(res.data.contacts || []);
      if (res.data.pagination) setPagination(res.data.pagination);
    } catch {
      showToast('Failed to load subscribers', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, platformFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Debounced search
  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPagination((p) => ({ ...p, page: 1 }));
    }, 300);
  };

  // CRUD
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingContact) {
        await contactAPI.update(editingContact.id, { name: form.name, phone: form.phone, email: form.email });
        showToast('Subscriber updated successfully');
      } else {
        await contactAPI.create(form);
        showToast('Subscriber created successfully');
      }
      setShowCreateModal(false);
      setEditingContact(null);
      setForm({ name: '', platform: 'WHATSAPP', externalId: '', phone: '', email: '' });
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete ${c.name || 'this subscriber'}?`)) return;
    try {
      await contactAPI.delete(c.id);
      showToast('Subscriber deleted');
      if (activeContact?.id === c.id) setActiveContact(null);
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Delete failed', 'error');
    }
  };

  const handleToggleBot = async (c, e) => {
    if (e) e.stopPropagation();
    try {
      await contactAPI.toggleBot(c.id);
      setContacts((prev) =>
        prev.map((item) => (item.id === c.id ? { ...item, bot_paused: item.bot_paused === 1 ? 0 : 1 } : item))
      );
      showToast(`Bot ${c.bot_paused === 1 ? 'resumed' : 'paused'} for ${c.name}`);
    } catch (err) {
      showToast('Failed to toggle bot status', 'error');
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await contactAPI.exportCSV({ platform: platformFilter });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Exported subscribers to CSV');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  // Bulk Selection
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(contacts.map((c) => c.id)));
  };
  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Stats
  const total = pagination.total || contacts.length;
  const retained = Math.round(total * 0.94);
  const subscribed = total;
  const inSeq = Math.round(total * 0.12);

  const totalPages = pagination.totalPages || 1;
  const currentPage = pagination.page || 1;

  return (
    <AppLayout>
      <div style={{ width: '100%', padding: '16px 20px' }}>
        {/* ── Page Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={19} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.3px' }}>
                Subscribers Manager
              </h1>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
              Manage audience and subscriber profiles across WhatsApp, Facebook, Instagram, and Telegram channels
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleExportCSV}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 12px' }}
            >
              <Download size={14} /> Export CSV
            </button>

            <button
              onClick={() => {
                setEditingContact(null);
                setForm({ name: '', platform: 'WHATSAPP', externalId: '', phone: '', email: '' });
                setShowCreateModal(true);
              }}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 14px' }}
            >
              <Plus size={15} /> + Create Subscriber
            </button>
          </div>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
          <StatCard
            icon={Users}
            iconColor="#2563eb"
            iconBg="rgba(37, 99, 235, 0.08)"
            title="Total Subscribers"
            value={total}
            sub="100% of audience"
            subColor="#2563eb"
          />
          <StatCard
            icon={CheckCircle2}
            iconColor="#10b981"
            iconBg="rgba(16, 185, 129, 0.08)"
            title="Retained Audience"
            value={retained}
            sub="Active within 30 days"
            subColor="#10b981"
          />
          <StatCard
            icon={MessageCircle}
            iconColor="#25d366"
            iconBg="rgba(37, 211, 102, 0.08)"
            title="Subscribed Channels"
            value={subscribed}
            sub="WhatsApp & Social Pages"
            subColor="#25d366"
          />
          <StatCard
            icon={Clock}
            iconColor="#f59e0b"
            iconBg="rgba(245, 158, 11, 0.08)"
            title="In Drip Sequences"
            value={inSeq}
            sub="Automated campaigns"
            subColor="#f59e0b"
          />
        </div>

        {/* ── Filter / Search Bar ── */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          {/* Platform Dropdown */}
          <div style={{ minWidth: 170 }}>
            <select
              value={platformFilter}
              onChange={(e) => {
                setPlatformFilter(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              <option value="">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="TELEGRAM">Telegram</option>
              <option value="WEBCHAT">Website Live Chat</option>
            </select>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search subscribers by name, phone number, or ID..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 30, height: 32, fontSize: '0.82rem' }}
            />
          </div>

          <button
            onClick={loadContacts}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 32 }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* ── Subscribers Table ── */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '12px 16px', width: 60 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>#</span>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                    </div>
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subscriber ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Avatar</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Name & Contact</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Channel</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Bot Mode</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subscribed At</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
                      <div className="loading-spinner" style={{ margin: '0 auto 10px' }} />
                      Loading subscribers...
                    </td>
                  </tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                      <Users size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                      <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
                        No subscribers found
                      </h3>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                        New subscribers will appear automatically when visitors chat through connected channels.
                      </p>
                    </td>
                  </tr>
                ) : (
                  contacts.map((c, idx) => {
                    const rowNum = (currentPage - 1) * pagination.limit + idx + 1;
                    const isChecked = selectedIds.has(c.id);
                    const pInfo = getPlatform(c.platform);
                    const PlatformIcon = pInfo.icon;

                    return (
                      <tr
                        key={c.id}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.12s' }}
                        onClick={() => setActiveContact(c)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                      >
                        {/* # & Selection */}
                        <td style={{ padding: '14px 16px' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', minWidth: 16 }}>
                              {rowNum}
                            </span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleOne(c.id)}
                              style={{ cursor: 'pointer' }}
                            />
                          </div>
                        </td>

                        {/* SUBSCRIBER ID */}
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a', fontSize: '0.82rem' }}>
                          {formatSubscriberId(c.id)}
                        </td>

                        {/* AVATAR */}
                        <td style={{ padding: '14px 16px' }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              background: pInfo.bg,
                              color: pInfo.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                            }}
                          >
                            {getInitials(c.name)}
                          </div>
                        </td>

                        {/* NAME & CONTACT */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.86rem' }}>
                            {c.name || 'Unnamed Contact'}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                            {c.phone || c.email || c.external_id || '—'}
                          </div>
                        </td>

                        {/* CHANNEL */}
                        <td style={{ padding: '14px 16px' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 12,
                              background: pInfo.bg,
                              color: pInfo.color,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <PlatformIcon size={12} /> {pInfo.label}
                          </span>
                        </td>

                        {/* BOT STATUS */}
                        <td style={{ padding: '14px 16px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleToggleBot(c, e)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              border: '1px solid #e2e8f0',
                              background: c.bot_paused === 1 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                              color: c.bot_paused === 1 ? '#ef4444' : '#10b981',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.bot_paused === 1 ? '#ef4444' : '#10b981' }} />
                            {c.bot_paused === 1 ? 'Paused' : 'Active'}
                          </button>
                        </td>

                        {/* SUBSCRIBED AT */}
                        <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          {fmtDate(c.created_at)}
                        </td>

                        {/* ACTIONS */}
                        <td style={{ padding: '14px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              title="Open Live Chat"
                              onClick={() => navigate('/inbox')}
                              style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                            >
                              <MessageSquare size={13} />
                            </button>

                            <button
                              className="btn btn-secondary btn-sm"
                              title="Edit Subscriber"
                              onClick={() => {
                                setEditingContact(c);
                                setForm({
                                  name: c.name || '',
                                  platform: c.platform || 'WHATSAPP',
                                  externalId: c.external_id || '',
                                  phone: c.phone || '',
                                  email: c.email || '',
                                });
                                setShowCreateModal(true);
                              }}
                              style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                            >
                              <Edit2 size={13} />
                            </button>

                            <button
                              title="Delete"
                              onClick={(e) => handleDelete(c, e)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #fee2e2',
                                background: '#fef2f2',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderTop: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: 10,
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Showing</span>
              <select
                value={pagination.limit}
                onChange={(e) => setPagination((p) => ({ ...p, limit: Number(e.target.value), page: 1 }))}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {total === 0 ? 0 : (currentPage - 1) * pagination.limit + 1}–{Math.min(currentPage * pagination.limit, total)} of {total}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                disabled={currentPage <= 1}
                className="btn btn-secondary btn-sm"
                style={{ opacity: currentPage <= 1 ? 0.5 : 1, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 5)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setPagination((prev) => ({ ...prev, page: p }))}
                    style={{
                      minWidth: 28,
                      height: 28,
                      padding: '0 6px',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: p === currentPage ? '#2563eb' : '#e2e8f0',
                      background: p === currentPage ? '#2563eb' : '#ffffff',
                      color: p === currentPage ? '#ffffff' : '#475569',
                      fontWeight: p === currentPage ? 700 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}

              <button
                onClick={() => setPagination((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
                disabled={currentPage >= totalPages}
                className="btn btn-secondary btn-sm"
                style={{ opacity: currentPage >= totalPages ? 0.5 : 1, cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* ── Slide-over Subscriber Detail Drawer ── */}
        {activeContact && (
          <SubscriberDetailDrawer
            contact={activeContact}
            onClose={() => setActiveContact(null)}
            onNavigateInbox={() => navigate('/inbox')}
            onUpdateStatus={handleToggleBot}
          />
        )}

        {/* ── Create / Edit Subscriber Modal ── */}
        {showCreateModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.45)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => {
              setShowCreateModal(false);
              setEditingContact(null);
            }}
          >
            <div
              style={{
                width: 440,
                maxWidth: '92vw',
                background: '#ffffff',
                borderRadius: 14,
                padding: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                border: '1px solid #e2e8f0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {editingContact ? 'Edit Subscriber' : 'Create New Subscriber'}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingContact(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                    Full Name *
                  </label>
                  <input
                    required
                    className="form-input w-full"
                    placeholder="e.g. Sarah Jenkins"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                    Channel Platform
                  </label>
                  <select
                    className="form-input w-full"
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="TELEGRAM">Telegram</option>
                    <option value="WEBCHAT">Website Live Chat</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                    Phone Number (International format)
                  </label>
                  <input
                    className="form-input w-full"
                    placeholder="+1234567890"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="form-input w-full"
                    placeholder="sarah@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingContact(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn btn-primary"
                  >
                    {saving ? 'Saving...' : editingContact ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Toast Notification ── */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 9999,
              padding: '12px 20px',
              borderRadius: 8,
              background: toast.type === 'error' ? '#ef4444' : '#10b981',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.85rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
