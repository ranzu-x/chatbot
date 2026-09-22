import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { contactAPI, labelAPI, contactListAPI, customFieldAPI, sequenceAPI, integrationAPI } from '../../services/api';
import { useNavigate } from 'react-router';
import {
  Users, MessageSquare, CheckCircle2, Download, Upload, RefreshCw, Search, Plus, Edit2, Trash2,
  Tag, X, ShieldCheck, ShieldOff, Bot, Pause, SlidersHorizontal, Zap, ListChecks, Info,
} from 'lucide-react';
import {
  getPlatform, PLATFORM_ORDER, PLATFORM_IMPORT_EXPORT, STATUS_OPTIONS,
  getInitials, resolveMediaUrl, fmtDate, formatSubscriberId, downloadBlob,
} from './subscriberUtils';
import SubscriberDetailDrawer from './SubscriberDetailDrawer';
import ManageModal from './ManageModal';
import ImportModal from './ImportModal';
import { BulkListModal, BulkSequenceModal, DeleteConfirmModal } from './BulkActionModals';

// ─── Small shared bits ──────────────────────────────────────────────────────

function SubscriberAvatar({ name, avatar, size = 36, style = {} }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = getInitials(name);
  useEffect(() => setImgFailed(false), [avatar]);

  if (avatar && !imgFailed) {
    return (
      <img
        src={resolveMediaUrl(avatar)} alt={name || 'Avatar'} referrerPolicy="no-referrer" crossOrigin="anonymous"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '1px solid var(--border)', flexShrink: 0, ...style }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700,
      border: '1px solid var(--border)', flexShrink: 0, ...style,
    }}>
      {initials}
    </div>
  );
}

