import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { contactAPI } from '../../services/api';
import { useNavigate } from 'react-router';

function getPlatformBadge(platform) {
  const map = {
    WHATSAPP: { label: 'WhatsApp', icon: '📱', color: '#25d366', bg: 'rgba(37,211,102,0.1)' },
    FACEBOOK: { label: 'Facebook', icon: '📘', color: '#1877f2', bg: 'rgba(24,119,242,0.1)' },
    INSTAGRAM: { label: 'Instagram', icon: '📷', color: '#e1306c', bg: 'rgba(225,48,108,0.1)' },
    TELEGRAM: { label: 'Telegram', icon: '✈️', color: '#229ed9', bg: 'rgba(34,158,217,0.1)' },
    WEBCHAT: { label: 'Webchat', icon: '🌐', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  };
  return map[platform] || { label: platform, icon: '💬', color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
}

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 15, totalPages: 1, total: 0 });

  // Toast
  const [toast, setToast] = useState(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactConversations, setContactConversations] = useState([]);
  const [saving, setSaving] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: '',
    platform: 'WHATSAPP',
    externalId: '',
    phone: '',
    email: '',
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

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
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, platformFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Handle Create / Edit Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingContact) {
        await contactAPI.update(editingContact.id, {
          name: form.name,
          phone: form.phone,
          email: form.email,
        });
        showToast('Contact updated successfully');
      } else {
        await contactAPI.create(form);
        showToast('Contact created successfully');
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

  // Open Edit Modal
  const handleEdit = (contact) => {
    setEditingContact(contact);
    setForm({
      name: contact.name || '',
      platform: contact.platform || 'WHATSAPP',
      externalId: contact.external_id || '',
      phone: contact.phone || '',
      email: contact.email || '',
    });
    setShowCreateModal(true);
  };

  // Delete Contact
  const handleDelete = async (contact) => {
    if (!window.confirm(`Are you sure you want to delete ${contact.name}?`)) return;
    try {
      await contactAPI.delete(contact.id);
      showToast('Contact deleted');
      loadContacts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Delete failed', 'error');
    }
  };

  // View Details Drawer
  const handleViewDetails = async (contact) => {
    setSelectedContact(contact);
    try {
      const res = await contactAPI.getOne(contact.id);
      setContactConversations(res.data.conversations || []);
    } catch (err) {
      console.error(err);
      setContactConversations([]);
    }
  };

  // CSV Export
  const handleExportCSV = async () => {
    try {
      const res = await contactAPI.exportCSV({ platform: platformFilter });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `contacts_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Contacts exported to CSV');
    } catch (err) {
      console.error(err);
      showToast('Failed to export CSV', 'error');
    }
  };

  return (
    <AppLayout>
      <div className="page-header flex justify-between items-center" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>Contacts Directory 📇</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Manage customer contacts across all integrated channels
          </p>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            📥 Export CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingContact(null);
              setForm({ name: '', platform: 'WHATSAPP', externalId: '', phone: '', email: '' });
              setShowCreateModal(true);
            }}
          >
            + Add Contact
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            padding: '12px 20px', borderRadius: 8,
            background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
            color: '#fff', fontWeight: 500, boxShadow: 'var(--shadow-md)'
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Filters Bar */}
      <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            className="form-input w-full"
            placeholder="🔍 Search by name, phone, email or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Platform chips */}
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          <button
            className={`filter-chip ${platformFilter === '' ? 'active' : ''}`}
            onClick={() => setPlatformFilter('')}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.85rem', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: platformFilter === '' ? 'var(--primary)' : 'var(--bg-card)',
              color: platformFilter === '' ? '#fff' : 'var(--text-primary)'
            }}
          >
            All Platforms
          </button>
          {['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'WEBCHAT'].map((p) => {
            const pInfo = getPlatformBadge(p);
            const active = platformFilter === p;
            return (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: '0.85rem', cursor: 'pointer',
                  border: `1px solid ${active ? pInfo.color : 'var(--border)'}`,
                  background: active ? pInfo.color : 'var(--bg-card)',
                  color: active ? '#fff' : 'var(--text-primary)'
                }}
              >
                {pInfo.icon} {pInfo.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contacts Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Loading contacts…</p>
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>👤</div>
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>No contacts found</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Contacts will be automatically added when customers message your channels.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '14px 16px' }}>Contact</th>
                <th style={{ padding: '14px 16px' }}>Platform</th>
                <th style={{ padding: '14px 16px' }}>Phone / Email</th>
                <th style={{ padding: '14px 16px' }}>Conversations</th>
                <th style={{ padding: '14px 16px' }}>Joined Date</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const pInfo = getPlatformBadge(c.platform);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="table-row">
                    <td style={{ padding: '14px 16px' }}>
                      <div className="flex items-center gap-3">
                        <div
                          style={{
                            width: 38, height: 38, borderRadius: '50%', background: pInfo.bg,
                            color: pInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: '0.9rem'
                          }}
                        >
                          {getInitials(c.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.name || 'Unknown'}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ID: {c.external_id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600,
                          color: pInfo.color, background: pInfo.bg
                        }}
                      >
                        {pInfo.icon} {pInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.88rem' }}>{c.phone || c.email || '—'}</div>
                      {c.phone && c.email && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 10,
                          fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)'
                        }}
                      >
                        💬 {c.conversationCount || 0}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div className="flex gap-1 justify-between" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-xs btn-secondary"
                          title="View Conversations"
                          onClick={() => handleViewDetails(c)}
                        >
                          👁️ Details
                        </button>
                        <button
                          className="btn btn-xs btn-secondary"
                          title="Edit Contact"
                          onClick={() => handleEdit(c)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-xs btn-danger"
                          title="Delete Contact"
                          onClick={() => handleDelete(c)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Showing {contacts.length} of {pagination.total} contacts
            </span>
            <div className="flex gap-2">
              <button
                className="btn btn-sm btn-secondary"
                disabled={pagination.page <= 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </button>
              <span style={{ padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600 }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="btn btn-sm btn-secondary"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 440, maxWidth: '90vw', padding: 24 }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>
              {editingContact ? 'Edit Contact' : 'Create New Contact'}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Full Name</label>
                <input
                  className="form-input w-full"
                  required
                  placeholder="e.g. John Doe"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              {!editingContact && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Platform</label>
                    <select
                      className="form-input w-full"
                      value={form.platform}
                      onChange={e => setForm({ ...form, platform: e.target.value })}
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="FACEBOOK">Facebook Messenger</option>
                      <option value="INSTAGRAM">Instagram</option>
                      <option value="TELEGRAM">Telegram</option>
                      <option value="WEBCHAT">Webchat</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                      Platform External ID / User ID
                    </label>
                    <input
                      className="form-input w-full"
                      required
                      placeholder="e.g. 1234567890 (Phone / PSID)"
                      value={form.externalId}
                      onChange={e => setForm({ ...form, externalId: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Phone Number</label>
                <input
                  className="form-input w-full"
                  placeholder="+1 234 567 8900"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Email Address</label>
                <input
                  type="email"
                  className="form-input w-full"
                  placeholder="john@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingContact(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingContact ? 'Update Contact' : 'Create Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Drawer Modal */}
      {selectedContact && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
          <div className="card" style={{ width: 480, height: '100%', borderRadius: 0, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Contact Details</h3>
              <button className="btn btn-sm btn-secondary" onClick={() => setSelectedContact(null)}>✕ Close</button>
            </div>

            <div className="flex items-center gap-3" style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div
                style={{
                  width: 54, height: 54, borderRadius: '50%',
                  background: getPlatformBadge(selectedContact.platform).bg,
                  color: getPlatformBadge(selectedContact.platform).color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '1.2rem'
                }}
              >
                {getInitials(selectedContact.name)}
              </div>
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedContact.name}</h4>
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: '0.8rem', fontWeight: 600, color: getPlatformBadge(selectedContact.platform).color
                  }}
                >
                  {getPlatformBadge(selectedContact.platform).icon} {selectedContact.platform}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24, fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>External ID:</span> <code>{selectedContact.external_id}</code>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Phone:</span> {selectedContact.phone || 'N/A'}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Email:</span> {selectedContact.email || 'N/A'}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>First Contact:</span> {new Date(selectedContact.created_at).toLocaleString()}
              </div>
            </div>

            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Conversation History ({contactConversations.length})</h4>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
              {contactConversations.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No conversations yet.</p>
              ) : (
                contactConversations.map(conv => (
                  <div
                    key={conv.id}
                    className="card"
                    style={{
                      padding: 12, cursor: 'pointer', border: '1px solid var(--border)',
                      transition: 'border 0.2s', background: 'var(--bg-base)'
                    }}
                    onClick={() => {
                      setSelectedContact(null);
                      navigate('/inbox');
                    }}
                  >
                    <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }} className={`badge badge-${conv.status.toLowerCase()}`}>
                        {conv.status}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }} className="truncate">
                      {conv.lastMessageBody || 'No messages'}
                    </p>
                  </div>
                ))
              )}
            </div>

            <button
              className="btn btn-primary w-full"
              style={{ marginTop: 20 }}
              onClick={() => {
                setSelectedContact(null);
                navigate('/inbox');
              }}
            >
              💬 Open in Live Chat Inbox
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
