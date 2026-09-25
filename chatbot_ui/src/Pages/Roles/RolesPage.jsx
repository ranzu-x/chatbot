import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { roleAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import {
  Shield,
  Lock,
  Copy,
  Plus,
  Save,
  Loader2,
  Users as UsersIcon,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  Zap,
  Radio,
  MessageSquare,
  Share2,
  MessageCircle,
  Layers,
  Settings,
  HelpCircle,
  Trash2,
  Check,
  Filter,
} from 'lucide-react';
import { TEAM_RULES_CATEGORIES, BLOCKABLE_CHANNELS, grantableKeys } from './teamRulesConfig';

// Map category icons
const CATEGORY_ICONS = {
  Radio: Radio,
  Users: UsersIcon,
  MessageSquare: MessageSquare,
  Zap: Zap,
  Share2: Share2,
  MessageCircle: MessageCircle,
  Layers: Layers,
  Sparkles: Sparkles,
  Settings: Settings,
};

export default function RolesPage() {
  const { user } = useAuth();
  const pageTitle = user?.role === 'RESELLER' ? 'Team Roles & Permissions' : 'Roles & Permissions';

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [disabledChannels, setDisabledChannels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [cloneFromId, setCloneFromId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  // Load roles & permissions list
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

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRole = roles.find((r) => r.id === selectedId);

  // Load selected role's permissions
  useEffect(() => {
    if (!selectedId) return;
    roleAPI
      .getOne(selectedId)
      .then((res) => {
        setSelectedKeys(new Set(res.data?.role?.permissionKeys || []));
        setDisabledChannels(res.data?.role?.disabledChannels || []);
      })
      .catch(() => notify.error('Failed to load role permissions'));
  }, [selectedId]);

  // Toggle single permission key
  const togglePerm = (key) => {
    if (selectedRole?.is_system) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleChannelBlock = (channelId) => {
    if (selectedRole?.is_system) return;
    setDisabledChannels((prev) =>
      prev.includes(channelId) ? prev.filter((c) => c !== channelId) : [...prev, channelId]
    );
  };

  // Toggle all actions for a specific feature (restriction rules excluded)
  const toggleFeatureAll = (feature) => {
    if (selectedRole?.is_system) return;
    const keys = grantableKeys([feature]);
    const allChecked = keys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        keys.forEach((k) => next.delete(k));
      } else {
        keys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  // Toggle all actions in a category
  const toggleCategoryAll = (category) => {
    if (selectedRole?.is_system) return;
    const keys = grantableKeys(category.features);
    const allChecked = keys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        keys.forEach((k) => next.delete(k));
      } else {
        keys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  // Select all team rules across all categories
  const selectAllRules = () => {
    if (selectedRole?.is_system) return;
    const allKeys = TEAM_RULES_CATEGORIES.flatMap((c) => grantableKeys(c.features));
    setSelectedKeys((prev) => new Set([...allKeys, ...[...prev].filter((k) => !allKeys.includes(k))]));
    notify.info('All team rules selected');
  };

  // Clear all team rules
  const clearAllRules = () => {
    if (selectedRole?.is_system) return;
    setSelectedKeys(new Set());
    notify.info('All team rules cleared');
  };

  // Save role permissions
  const handleSave = () => {
    if (!selectedRole || selectedRole.is_system) return;
    setSaving(true);
    roleAPI
      .update(selectedRole.id, { permissionKeys: Array.from(selectedKeys), disabledChannels })
      .then(() => notify.success('Team rules saved successfully'))
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
    roleAPI
      .create({ name: newRoleName.trim(), cloneFromRoleId: cloneFromId })
      .then((res) => {
        notify.success('Custom role created');
        setShowCreate(false);
        load();
        if (res.data?.role?.id) setSelectedId(res.data.role.id);
      })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to create role'));
  };

  const handleDelete = (role) => {
    if (!window.confirm(`Delete custom role "${role.name}"? This cannot be undone.`)) return;
    roleAPI
      .delete(role.id)
      .then(() => {
        notify.success('Role deleted');
        setSelectedId(null);
        load();
      })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to delete role'));
  };

  // Filter categories and features based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return TEAM_RULES_CATEGORIES;
    const q = searchQuery.toLowerCase();
    return TEAM_RULES_CATEGORIES.map((cat) => {
      const matchingFeatures = cat.features.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.actions.some((a) => a.label.toLowerCase().includes(q))
      );
      if (cat.name.toLowerCase().includes(q)) {
        return cat;
      }
      return {
        ...cat,
        features: matchingFeatures,
      };
    }).filter((cat) => cat.features.length > 0);
  }, [searchQuery]);

  // Total active rules stats for selected role
  const matrixStats = useMemo(() => {
    const allMatrixKeys = TEAM_RULES_CATEGORIES.flatMap((c) =>
      c.features.flatMap((f) => f.actions.map((a) => a.key))
    );
    const activeCount = allMatrixKeys.filter((k) => selectedKeys.has(k)).length;
    return {
      activeCount,
      totalCount: allMatrixKeys.length,
      pct: Math.round((activeCount / (allMatrixKeys.length || 1)) * 100),
    };
  }, [selectedKeys]);

  // Filter roles list
  const filteredRoles = useMemo(() => {
    if (!roleSearch.trim()) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase()));
  }, [roles, roleSearch]);

  // Non-matrix permissions (platform admin keys like admin.users.manage, etc.)
  const extraPlatformPermissions = useMemo(() => {
    const matrixSet = new Set(
      TEAM_RULES_CATEGORIES.flatMap((c) => c.features.flatMap((f) => f.actions.map((a) => a.key)))
    );
    return permissions.filter((p) => !matrixSet.has(p.permission_key));
  }, [permissions]);

  return (
    <AppLayout>
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
              {pageTitle}
            </h1>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#4f46e5',
                background: '#eef2ff',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              Team Rules Matrix
            </span>
          </div>
          <p className="page-subtitle" style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Configure granular team rules across all workspace features. Toggle Create, Update, Delete, and Special capabilities for each role.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => openCreate(selectedId)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 700,
            padding: '7px 14px',
            borderRadius: 8,
          }}
        >
          <Plus size={15} /> New Custom Role
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay" style={{ padding: 60, textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading Team Rules & Roles...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, alignItems: 'flex-start' }}>
            {/* ── LEFT COLUMN: Roles List ─────────────────────────────────── */}
            <div
              className="card"
              style={{
                padding: 12,
                borderRadius: 12,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                  />
                  <input
                    type="text"
                    placeholder="Search roles..."
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px 7px 30px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: '0.8rem',
                      background: '#f8fafc',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 6px 8px' }}>
                Operational Roles ({filteredRoles.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredRoles.map((r) => {
                  const isSelected = selectedId === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        background: isSelected ? '#f5f7ff' : 'transparent',
                        border: isSelected ? '1px solid #6366f1' : '1px solid transparent',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: isSelected ? 'rgba(99,102,241,0.15)' : '#f1f5f9',
                          color: isSelected ? '#4f46e5' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {r.is_system ? <Lock size={13} /> : <Shield size={13} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.86rem',
                            fontWeight: isSelected ? 700 : 600,
                            color: isSelected ? '#1e1b4b' : '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {r.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                          <UsersIcon size={10} /> {r.memberCount ?? 0} member{r.memberCount === 1 ? '' : 's'}
                          {r.is_system ? (
                            <span style={{ marginLeft: 4, color: '#94a3b8' }}>• System</span>
                          ) : (
                            <span style={{ marginLeft: 4, color: '#16a34a', fontWeight: 600 }}>• Custom</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── RIGHT COLUMN: Team Rules Matrix ─────────────────────────── */}
            <div
              className="card"
              style={{
                borderRadius: 12,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              {!selectedRole ? (
                <div style={{ color: '#64748b', fontSize: '0.88rem', padding: 40, textAlign: 'center' }}>
                  Select a role from the left list to configure its Team Rules.
                </div>
              ) : (
                <>
                  {/* Role Header & Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 20,
                      flexWrap: 'wrap',
                      gap: 12,
                      paddingBottom: 16,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          {selectedRole.name}
                        </h2>
                        {selectedRole.is_system ? (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#64748b',
                              background: '#f1f5f9',
                              padding: '2px 9px',
                              borderRadius: 999,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Lock size={11} /> SYSTEM — Read Only
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#16a34a',
                              background: 'rgba(22,163,74,0.1)',
                              padding: '2px 9px',
                              borderRadius: 999,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Shield size={11} /> Custom Role
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 3 }}>
                        <strong>{matrixStats.activeCount}</strong> of {matrixStats.totalCount} team rules enabled ({matrixStats.pct}%)
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {selectedRole.is_system ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openCreate(selectedRole.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.8rem' }}
                        >
                          <Copy size={13} /> Clone as Custom Role
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={selectAllRules}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}
                            title="Enable all rules"
                          >
                            <CheckSquare size={13} /> Select All
                          </button>
                          <button
                            type="button"
                            onClick={clearAllRules}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}
                            title="Disable all rules"
                          >
                            <Square size={13} /> Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(selectedRole)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.78rem', color: '#ef4444', borderColor: '#fee2e2', background: '#fef2f2' }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontWeight: 700,
                              background: '#4f46e5',
                              borderColor: '#4f46e5',
                              padding: '6px 14px',
                            }}
                          >
                            {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save Rules
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* System role notice */}
                  {selectedRole.is_system && (
                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        marginBottom: 18,
                        fontSize: '0.78rem',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <HelpCircle size={15} color="#4f46e5" style={{ flexShrink: 0 }} />
                      <span>
                        System roles are built-in presets. To customize permissions, click <strong>"Clone as Custom Role"</strong> above to create your own editable copy.
                      </span>
                    </div>
                  )}

                  {/* Search Filter */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ position: 'relative' }}>
                      <Search
                        size={15}
                        style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                      />
                      <input
                        type="text"
                        placeholder="Filter team rules by feature name or action..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 14px 9px 36px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: '0.84rem',
                          background: '#f8fafc',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* ── CHANNEL BLOCKS (roles.disabled_channels) ─────────── */}
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '12px 16px',
                      marginBottom: 18,
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>Channel access</div>
                    <p style={{ margin: '2px 0 10px', fontSize: '0.72rem', color: '#64748b' }}>
                      Members with this role never see chats or subscribers of a disabled channel.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                      {BLOCKABLE_CHANNELS.map((ch) => {
                        const blocked = disabledChannels.includes(ch.id);
                        return (
                          <label
                            key={ch.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: `1px solid ${blocked ? '#fecaca' : '#e2e8f0'}`,
                              background: blocked ? '#fef2f2' : '#f8fafc',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              color: blocked ? '#b91c1c' : '#334155',
                              cursor: selectedRole.is_system ? 'default' : 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={blocked}
                              disabled={selectedRole.is_system}
                              onChange={() => toggleChannelBlock(ch.id)}
                            />
                            {ch.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── TEAM RULES MATRIX TABLE ───────────────────────────── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {filteredCategories.map((category) => {
                      const CatIcon = CATEGORY_ICONS[category.icon] || Zap;
                      const catKeys = category.features.flatMap((f) => f.actions.map((a) => a.key));
                      const catActiveCount = catKeys.filter((k) => selectedKeys.has(k)).length;
                      const catGrantable = grantableKeys(category.features);
                      const allCatChecked = catGrantable.length > 0 && catGrantable.every((k) => selectedKeys.has(k));

                      return (
                        <div
                          key={category.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: '#ffffff',
                          }}
                        >
                          {/* Category Header */}
                          <div
                            style={{
                              padding: '12px 16px',
                              background: '#f8fafc',
                              borderBottom: '1px solid #e2e8f0',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: 'rgba(99,102,241,0.1)',
                                  color: '#4f46e5',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <CatIcon size={16} />
                              </div>
                              <div>
                                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                                  {category.name}
                                </h3>
                                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                                  {category.description}
                                </p>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  color: catActiveCount > 0 ? '#4f46e5' : '#94a3b8',
                                  background: catActiveCount > 0 ? '#eef2ff' : '#f1f5f9',
                                  padding: '2px 8px',
                                  borderRadius: 8,
                                }}
                              >
                                {catActiveCount} / {catKeys.length} enabled
                              </span>

                              {!selectedRole.is_system && (
                                <button
                                  type="button"
                                  onClick={() => toggleCategoryAll(category)}
                                  style={{
                                    border: '1px solid #e2e8f0',
                                    background: '#ffffff',
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    color: '#475569',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {allCatChecked ? 'Deselect Category' : 'Select Category'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Matrix Table */}
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                              <thead>
                                <tr style={{ background: '#ffffff', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, width: '42%' }}>Feature / Rule</th>
                                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, width: '13%' }}>Create</th>
                                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, width: '13%' }}>Update</th>
                                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, width: '13%' }}>Delete</th>
                                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, width: '13%' }}>Special</th>
                                  <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 700, width: '9%' }}>All</th>
                                </tr>
                              </thead>
                              <tbody>
                                {category.features.map((feat) => {
                                  const createAction = feat.actions.find((a) => a.type === 'create');
                                  const updateAction = feat.actions.find((a) => a.type === 'update');
                                  const deleteAction = feat.actions.find((a) => a.type === 'delete');
                                  const specialAction = feat.actions.find((a) => a.type === 'special');
                                  const extraActions = feat.actions.filter((a) => a.type === 'extra');

                                  const featKeys = grantableKeys([feat]);
                                  const allFeatChecked = featKeys.every((k) => selectedKeys.has(k));

                                  return (
                                    <tr
                                      key={feat.id}
                                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfe')}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                                    >
                                      {/* Feature Info */}
                                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                                          {feat.name}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2, lineHeight: 1.35 }}>
                                          {feat.description}
                                        </div>

                                        {/* Sub-rules (Extra actions like Advanced / Widget) */}
                                        {extraActions.length > 0 && (
                                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                            {extraActions.map((extra) => {
                                              const checked = selectedKeys.has(extra.key);
                                              return (
                                                <label
                                                  key={extra.key}
                                                  style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    padding: '3px 8px',
                                                    borderRadius: 6,
                                                    border: `1px solid ${checked ? '#6366f1' : '#e2e8f0'}`,
                                                    background: checked ? '#f5f7ff' : '#f8fafc',
                                                    color: checked ? '#4338ca' : '#475569',
                                                    cursor: selectedRole.is_system ? 'default' : 'pointer',
                                                  }}
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={selectedRole.is_system}
                                                    onChange={() => togglePerm(extra.key)}
                                                  />
                                                  {extra.label}
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </td>

                                      {/* Create */}
                                      <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        {createAction ? (
                                          <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: selectedRole.is_system ? 'default' : 'pointer' }} title={createAction.label}>
                                            <input
                                              type="checkbox"
                                              checked={selectedKeys.has(createAction.key)}
                                              disabled={selectedRole.is_system}
                                              onChange={() => togglePerm(createAction.key)}
                                              style={{ width: 16, height: 16, cursor: selectedRole.is_system ? 'default' : 'pointer' }}
                                            />
                                          </label>
                                        ) : (
                                          <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>—</span>
                                        )}
                                      </td>

                                      {/* Update */}
                                      <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        {updateAction ? (
                                          <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: selectedRole.is_system ? 'default' : 'pointer' }} title={updateAction.label}>
                                            <input
                                              type="checkbox"
                                              checked={selectedKeys.has(updateAction.key)}
                                              disabled={selectedRole.is_system}
                                              onChange={() => togglePerm(updateAction.key)}
                                              style={{ width: 16, height: 16, cursor: selectedRole.is_system ? 'default' : 'pointer' }}
                                            />
                                          </label>
                                        ) : (
                                          <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>—</span>
                                        )}
                                      </td>

                                      {/* Delete */}
                                      <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        {deleteAction ? (
                                          <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: selectedRole.is_system ? 'default' : 'pointer' }} title={deleteAction.label}>
                                            <input
                                              type="checkbox"
                                              checked={selectedKeys.has(deleteAction.key)}
                                              disabled={selectedRole.is_system}
                                              onChange={() => togglePerm(deleteAction.key)}
                                              style={{ width: 16, height: 16, cursor: selectedRole.is_system ? 'default' : 'pointer' }}
                                            />
                                          </label>
                                        ) : (
                                          <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>—</span>
                                        )}
                                      </td>

                                      {/* Special */}
                                      <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        {specialAction ? (
                                          <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: selectedRole.is_system ? 'default' : 'pointer' }} title={specialAction.label}>
                                            <input
                                              type="checkbox"
                                              checked={selectedKeys.has(specialAction.key)}
                                              disabled={selectedRole.is_system}
                                              onChange={() => togglePerm(specialAction.key)}
                                              style={{ width: 16, height: 16, cursor: selectedRole.is_system ? 'default' : 'pointer' }}
                                            />
                                          </label>
                                        ) : (
                                          <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>—</span>
                                        )}
                                      </td>

                                      {/* Row Toggle */}
                                      <td style={{ padding: '12px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                                        {!selectedRole.is_system && (
                                          <button
                                            type="button"
                                            onClick={() => toggleFeatureAll(feat)}
                                            style={{
                                              background: allFeatChecked ? '#eef2ff' : '#f8fafc',
                                              border: `1px solid ${allFeatChecked ? '#c7d2fe' : '#e2e8f0'}`,
                                              color: allFeatChecked ? '#4f46e5' : '#64748b',
                                              padding: '3px 7px',
                                              borderRadius: 6,
                                              fontSize: '0.68rem',
                                              fontWeight: 600,
                                              cursor: 'pointer',
                                            }}
                                          >
                                            {allFeatChecked ? 'Uncheck' : 'Check'}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}

                    {/* Additional Platform / Scope Permissions if present */}
                    {extraPlatformPermissions.length > 0 && (
                      <div
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: '#ffffff',
                        }}
                      >
                        <div
                          style={{
                            padding: '12px 16px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                            Core Platform & Administrator Permissions
                          </h3>
                          <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                            Administrative permissions applicable to platform administrators and support staff.
                          </p>
                        </div>
                        <div
                          style={{
                            padding: 16,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                            gap: 10,
                          }}
                        >
                          {extraPlatformPermissions.map((p) => (
                            <label
                              key={p.permission_key}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                fontSize: '0.78rem',
                                color: '#0f172a',
                                cursor: selectedRole.is_system ? 'default' : 'pointer',
                                opacity: selectedRole.is_system && !selectedKeys.has(p.permission_key) ? 0.5 : 1,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(p.permission_key)}
                                disabled={selectedRole.is_system}
                                onChange={() => togglePerm(p.permission_key)}
                                style={{ marginTop: 2 }}
                              />
                              <span>{p.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE CUSTOM ROLE MODAL ─────────────────────────────────────── */}
      {showCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowCreate(false)}
        >
          <div
            style={{
              width: 440,
              maxWidth: '92vw',
              background: '#ffffff',
              borderRadius: 14,
              padding: 24,
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 0, marginBottom: 6, color: '#0f172a' }}>
              Create Custom Role
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>
              Define a new role with personalized team rules for your team members.
            </p>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 5, color: '#334155' }}>
                  Role Name *
                </label>
                <input
                  className="form-input w-full"
                  autoFocus
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Senior Support Specialist"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              {cloneFromId && (
                <p style={{ fontSize: '0.74rem', color: '#6366f1', margin: 0, background: '#eef2ff', padding: '6px 10px', borderRadius: 6 }}>
                  ✨ Cloned from <strong>{roles.find((r) => r.id === cloneFromId)?.name}</strong> — will initialize with all of its current rules.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ fontWeight: 700, background: '#4f46e5', borderColor: '#4f46e5', padding: '6px 14px' }}
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
