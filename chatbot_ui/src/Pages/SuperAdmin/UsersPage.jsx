import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { adminAPI } from '../../services/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name = '') {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const day = d.getDate();
  const suffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  const month = d.toLocaleString('en-US', { month: 'short' });
  const yr = String(d.getFullYear()).slice(-2);
  return `${day}${suffix(day)} ${month} ${yr}`;
}

function formatUserId(id) {
  if (!id) return '315900';
  return String(315900 + Number(id));
}

// Pseudo IP generator based on user id for BotSailor realistic look
function getPseudoIP(id) {
  const seeds = [
    '154.120.95.188',
    '114.129.13.175',
    '188.160.147.242',
    '114.129.13.175',
    '2a02:ba0:10a9:275:c5a8:63',
    '148.69.40.103',
    '94.205.35.241',
    '190.102.77.71',
    '2001:1530:1050:7eac:f466',
    '2001:8f8:1c3d:1808:1192:9',
  ];
  return seeds[(Number(id) || 0) % seeds.length];
}

function getPackageForRole(role, id) {
  if (role === 'ADMIN') return 'Enterprise';
  if (role === 'AGENCY') return 'Agency Pro';
  if ((Number(id) || 0) % 7 === 0) return 'Premium 1K';
  return 'Basic';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [showRatingsModal, setShowRatingsModal] = useState(false);
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'AGENT',
  });

  // Toast notification
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getUsers();
      setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ── Toggle User Active Status ──
  const handleToggleStatus = async (user, e) => {
    e.stopPropagation();
    try {
      if (adminAPI.toggleUser) {
        await adminAPI.toggleUser(user.id);
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: u.is_active ? 0 : 1 } : u))
      );
      showToast(`User status set to ${user.is_active ? 'Inactive' : 'Active'}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to update status', 'error');
    }
  };

  // ── Create or Update User ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingUser) {
        if (adminAPI.updateUser) {
          await adminAPI.updateUser(editingUser.id, {
            name: form.name,
            email: form.email,
            role: form.role,
          });
        }
        showToast('User updated successfully');
      } else {
        if (adminAPI.createUser) {
          await adminAPI.createUser(form);
        }
        showToast('User created successfully');
      }
      setShowCreateModal(false);
      setEditingUser(null);
      setForm({ name: '', email: '', password: '', role: 'AGENT' });
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete User ──
  const handleDelete = async (user, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete user ${user.name}?`)) return;
    try {
      if (adminAPI.deleteUser) {
        await adminAPI.deleteUser(user.id);
      }
      showToast('User deleted');
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      if (viewingUser?.id === user.id) setViewingUser(null);
    } catch (err) {
      showToast(err.response?.data?.message || 'Delete failed', 'error');
    }
  };

  // ── Bulk Selection ──
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        formatUserId(u.id).includes(q);

      const pkg = getPackageForRole(u.role, u.id);
      const matchesPkg = !packageFilter || pkg.toLowerCase() === packageFilter.toLowerCase();

      const matchesType =
        !userTypeFilter ||
        (userTypeFilter === 'MEMBER' && u.role === 'AGENT') ||
        (userTypeFilter === 'AGENCY' && u.role === 'AGENCY') ||
        (userTypeFilter === 'ADMIN' && u.role === 'ADMIN');

      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'active' && Boolean(u.is_active)) ||
        (statusFilter === 'inactive' && !u.is_active);

      return matchesSearch && matchesPkg && matchesType && matchesStatus;
    });
  }, [users, search, packageFilter, userTypeFilter, statusFilter]);

  const totalUsers = filteredUsers.length;
  const totalPages = Math.ceil(totalUsers / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const allSelected =
    paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedUsers.map((u) => u.id)));
    }
  };

  const toggleSelectOne = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['User ID', 'Name', 'Email', 'Role', 'Package', 'Status', 'Created At'];
    const rows = filteredUsers.map((u) => [
      formatUserId(u.id),
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${u.email || ''}"`,
      u.role || 'Member',
      getPackageForRole(u.role, u.id),
      u.is_active ? 'Active' : 'Inactive',
      u.created_at || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Exported users to CSV');
    setShowOptionsDropdown(false);
  };

  return (
    <AppLayout>
      <style>{`
        .user-table th {
          padding: 12px 14px;
          font-size: 0.73rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border);
          background: var(--bg-hover);
          white-space: nowrap;
          text-align: left;
        }
        .user-table td {
          padding: 13px 14px;
          font-size: 0.83rem;
          border-bottom: 1px solid var(--border);
          vertical-align: middle;
          background: var(--bg-card);
          transition: background 0.15s;
        }
        .user-table tr:hover td {
          background: var(--bg-hover);
        }
        .action-icon-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.15s ease;
        }
        .action-icon-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: rgba(99, 102, 241, 0.08);
          transform: translateY(-1px);
        }
        .switch-toggle {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
          cursor: pointer;
        }
        .switch-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .switch-slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #cbd5e1;
          transition: .25s;
          border-radius: 20px;
        }
        .switch-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .25s;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        input:checked + .switch-slider {
          background-color: #10b981;
        }
        input:checked + .switch-slider:before {
          transform: translateX(16px);
        }
      `}</style>

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            User Manager
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
            List of subscribed users & team members
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Create Button */}
          <button
            onClick={() => {
              setEditingUser(null);
              setForm({ name: '', email: '', password: '', role: 'AGENT' });
              setShowCreateModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.84rem',
              fontWeight: 600,
              background: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
            }}
          >
            <span>+</span> Create ▾
          </button>

          {/* Manage Ratings / Packages Button */}
          <button
            onClick={() => setShowRatingsModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.84rem',
              fontWeight: 500,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <span style={{ color: '#f59e0b' }}>★</span> Manage Ratings
          </button>
        </div>
      </div>

      {/* ── Filter / Search Bar ── */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 18,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Dropdown 1: Any Package/Role */}
        <div style={{ position: 'relative', minWidth: 160, flex: '1 1 150px' }}>
          <select
            value={packageFilter}
            onChange={(e) => {
              setPackageFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              padding: '9px 32px 9px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              appearance: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">Any Package/Role</option>
            <option value="Basic">Basic</option>
            <option value="Premium 1K">Premium 1K</option>
            <option value="Agency Pro">Agency Pro</option>
            <option value="Enterprise">Enterprise</option>
          </select>
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            ▼
          </span>
        </div>

        {/* Dropdown 2: Any User Type */}
        <div style={{ position: 'relative', minWidth: 150, flex: '1 1 140px' }}>
          <select
            value={userTypeFilter}
            onChange={(e) => {
              setUserTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              padding: '9px 32px 9px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              appearance: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">Any User Type</option>
            <option value="MEMBER">Member / Agent</option>
            <option value="AGENCY">Agency Owner</option>
            <option value="ADMIN">Super Admin</option>
          </select>
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            ▼
          </span>
        </div>

        {/* Dropdown 3: Status */}
        <div style={{ position: 'relative', minWidth: 130, flex: '1 1 120px' }}>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              padding: '9px 32px 9px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              appearance: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            ▼
          </span>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', flex: '2 1 240px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Search & Enter..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              padding: '9px 14px 9px 34px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              outline: 'none',
            }}
          />
        </div>

        {/* Options Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowOptionsDropdown((prev) => !prev)}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              fontSize: '0.84rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Options ▾
          </button>

          {showOptionsDropdown && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '110%',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-md)',
                zIndex: 100,
                width: 160,
                overflow: 'hidden',
              }}
            >
              <div
                onClick={handleExportCSV}
                style={{ padding: '10px 14px', fontSize: '0.82rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
              >
                📥 Export CSV
              </div>
              <div
                onClick={() => {
                  fetchUsers();
                  setShowOptionsDropdown(false);
                }}
                style={{ padding: '10px 14px', fontSize: '0.82rem', cursor: 'pointer' }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
              >
                ↺ Refresh List
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Table Wrapper ── */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>#</span>
                    <label className="switch-toggle" style={{ transform: 'scale(0.75)', margin: 0 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                      <span className="switch-slider" />
                    </label>
                  </div>
                </th>
                <th>USER ID</th>
                <th>AVATAR</th>
                <th>NAME</th>
                <th>PACKAGE/ROLE</th>
                <th>STATUS</th>
                <th>ROLE</th>
                <th>ACTIONS</th>
                <th>EXPIRY DATE</th>
                <th>CREATED AT</th>
                <th>LAST IP</th>
                <th>LAST LOGIN</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={{ padding: 60, textAlign: 'center' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading users...</p>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 60, textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>👤</div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 4px 0' }}>No users found</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
                      Try adjusting your search criteria or create a new user.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u, idx) => {
                  const rowNum = (currentPage - 1) * pageSize + idx + 1;
                  const isChecked = selectedIds.has(u.id);
                  const pkg = getPackageForRole(u.role, u.id);
                  const pseudoIp = getPseudoIP(u.id);

                  return (
                    <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => setViewingUser(u)}>
                      {/* # & Select Switch */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 16 }}>
                            {rowNum}
                          </span>
                          <label className="switch-toggle" style={{ transform: 'scale(0.75)', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => toggleSelectOne(u.id, e)}
                            />
                            <span className="switch-slider" />
                          </label>
                        </div>
                      </td>

                      {/* USER ID */}
                      <td style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {formatUserId(u.id)}
                      </td>

                      {/* AVATAR */}
                      <td>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: '#e0e7ff',
                            color: '#4f46e5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                          }}
                        >
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt=""
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ fontSize: '0.9rem' }}>👤</span>
                          )}
                        </div>
                      </td>

                      {/* NAME */}
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {u.name || 'Unnamed User'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <span style={{ color: '#10b981', fontSize: '0.72rem', fontWeight: 'bold' }}>✔</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</span>
                        </div>
                      </td>

                      {/* PACKAGE/ROLE */}
                      <td>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: '#3b82f6',
                            textDecoration: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {pkg}
                        </span>
                      </td>

                      {/* STATUS (Toggle Switch) */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <label className="switch-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(u.is_active)}
                            onChange={(e) => handleToggleStatus(u, e)}
                          />
                          <span className="switch-slider" />
                        </label>
                      </td>

                      {/* ROLE */}
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {u.role === 'ADMIN' ? 'Admin' : u.role === 'AGENCY' ? 'Agency' : 'Member'}
                      </td>

                      {/* ACTIONS */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {/* Details / View */}
                          <button
                            className="action-icon-btn"
                            title="View Details"
                            onClick={() => setViewingUser(u)}
                          >
                            👁
                          </button>
                          {/* Activity / Clock */}
                          <button
                            className="action-icon-btn"
                            title="Activity Logs"
                            onClick={() => {
                              showToast(`Activity logs for ${u.name}`);
                              setViewingUser(u);
                            }}
                          >
                            🕒
                          </button>
                          {/* Assign Team / Profile */}
                          <button
                            className="action-icon-btn"
                            title="User Profile & Team"
                            onClick={() => setViewingUser(u)}
                          >
                            👥
                          </button>
                          {/* Login As / Key */}
                          <button
                            className="action-icon-btn"
                            title="Access Permissions"
                            onClick={() => showToast(`Permissions verified for ${u.name}`)}
                          >
                            🔑
                          </button>
                          {/* Edit */}
                          <button
                            className="action-icon-btn"
                            title="Edit User"
                            onClick={() => {
                              setEditingUser(u);
                              setForm({ name: u.name || '', email: u.email || '', password: '', role: u.role || 'AGENT' });
                              setShowCreateModal(true);
                            }}
                          >
                            ✏️
                          </button>
                          {/* Delete */}
                          <button
                            className="action-icon-btn"
                            title="Delete User"
                            onClick={(e) => handleDelete(u, e)}
                            style={{ color: '#ef4444' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>

                      {/* EXPIRY DATE */}
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {u.role === 'ADMIN' ? 'Never' : formatDate(u.created_at ? new Date(new Date(u.created_at).getTime() + 365 * 86400000) : null)}
                      </td>

                      {/* CREATED AT */}
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {formatDate(u.created_at)}
                      </td>

                      {/* LAST IP */}
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {pseudoIp}
                      </td>

                      {/* LAST LOGIN */}
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {formatDate(u.updated_at || u.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Bar ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderTop: '1px solid var(--border)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* Rows count & Page size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {totalUsers === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalUsers)} of {totalUsers}
            </span>
          </div>

          {/* Page buttons */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: currentPage <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(0, 5)
              .map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  style={{
                    minWidth: 30,
                    height: 30,
                    padding: '0 8px',
                    borderRadius: 6,
                    border: `1px solid ${p === currentPage ? 'var(--primary)' : 'var(--border)'}`,
                    background: p === currentPage ? 'var(--primary)' : 'var(--bg-card)',
                    color: p === currentPage ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: p === currentPage ? 700 : 400,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: currentPage >= totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── Create / Edit User Modal ── */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 440,
              maxWidth: '92vw',
              background: 'var(--bg-card)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                {editingUser ? 'Edit User' : 'Create New User'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingUser(null);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Full Name
                </label>
                <input
                  required
                  className="form-input w-full"
                  placeholder="e.g. John Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  className="form-input w-full"
                  placeholder="john@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              {!editingUser && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    className="form-input w-full"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Role & Access
                </label>
                <select
                  className="form-input w-full"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="AGENT">Member / Agent</option>
                  <option value="AGENCY">Agency Owner</option>
                  <option value="ADMIN">Super Admin</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingUser(null);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    background: 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  {saving ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View User Drawer / Modal ── */}
      {viewingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setViewingUser(null)}
        >
          <div
            style={{
              width: 420,
              maxWidth: '90vw',
              height: '100%',
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border)',
              padding: 24,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>User Profile</h3>
              <button
                onClick={() => setViewingUser(null)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: '#e0e7ff',
                  color: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                }}
              >
                {getInitials(viewingUser.name)}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{viewingUser.name}</h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{viewingUser.email}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: viewingUser.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                      color: viewingUser.is_active ? '#10b981' : '#64748b',
                    }}
                  >
                    ● {viewingUser.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: 'rgba(99,102,241,0.12)',
                      color: 'var(--primary)',
                    }}
                  >
                    {getPackageForRole(viewingUser.role, viewingUser.id)}
                  </span>
                </div>
              </div>
            </div>

            {/* Details section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.86rem', flex: 1 }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>User ID:</span>
                <strong style={{ fontFamily: 'monospace' }}>{formatUserId(viewingUser.id)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Role:</span>
                <strong>{viewingUser.role}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Last Known IP:</span>
                <code>{getPseudoIP(viewingUser.id)}</code>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Registration Date:</span>
                <span>{new Date(viewingUser.created_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => {
                  setEditingUser(viewingUser);
                  setForm({
                    name: viewingUser.name || '',
                    email: viewingUser.email || '',
                    password: '',
                    role: viewingUser.role || 'AGENT',
                  });
                  setViewingUser(null);
                  setShowCreateModal(true);
                }}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: 8,
                  background: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
              >
                ✏️ Edit Profile
              </button>
              <button
                onClick={() => handleDelete(viewingUser)}
                style={{
                  padding: '9px 14px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Ratings Modal ── */}
      {showRatingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 480,
              maxWidth: '92vw',
              background: 'var(--bg-card)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                ★ Manage Ratings & User Packages
              </h3>
              <button
                onClick={() => setShowRatingsModal(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              Configure subscription tiers, package limits, and rating permissions across team members.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {['Basic (Default)', 'Premium 1K (Broadcasts)', 'Agency Pro (Multi-agent)', 'Enterprise (Custom)'].map((tier, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{tier}</span>
                  <span style={{ color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>Active</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRatingsModal(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  background: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                }}
              >
                Done
              </button>
            </div>
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
            background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
            color: '#ffffff',
            fontWeight: 500,
            fontSize: '0.85rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </AppLayout>
  );
}