function StatCard({ icon: Icon, title, value, sub }) {
  return (
    <div style={{
      flex: 1, minWidth: 190, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, background: 'var(--bg-hover)', color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={19} />
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.1, color: 'var(--text-primary)' }}>{value}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

const selectBase = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer', height: 32,
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const navigate = useNavigate();

  // Data
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, totalPages: 1, total: 0 });
  const [stats, setStats] = useState({ total: 0, retained: 0, unsubscribed: 0, inSequence: 0 });

  // Filters — channel defaults to WhatsApp, per requirement.
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('WHATSAPP');
  const [accountFilter, setAccountFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const searchTimeout = useRef(null);

  // Reference data
  const [availableLabels, setAvailableLabels] = useState([]);
  const [lists, setLists] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [integrations, setIntegrations] = useState([]);

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modals
  const [activeContact, setActiveContact] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', platform: 'WHATSAPP', externalId: '', phone: '', email: '' });
  const [showManageModal, setShowManageModal] = useState(false);
  const [manageTab, setManageTab] = useState('labels');
  const [showImportModal, setShowImportModal] = useState(false);
  const [bulkListModal, setBulkListModal] = useState(null); // { mode: 'add' | 'remove' }
  const [bulkSequenceModal, setBulkSequenceModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { ids, singleName }
  const [syncingAvatars, setSyncingAvatars] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Loaders ──
  const loadLabels = useCallback(() => {
    labelAPI.getAll().then((r) => setAvailableLabels(r.data.labels || [])).catch(() => {});
  }, []);
  const loadLists = useCallback(() => {
    contactListAPI.getAll().then((r) => setLists(r.data.lists || [])).catch(() => {});
  }, []);
  const loadCustomFields = useCallback(() => {
    customFieldAPI.getAll().then((r) => setCustomFields(r.data.fields || [])).catch(() => {});
  }, []);
  const loadSequences = useCallback(() => {
    sequenceAPI.getAll().then((r) => setSequences(r.data.sequences || [])).catch(() => {});
  }, []);

  useEffect(() => { loadLabels(); loadLists(); loadCustomFields(); loadSequences(); }, [loadLabels, loadLists, loadCustomFields, loadSequences]);

  // Integrations for the "Account" filter — reloads per selected channel.
  useEffect(() => {
    if (!platformFilter) { setIntegrations([]); setAccountFilter(''); return; }
    integrationAPI.getAll().then((r) => {
      setIntegrations((r.data.integrations || []).filter((i) => i.platform === platformFilter));
    }).catch(() => {});
    setAccountFilter('');
  }, [platformFilter]);

  const loadContacts = useCallback(() => {
    setLoading(true);
    const params = {
      search, platform: platformFilter, labelId: labelFilter, listId: listFilter,
      integrationId: accountFilter, page: pagination.page, limit: pagination.limit,
    };
    if (statusFilter === 'SUBSCRIBED' || statusFilter === 'UNSUBSCRIBED') params.status = statusFilter;
    if (statusFilter === 'RETAINED' || statusFilter === 'NOT_RETAINED') params.retained = statusFilter;

    contactAPI.getAll(params)
      .then((res) => {
        setContacts(res.data.contacts || []);
        if (res.data.pagination) setPagination((p) => ({ ...p, ...res.data.pagination }));
      })
      .catch(() => showToast('Failed to load subscribers', 'error'))
      .finally(() => setLoading(false));
  }, [search, platformFilter, labelFilter, listFilter, accountFilter, statusFilter, pagination.page, pagination.limit]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    contactAPI.getStats({ platform: platformFilter }).then((r) => setStats(r.data.stats)).catch(() => {});
  }, [platformFilter, pagination.total]);

  const handleSearchChange = (val) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setPagination((p) => ({ ...p, page: 1 })), 300);
  };

  const resetPage = () => setPagination((p) => ({ ...p, page: 1 }));

  // ── CRUD ──
  const isWhatsAppQuickAdd = !editingContact && platformFilter === 'WHATSAPP';

  const openCreateModal = () => {
    setEditingContact(null);
    setForm({ name: '', platform: platformFilter || 'WHATSAPP', externalId: '', phone: '', email: '' });
    setShowCreateModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingContact) {
        await contactAPI.update(editingContact.id, { name: form.name, phone: form.phone, email: form.email });
        showToast('Subscriber updated');
      } else {
        const externalId = form.platform === 'WHATSAPP' ? form.phone : form.externalId;
        await contactAPI.create({ ...form, externalId });
        showToast('Subscriber created');
      }
      setShowCreateModal(false);
      setEditingContact(null);
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const patchContactLocally = (id, patch) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleToggleBot = async (c, e) => {
    e?.stopPropagation();
    try {
      await contactAPI.toggleBot(c.id);
      patchContactLocally(c.id, { bot_paused: c.bot_paused === 1 ? 0 : 1 });
    } catch { showToast('Failed to toggle bot status', 'error'); }
  };

  const handleToggleSubscription = async (c, e) => {
    e?.stopPropagation();
    const next = c.subscription_status === 'UNSUBSCRIBED' ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
    try {
      await contactAPI.updateSubscription(c.id, next);
      patchContactLocally(c.id, { subscription_status: next });
    } catch { showToast('Failed to update subscription status', 'error'); }
  };

  const requestDelete = (c, e) => {
    e?.stopPropagation();
    setDeleteConfirm({ ids: [c.id], singleName: c.name || 'this subscriber' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.ids.length === 1) await contactAPI.delete(deleteConfirm.ids[0]);
      else await contactAPI.bulkDelete(deleteConfirm.ids);
      showToast(`Deleted ${deleteConfirm.ids.length} subscriber(s)`);
      if (activeContact && deleteConfirm.ids.includes(activeContact.id)) setActiveContact(null);
      setSelectedIds(new Set());
      setDeleteConfirm(null);
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Delete failed', 'error');
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await contactAPI.exportCSV({ platform: platformFilter, labelId: labelFilter, listId: listFilter, status: statusFilter === 'SUBSCRIBED' || statusFilter === 'UNSUBSCRIBED' ? statusFilter : undefined });
      downloadBlob(new Blob([res.data]), `subscribers_${new Date().toISOString().slice(0, 10)}.csv`);
      showToast('Exported subscribers to CSV');
    } catch { showToast('Export failed', 'error'); }
  };

  const handleSyncAvatars = async () => {
    setSyncingAvatars(true);
    try {
      const res = await contactAPI.syncAvatars();
      showToast(`Synced ${res.data?.updated || 0} subscriber avatar(s)`);
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Avatar sync failed', 'error');
    } finally {
      setSyncingAvatars(false);
    }
  };

  // ── Selection ──
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  const toggleOne = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Bulk actions ──
  const [bulkLabelModal, setBulkLabelModal] = useState(false);
  const [selectedBulkLabelId, setSelectedBulkLabelId] = useState('');
  const [applyingBulkLabel, setApplyingBulkLabel] = useState(false);

  const handleApplyBulkLabel = async () => {
    if (!selectedBulkLabelId || selectedIds.size === 0) return;
    setApplyingBulkLabel(true);
    try {
      await labelAPI.bulkAttach({ contactIds: Array.from(selectedIds), labelId: Number(selectedBulkLabelId) });
      showToast(`Labeled ${selectedIds.size} subscriber(s)`);
      setBulkLabelModal(false);
      setSelectedBulkLabelId('');
      setSelectedIds(new Set());
      loadLabels();
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to apply label', 'error');
    } finally {
      setApplyingBulkLabel(false);
    }
  };

  const handleBulkList = async (listId) => {
    try {
      const ids = Array.from(selectedIds);
      if (bulkListModal.mode === 'add') await contactListAPI.bulkAdd(ids, listId);
      else await contactListAPI.bulkRemove(ids, listId);
      showToast(`${bulkListModal.mode === 'add' ? 'Added to' : 'Removed from'} list`);
      setBulkListModal(null);
      setSelectedIds(new Set());
      loadLists();
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed', 'error');
    }
  };

  const handleBulkSequence = async (sequenceId) => {
    try {
      const res = await contactAPI.bulkSequence(Array.from(selectedIds), sequenceId);
      showToast(res.data.message);
      setBulkSequenceModal(false);
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign sequence', 'error');
    }
  };

  const totalPages = pagination.totalPages || 1;
  const currentPage = pagination.page || 1;

  const importRules = platformFilter ? PLATFORM_IMPORT_EXPORT[platformFilter] : null;
  const canImportCurrentChannel = importRules?.canImport;

  return (
    <AppLayout>
      <div style={{ width: '100%', padding: '16px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={19} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Subscribers Manager</h1>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2, marginLeft: 46 }}>
              Manage audience and subscriber profiles across every connected channel
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleSyncAvatars} disabled={syncingAvatars} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 12px' }} title="Fetch and sync avatars from Telegram, Facebook, and Instagram">
              <RefreshCw size={13} className={syncingAvatars ? 'animate-spin' : ''} /> {syncingAvatars ? 'Syncing...' : 'Sync Avatars'}
            </button>

            <button onClick={() => { setManageTab('labels'); setShowManageModal(true); }} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 12px' }}>
              <SlidersHorizontal size={13} /> Manage
            </button>

            <button
              onClick={() => canImportCurrentChannel ? setShowImportModal(true) : showToast(importRules?.reason || 'Choose WhatsApp or Telegram to import subscribers', 'error')}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 12px', opacity: canImportCurrentChannel ? 1 : 0.55 }}
              title={canImportCurrentChannel ? `Import ${getPlatform(platformFilter).label} subscribers` : (importRules?.reason || 'Select a channel that supports import')}
            >
              <Upload size={13} /> Import
            </button>

            <button onClick={handleExportCSV} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 12px' }}>
              <Download size={14} /> Export
            </button>

            <button onClick={openCreateModal} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 14px' }}>
              <Plus size={15} /> {isWhatsAppQuickAdd ? 'Add Subscriber' : 'Create Subscriber'}
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
          <StatCard icon={Users} title={platformFilter ? `${getPlatform(platformFilter).label} Subscribers` : 'Total Subscribers'} value={stats.total} sub="In current view" />
          <StatCard icon={CheckCircle2} title="Retained" value={stats.retained} sub="Active within 30 days" />
          <StatCard icon={ShieldOff} title="Unsubscribed" value={stats.unsubscribed} sub="Opted out" />
          <StatCard icon={Zap} title="In Sequences" value={stats.inSequence} sub="Actively enrolled" />
        </div>

        {/* Filter Bar */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
          <select value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); resetPage(); }} style={{ ...selectBase, minWidth: 150, fontWeight: platformFilter ? 600 : 400 }}>
            <option value="">All Channels</option>
            {PLATFORM_ORDER.map((p) => <option key={p} value={p}>{getPlatform(p).label}</option>)}
          </select>

          {platformFilter && (
            <select value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); resetPage(); }} style={{ ...selectBase, minWidth: 150 }} disabled={integrations.length === 0}>
              <option value="">{integrations.length === 0 ? 'No accounts' : 'All accounts'}</option>
              {integrations.map((i) => <option key={i.id} value={i.id}>{i.wa_display_phone || i.fb_page_name || i.name || `Account #${i.id}`}</option>)}
            </select>
          )}

          <select value={labelFilter} onChange={(e) => { setLabelFilter(e.target.value); resetPage(); }} style={{ ...selectBase, minWidth: 150, fontWeight: labelFilter ? 600 : 400 }}>
            <option value="">All Labels ({availableLabels.length})</option>
            {availableLabels.map((lbl) => <option key={lbl.id} value={lbl.id}>{lbl.name} ({lbl.subscriberCount || 0})</option>)}
          </select>

          <select value={listFilter} onChange={(e) => { setListFilter(e.target.value); resetPage(); }} style={{ ...selectBase, minWidth: 140, fontWeight: listFilter ? 600 : 400 }}>
            <option value="">All Lists</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.memberCount || 0})</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }} style={{ ...selectBase, minWidth: 140, fontWeight: statusFilter ? 600 : 400 }}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" placeholder="Search by name, phone, or ID..." value={search}
              onChange={(e) => handleSearchChange(e.target.value)} className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.82rem' }}
            />
          </div>

          {(platformFilter !== 'WHATSAPP' || accountFilter || labelFilter || listFilter || statusFilter || search) && (
            <button
              onClick={() => { setPlatformFilter('WHATSAPP'); setAccountFilter(''); setLabelFilter(''); setListFilter(''); setStatusFilter(''); setSearch(''); resetPage(); }}
              className="btn btn-secondary btn-sm" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4, height: 32 }}
            >
              <X size={12} /> Reset
            </button>
          )}

          <button onClick={loadContacts} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 32 }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              <strong>{selectedIds.size}</strong> subscriber(s) selected
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setBulkLabelModal(true)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                <Tag size={12} /> Assign Label
              </button>
              <button onClick={() => setBulkListModal({ mode: 'add' })} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                <ListChecks size={12} /> Add to List
              </button>
              <button onClick={() => setBulkListModal({ mode: 'remove' })} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                <ListChecks size={12} /> Remove from List
              </button>
              <button onClick={() => setBulkSequenceModal(true)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                <Zap size={12} /> Assign Sequence
              </button>
              <button
                onClick={() => setDeleteConfirm({ ids: Array.from(selectedIds) })}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(220,38,38,0.25)', background: 'rgba(220,38,38,0.06)', color: '#b91c1c', cursor: 'pointer' }}
              >
                <Trash2 size={12} /> Delete
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="btn btn-secondary btn-sm" style={{ fontSize: '0.78rem' }}>Clear</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ overflowX: 'auto', maxHeight: '68vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '12px 16px', width: 56 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>ID</th>
                  {platformFilter === 'WHATSAPP' ? (
                    <>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 700 }}>WhatsApp Number</th>
                    </>
                  ) : (
                    <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subscriber</th>
                  )}
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Channel</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Labels</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Bot</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subscribed</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={platformFilter === 'WHATSAPP' ? 10 : 9} style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 10px' }} /> Loading subscribers...
                  </td></tr>
                ) : contacts.length === 0 ? (
                  <tr><td colSpan={platformFilter === 'WHATSAPP' ? 10 : 9} style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Users size={36} color="var(--border-light)" style={{ margin: '0 auto 10px' }} />
                    <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>No subscribers found</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Try a different filter, or import/add a subscriber.</p>
                  </td></tr>
                ) : contacts.map((c, idx) => {
                  const rowNum = (currentPage - 1) * pagination.limit + idx + 1;
                  const isChecked = selectedIds.has(c.id);
                  const pInfo = getPlatform(c.platform);
                  const PlatformIcon = pInfo.icon;
                  const subscribed = c.subscription_status !== 'UNSUBSCRIBED';

                  return (
                    <tr
                      key={c.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setActiveContact(c)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-base)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', minWidth: 14 }}>{rowNum}</span>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleOne(c.id)} style={{ cursor: 'pointer' }} />
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                        {formatSubscriberId(c.id)}
                      </td>

                      {platformFilter === 'WHATSAPP' ? (
                        <>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <SubscriberAvatar name={c.name} avatar={c.avatar} size={34} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.name || 'Unnamed Contact'}
                                  </span>
                                  {c.retained && (
                                    <span style={{ fontSize: '0.64rem', fontWeight: 700, padding: '1px 6px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                      Retained
                                    </span>
                                  )}
                                </div>
                                {c.email && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                    {c.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.84rem' }}>
                              {c.phone || c.external_id || '—'}
                            </span>
                          </td>
                        </>
                      ) : (
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <SubscriberAvatar name={c.name} avatar={c.avatar} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.name || 'Unnamed Contact'}
                                </span>
                                {c.retained && (
                                  <span style={{ fontSize: '0.64rem', fontWeight: 700, padding: '1px 6px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    Retained
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                {c.phone || c.email || c.external_id || '—'}
                              </div>
                            </div>
                          </div>
                        </td>
                      )}

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          <PlatformIcon size={12} /> {pInfo.label}
                        </div>
                        {c.accountLabel && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>{c.accountLabel}</div>}
                      </td>

                      <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 200 }}>
                          {(!c.labels || c.labels.length === 0) ? (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                          ) : c.labels.map((lbl) => (
                            <span
                              key={lbl.id} onClick={() => { setLabelFilter(String(lbl.id)); resetPage(); }} title={`Filter by: ${lbl.name}`}
                              style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: lbl.color }} /> {lbl.name}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleToggleSubscription(c, e)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                          {subscribed ? <ShieldCheck size={12} /> : <ShieldOff size={12} />} {subscribed ? 'Subscribed' : 'Unsubscribed'}
                        </button>
                      </td>

                      <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleToggleBot(c, e)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                          {c.bot_paused === 1 ? <Pause size={12} /> : <Bot size={12} />} {c.bot_paused === 1 ? 'Paused' : 'Active'}
                        </button>
                      </td>

                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>

                      <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button className="btn btn-secondary btn-sm" title="Open Inbox" onClick={() => navigate('/inbox')} style={{ padding: '4px 8px', fontSize: '0.76rem' }}>
                            <MessageSquare size={13} />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm" title="Edit"
                            onClick={() => {
                              setEditingContact(c);
                              setForm({ name: c.name || '', platform: c.platform || 'WHATSAPP', externalId: c.external_id || '', phone: c.phone || '', email: c.email || '' });
                              setShowCreateModal(true);
                            }}
                            style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            title="Delete" onClick={(e) => requestDelete(c, e)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.05)', color: '#b91c1c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10, background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing</span>
              <select value={pagination.limit} onChange={(e) => setPagination((p) => ({ ...p, limit: Number(e.target.value), page: 1 }))} style={{ ...selectBase, height: 28 }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {pagination.total === 0 ? 0 : (currentPage - 1) * pagination.limit + 1}–{Math.min(currentPage * pagination.limit, pagination.total)} of {pagination.total}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={currentPage <= 1} className="btn btn-secondary btn-sm" style={{ opacity: currentPage <= 1 ? 0.5 : 1 }}>
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
                <button
                  key={p} onClick={() => setPagination((prev) => ({ ...prev, page: p }))}
                  style={{
                    minWidth: 28, height: 28, padding: '0 6px', borderRadius: 6, border: '1px solid var(--border)',
                    background: p === currentPage ? 'var(--bg-hover)' : 'var(--bg-surface)',
                    color: 'var(--text-primary)', fontWeight: p === currentPage ? 700 : 500, fontSize: '0.8rem', cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}
              <button onClick={() => setPagination((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))} disabled={currentPage >= totalPages} className="btn btn-secondary btn-sm" style={{ opacity: currentPage >= totalPages ? 0.5 : 1 }}>
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Drawer */}
        {activeContact && (
          <SubscriberDetailDrawer
            contact={activeContact}
            availableLabels={availableLabels}
            onClose={() => setActiveContact(null)}
            onNavigateInbox={() => navigate('/inbox')}
            onContactPatched={(id, patch) => { patchContactLocally(id, patch); setActiveContact((prev) => (prev ? { ...prev, ...patch } : prev)); }}
          />
        )}

        {/* Create / Edit Modal */}
        {showCreateModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { setShowCreateModal(false); setEditingContact(null); }}>
            <div style={{ width: 440, maxWidth: '92vw', background: 'var(--bg-surface)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {editingContact ? 'Edit Subscriber' : (isWhatsAppQuickAdd ? 'Add a WhatsApp Subscriber' : 'Create New Subscriber')}
                </h3>
                <button onClick={() => { setShowCreateModal(false); setEditingContact(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>
              {!editingContact && isWhatsAppQuickAdd && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 14px', display: 'flex', gap: 6 }}>
                  <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Adds one number you already have consent to message. For many numbers at once, use Import instead.
                </p>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: isWhatsAppQuickAdd ? 0 : 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>Full Name *</label>
                  <input required className="form-input w-full" placeholder="e.g. Sarah Jenkins" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>

                {!editingContact && !isWhatsAppQuickAdd && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>Channel Platform</label>
                    <select className="form-input w-full" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                      {PLATFORM_ORDER.map((p) => <option key={p} value={p}>{getPlatform(p).label}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>
                    Phone Number {isWhatsAppQuickAdd ? '*' : '(International format)'}
                  </label>
                  <input required={isWhatsAppQuickAdd} className="form-input w-full" placeholder="+1234567890" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>

                {!editingContact && !isWhatsAppQuickAdd && form.platform !== 'WHATSAPP' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>External / Platform ID *</label>
                    <input required className="form-input w-full" placeholder="Chat ID / PSID / IGSID" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>Email Address</label>
                  <input type="email" className="form-input w-full" placeholder="sarah@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => { setShowCreateModal(false); setEditingContact(null); }} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving...' : editingContact ? 'Update' : 'Add'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Manage Modal (Labels / Lists / Custom Fields) */}
        {showManageModal && (
          <ManageModal
            onClose={() => setShowManageModal(false)}
            labels={availableLabels} lists={lists} fields={customFields}
            labelAPI={labelAPI} contactListAPI={contactListAPI} customFieldAPI={customFieldAPI}
            onChanged={() => { loadLabels(); loadLists(); loadCustomFields(); loadContacts(); }}
            showToast={showToast} initialTab={manageTab}
          />
        )}

        {/* Import Modal */}
        {showImportModal && (
          <ImportModal
            platform={platformFilter} contactAPI={contactAPI}
            onClose={() => setShowImportModal(false)}
            onImported={loadContacts} showToast={showToast}
          />
        )}

        {/* Bulk Assign Label */}
        {bulkLabelModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setBulkLabelModal(false)}>
            <div style={{ width: 420, maxWidth: '92vw', background: 'var(--bg-surface)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag size={16} /> Assign Label to {selectedIds.size} Subscriber(s)
                </h3>
                <button onClick={() => setBulkLabelModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <select value={selectedBulkLabelId} onChange={(e) => setSelectedBulkLabelId(e.target.value)} className="form-input w-full" style={{ height: 38, fontSize: '0.84rem', marginBottom: 18 }}>
                <option value="">-- Choose a label --</option>
                {availableLabels.map((lbl) => <option key={lbl.id} value={lbl.id}>{lbl.name}</option>)}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setBulkLabelModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="button" disabled={!selectedBulkLabelId || applyingBulkLabel} onClick={handleApplyBulkLabel} className="btn btn-primary">
                  {applyingBulkLabel ? 'Assigning...' : 'Apply Label'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk List Add/Remove */}
        {bulkListModal && (
          <BulkListModal mode={bulkListModal.mode} count={selectedIds.size} lists={lists} onClose={() => setBulkListModal(null)} onConfirm={handleBulkList} />
        )}

        {/* Bulk Assign Sequence */}
        {bulkSequenceModal && (
          <BulkSequenceModal count={selectedIds.size} sequences={sequences} onClose={() => setBulkSequenceModal(false)} onConfirm={handleBulkSequence} />
        )}

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <DeleteConfirmModal count={deleteConfirm.ids.length} singleName={deleteConfirm.singleName} onClose={() => setDeleteConfirm(null)} onConfirm={confirmDelete} />
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 8,
            background: toast.type === 'error' ? '#b91c1c' : 'var(--text-primary)', color: 'var(--bg-surface)',
            fontWeight: 600, fontSize: '0.85rem', boxShadow: 'var(--shadow-md)',
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
