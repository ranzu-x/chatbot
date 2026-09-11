import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { roleAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import { Shield, Lock, Copy, Plus, Save, Loader2, Users as UsersIcon } from 'lucide-react';

export default function RolesPage() {
  const { user } = useAuth();
  // A Reseller only ever manages its own team's roles, so "Team Roles &
  // Permissions" reads more precisely there than the Super Admin's broader,
  // platform-wide use of this same page (which also covers Reseller-scope
  // roles, not just one team).
  const pageTitle = user?.role === 'RESELLER' ? 'Team Roles & Permissions' : 'Roles & Permissions';
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [cloneFromId, setCloneFromId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([roleAPI.getAll(), roleAPI.getPermissions()])
      .then(([rolesRes, permsRes]) => {
        const list = rolesRes.data?.roles || [];
        setRoles(list);
        setPermissions(permsRes.data?.permissions || []);
        if (list.length && !selectedId) setSelectedId(list[0].id);
      })
      .catch(() => notify.error('Failed to load roles'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRole = roles.find((r) => r.id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    roleAPI.getOne(selectedId)
      .then((res) => setSelectedKeys(new Set(res.data?.role?.permissionKeys || [])))
      .catch(() => notify.error('Failed to load role permissions'));
  }, [selectedId]);

  const grouped = useMemo(() => {
    const byCategory = {};
    for (const p of permissions) {
      if (!byCategory[p.category]) byCategory[p.category] = [];
      byCategory[p.category].push(p);
    }
    return byCategory;
  }, [permissions]);

  const togglePerm = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    if (!selectedRole || selectedRole.is_system) return;
    setSaving(true);
    roleAPI.update(selectedRole.id, { permissionKeys: Array.from(selectedKeys) })
      .then(() => notify.success('Role permissions saved'))
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to save'))
      .finally(() => setSaving(false));
  };

  const openCreate = (cloneFrom = null) => {
    setCloneFromId(cloneFrom);
    setNewRoleName(cloneFrom ? `${roles.find((r) => r.id === cloneFrom)?.name || ''} (Custom)` : '');
    setShowCreate(true);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    roleAPI.create({ name: newRoleName.trim(), cloneFromRoleId: cloneFromId })
      .then((res) => {
        notify.success('Custom role created');
        setShowCreate(false);
        load();
        if (res.data?.role?.id) setSelectedId(res.data.role.id);
      })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to create role'));
  };

  const handleDelete = (role) => {
    if (!window.confirm(`Delete the custom role "${role.name}"? Members must have zero of it in use.`)) return;
    roleAPI.delete(role.id)
      .then(() => { notify.success('Role deleted'); setSelectedId(null); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to delete role'));
  };

  return (
    <AppLayout>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <p className="page-subtitle">Reused across the platform, workspace, and reseller levels — each role only shows the permissions relevant to where it applies.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => openCreate(selectedId)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Custom Role
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'flex-start' }}>
            <div className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {roles.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                    background: selectedId === r.id ? 'var(--bg-hover)' : 'transparent',
                    border: selectedId === r.id ? '1px solid var(--primary)' : '1px solid transparent',
                  }}
                >
                  {r.is_system ? <Lock size={13} color="var(--text-muted)" /> : <Shield size={13} color="var(--primary)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <UsersIcon size={10} /> {r.memberCount ?? 0} member{r.memberCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              {!selectedRole ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a role to view its permissions.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {selectedRole.name}
                        {selectedRole.is_system && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 999 }}>
                            SYSTEM — read only
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {selectedRole.is_system ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => openCreate(selectedRole.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Copy size={13} /> Clone as custom role
                        </button>
                      ) : (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(selectedRole)}>Delete</button>
                          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {Object.entries(grouped).map(([category, perms]) => (
                      <div key={category}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                          {category}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                          {perms.map((p) => (
                            <label key={p.permission_key} style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-primary)',
                              cursor: selectedRole.is_system ? 'default' : 'pointer', opacity: selectedRole.is_system && !selectedKeys.has(p.permission_key) ? 0.5 : 1,
                            }}>
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(p.permission_key)}
                                disabled={selectedRole.is_system}
                                onChange={() => togglePerm(p.permission_key)}
                                style={{ marginTop: 2 }}
                              />
                              {p.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 420, maxWidth: '92vw', background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>New Custom Role</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Role name</label>
                <input className="form-input w-full" autoFocus value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Regional Manager" />
              </div>
              {cloneFromId && <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>Starts with the same permissions as the role you cloned from — edit afterward.</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
