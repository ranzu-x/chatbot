import { useEffect, useState } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { adminAPI } from '../../services/api';

const ROLE_BADGE = {
  ADMIN:  'badge badge-danger',
  AGENCY: 'badge badge-primary',
  AGENT:  'badge badge-success',
};

const ROLE_ICON = {
  ADMIN:  '🔑',
  AGENCY: '🏢',
  AGENT:  '👤',
};

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function UsersPage() {
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getUsers();
      setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <AppLayout>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">All Users</h1>
            <p className="page-subtitle">View every user across all agencies and roles</p>
          </div>
          <div className="badge badge-primary" style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
            {filtered.length} user{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* ── Filters ── */}
        <div className="flex items-center gap-3" style={{ marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ maxWidth: '280px' }}
            placeholder="🔍  Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filter-bar">
            {['ALL', 'ADMIN', 'AGENCY', 'AGENT'].map((r) => (
              <button
                key={r}
                className={`filter-chip ${roleFilter === r ? 'active' : ''}`}
                onClick={() => setRoleFilter(r)}
              >
                {r === 'ALL' ? '👥 All' : `${ROLE_ICON[r]} ${r}`}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <div className="empty-title">No users found</div>
            <div className="empty-desc">Try adjusting your search or filter</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="avatar avatar-sm">{getInitials(u.name)}</div>
                        <span className="font-medium">{u.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td>
                      <span className={ROLE_BADGE[u.role]}>
                        {ROLE_ICON[u.role]} {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-muted'}`}>
                        <span className={`status-dot ${u.is_active ? 'online' : 'offline'}`} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {new Date(u.created_at).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
