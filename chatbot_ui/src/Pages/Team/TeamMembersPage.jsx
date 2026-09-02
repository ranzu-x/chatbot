import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { teamAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import {
  Users,
  UserCheck,
  UserPlus,
  Shield,
  MessageSquare,
  Bot,
  Radio,
  Eye,
  Search,
  CheckCircle2,
  Phone,
  Edit3,
  Trash2,
  Power,
  RefreshCw,
  AlertCircle,
  X,
  Zap,
} from 'lucide-react';

// ─── Team Roles Definition & Capabilities ─────────────────────────────────────
export const TEAM_ROLES = [
  {
    id: 'MANAGER',
    label: 'Workspace Manager',
    badgeClass: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: Shield,
    color: '#8b5cf6',
    description: 'Full workspace operations. Can configure bots, send broadcasts, and manage team members.',
  },
  {
    id: 'AGENT',
    label: 'Live Chat Agent',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: MessageSquare,
    color: '#10b981',
    description: 'Handles customer conversations in Live Chat Inbox, manages assigned contacts & tickets.',
  },
  {
    id: 'BOT_BUILDER',
    label: 'Bot & Flow Specialist',
    badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    icon: Bot,
    color: '#6366f1',
    description: 'Designs visual flow bots, manages keyword triggers, sequences, and AI knowledge bases.',
  },
  {
    id: 'MARKETING',
    label: 'Campaign Specialist',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Radio,
    color: '#f59e0b',
    description: 'Manages outbound broadcasts, drip sequences, customer segments, and social posting.',
  },
  {
    id: 'VIEWER',
    label: 'Analyst / Viewer',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Eye,
    color: '#64748b',
    description: 'Read-only access to conversation logs, analytics dashboards, and campaign reporting.',
  },
];

function getRoleInfo(roleKey) {
  const norm = (roleKey || 'AGENT').toUpperCase();
  return (
    TEAM_ROLES.find((r) => r.id === norm) || {
      id: norm,
      label: norm.replace('_', ' '),
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: Users,
      color: '#64748b',
      description: 'Standard team member access.',
    }
  );
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TeamMembersPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'ADMIN';

  // Data State
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planStats, setPlanStats] = useState({ maxTeamMembers: null, usedTeamMembers: 0, canAddMore: true });

  // Filters & Search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [viewingMember, setViewingMember] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Form State
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    teamRole: 'AGENT',
  });

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Fetch Team Members ───────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: pageSize,
        ...(search && { search }),
        ...(roleFilter !== 'ALL' && { role: roleFilter }),
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
      };

      const res = await teamAPI.getAll(params);
      if (res.data.success) {
        setMembers(res.data.teamMembers || []);
        setTotalPages(res.data.pagination?.totalPages || 1);
        setTotalCount(res.data.pagination?.total || 0);
        if (res.data.plan) {
          setPlanStats(res.data.plan);
        }
      }
    } catch (err) {
      console.error('Failed to load team members:', err);
      showToast(err?.response?.data?.message || 'Error loading team members', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMembers();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchMembers]);

  // ─── Summary Metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total = totalCount || members.length;
    const online = members.filter((m) => m.is_online).length;
    const managers = members.filter((m) => m.team_role === 'MANAGER').length;
    const agents = members.filter((m) => m.team_role === 'AGENT').length;
    const builders = members.filter((m) => m.team_role === 'BOT_BUILDER').length;
    return { total, online, managers, agents, builders };
  }, [members, totalCount]);

  // ─── Open Create Modal ────────────────────────────────────────────────────
  const openCreateModal = () => {
    if (!planStats.canAddMore && !isSuperAdmin) {
      showToast(
        `Your plan limit of ${planStats.maxTeamMembers} team members has been reached. Please upgrade your package to invite more.`,
        'error'
      );
      return;
    }
    setForm({
      name: '',
      email: '',
      phone: '',
      password: '',
      teamRole: 'AGENT',
    });
    setFormError('');
    setShowCreateModal(true);
  };

  // ─── Handle Create ────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name || !form.email || !form.password) {
      setFormError('Please enter Name, Email, and Password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await teamAPI.create(form);
      if (res.data.success) {
        showToast(res.data.message || 'Team member added successfully!');
        setShowCreateModal(false);
        fetchMembers();
      }
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Failed to create team member.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Open Edit Modal ──────────────────────────────────────────────────────
  const openEditModal = (member) => {
    setEditingMember({
      ...member,
      newPassword: '',
    });
    setFormError('');
  };

  // ─── Handle Update ────────────────────────────────────────────────────────
  const handleUpdate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const payload = {
        name: editingMember.name,
        email: editingMember.email,
        phone: editingMember.phone,
        teamRole: editingMember.team_role,
        is_active: editingMember.is_active,
        ...(editingMember.newPassword && { password: editingMember.newPassword }),
      };
      const res = await teamAPI.update(editingMember.id, payload);
      if (res.data.success) {
        showToast('Team member updated successfully!');
        setEditingMember(null);
        fetchMembers();
      }
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Failed to update team member.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Toggle Active ────────────────────────────────────────────────────────
  const handleToggleActive = async (member) => {
    try {
      const res = await teamAPI.toggle(member.id);
      if (res.data.success) {
        showToast(`Team member is now ${res.data.isActive ? 'Active' : 'Inactive'}.`);
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, is_active: res.data.isActive ? 1 : 0 } : m))
        );
      }
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to toggle status', 'error');
    }
  };

  // ─── Delete Member ────────────────────────────────────────────────────────
  const handleDelete = async (member) => {
    if (!window.confirm(`Are you sure you want to remove team member "${member.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await teamAPI.delete(member.id);
      if (res.data.success) {
        showToast('Team member removed successfully.');
        setMembers((prev) => prev.filter((m) => m.id !== member.id));
        setTotalCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to delete team member', 'error');
    }
  };

  // ─── Open View Details ────────────────────────────────────────────────────
  const openViewModal = async (member) => {
    try {
      const res = await teamAPI.getOne(member.id);
      if (res.data.success) {
        setViewingMember(res.data.teamMember);
      } else {
        setViewingMember(member);
      }
    } catch {
      setViewingMember(member);
    }
  };

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 99999,
            padding: '12px 20px',
            borderRadius: 10,
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.88rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            background: toast.type === 'error' ? '#ef4444' : '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        {/* ── Page Header ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '1.6rem',
                fontWeight: 800,
                color: '#1a1a2e',
                margin: '0 0 4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Users size={26} color="#6366f1" />
              Team Members
            </h1>
            <p style={{ margin: 0, fontSize: '0.86rem', color: '#5c5c80' }}>
              Invite staff, assign functional operational roles, and manage delegated access across your workspace.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={fetchMembers}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 15px',
                borderRadius: 9,
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>

            <button
              onClick={openCreateModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 18px',
                borderRadius: 9,
                background: '#6366f1',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.28)',
              }}
            >
              <UserPlus size={16} />
              Invite Team Member
            </button>
          </div>
        </div>

        {/* ── Plan Entitlement Usage Banner ── */}
        {!isSuperAdmin && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              background: planStats.canAddMore ? '#f8faff' : '#fffbeb',
              border: `1px solid ${planStats.canAddMore ? '#e0e7ff' : '#fef3c7'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Zap size={18} color={planStats.canAddMore ? '#6366f1' : '#f59e0b'} />
              <div style={{ fontSize: '0.84rem', color: '#1e293b' }}>
                <strong>Plan Allowance:</strong>{' '}
                {planStats.maxTeamMembers === null
                  ? 'Unlimited team members supported on your plan.'
                  : `Using ${planStats.usedTeamMembers} of ${planStats.maxTeamMembers} team members permitted by your package.`}
              </div>
            </div>

            {!planStats.canAddMore && (
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: '#b45309',
                  background: '#fef3c7',
                  padding: '4px 10px',
                  borderRadius: 6,
                }}
              >
                Limit Reached
              </span>
            )}
          </div>
        )}

        {/* ── Metric Cards ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 14,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              padding: 16,
              borderRadius: 12,
              border: '1px solid #e4e4f0',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#eef2ff',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a1a2e' }}>
                {metrics.total}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                Total Members
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              padding: 16,
              borderRadius: 12,
              border: '1px solid #e4e4f0',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#ecfdf5',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserCheck size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a1a2e' }}>
                {members.filter((m) => m.is_active).length}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                Active Members
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              padding: 16,
              borderRadius: 12,
              border: '1px solid #e4e4f0',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#f5f3ff',
                color: '#8b5cf6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a1a2e' }}>
                {metrics.managers}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                Managers & Admins
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              padding: 16,
              borderRadius: 12,
              border: '1px solid #e4e4f0',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#fef3c7',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={22} />
            </div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1a1a2e' }}>
                {metrics.builders + metrics.agents}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                Agents & Flow Builders
              </div>
            </div>
          </div>
        </div>

        {/* ── Filters & Search Bar ── */}
        <div
          style={{
            background: '#ffffff',
            padding: 16,
            borderRadius: 12,
            border: '1px solid #e4e4f0',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: 260, maxWidth: 400 }}>
            <Search
              size={15}
              color="#94a3b8"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: '0.84rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Filter Dropdowns */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: '0.84rem',
                background: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Roles</option>
              {TEAM_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: '0.84rem',
                background: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* ── Team Members Table ── */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid #e4e4f0',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
              <div style={{ fontSize: '0.88rem' }}>Loading team members...</div>
            </div>
          ) : members.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
              <Users size={38} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                No Team Members Found
              </div>
              <p style={{ fontSize: '0.84rem', margin: '0 0 16px 0', color: '#64748b' }}>
                {search || roleFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'No members match your active filters.'
                  : 'Start by inviting staff members to delegate support, flow building, and marketing.'}
              </p>
              <button
                onClick={openCreateModal}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
              >
                + Invite Member
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr
                    style={{
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <th style={{ padding: '12px 18px' }}>Member</th>
                    <th style={{ padding: '12px 18px' }}>Role</th>
                    <th style={{ padding: '12px 18px' }}>Contact</th>
                    <th style={{ padding: '12px 18px' }}>Status</th>
                    <th style={{ padding: '12px 18px' }}>Joined Date</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody style={{ fontSize: '0.84rem', color: '#1e293b' }}>
                  {members.map((member) => {
                    const rInfo = getRoleInfo(member.team_role);
                    const RoleIcon = rInfo.icon;
                    const isActive = member.is_active === 1 || member.is_active === true;

                    return (
                      <tr
                        key={member.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                      >
                        {/* Member */}
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: '50%',
                                background: '#e0e7ff',
                                color: '#4338ca',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                              }}
                            >
                              {getInitials(member.name)}
                              {member.is_online ? (
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    right: 0,
                                    width: 10,
                                    height: 10,
                                    background: '#10b981',
                                    borderRadius: '50%',
                                    border: '2px solid #fff',
                                  }}
                                />
                              ) : null}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{member.name}</div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{member.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td style={{ padding: '14px 18px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: rInfo.color + '15',
                              color: rInfo.color,
                              border: `1px solid ${rInfo.color}30`,
                            }}
                          >
                            <RoleIcon size={12} />
                            {rInfo.label}
                          </span>
                        </td>

                        {/* Contact */}
                        <td style={{ padding: '14px 18px', color: '#475569', fontSize: '0.8rem' }}>
                          {member.phone ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Phone size={13} color="#94a3b8" />
                              {member.phone}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>No phone</span>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 18px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              background: isActive ? '#ecfdf5' : '#fef2f2',
                              color: isActive ? '#059669' : '#dc2626',
                              border: `1px solid ${isActive ? '#a7f3d0' : '#fecaca'}`,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: isActive ? '#10b981' : '#ef4444',
                              }}
                            />
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        {/* Joined Date */}
                        <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '0.78rem' }}>
                          {formatDate(member.created_at)}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => openViewModal(member)}
                              title="View Details"
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                color: '#475569',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Eye size={13} />
                            </button>

                            <button
                              onClick={() => openEditModal(member)}
                              title="Edit Member"
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                color: '#6366f1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              onClick={() => handleToggleActive(member)}
                              title={isActive ? 'Deactivate Member' : 'Activate Member'}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                color: isActive ? '#f59e0b' : '#10b981',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Power size={13} />
                            </button>

                            <button
                              onClick={() => handleDelete(member)}
                              title="Delete Member"
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 6,
                                border: '1px solid #fecaca',
                                background: '#fff5f5',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
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
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.8rem',
                color: '#64748b',
              }}
            >
              <div>
                Page {currentPage} of {totalPages} ({totalCount} total members)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: currentPage <= 1 ? '#f8fafc' : '#ffffff',
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: currentPage >= totalPages ? '#f8fafc' : '#ffffff',
                    cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          MODAL 1: INVITE / CREATE TEAM MEMBER
          ═════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 580,
              maxWidth: '96vw',
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              overflow: 'hidden',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <UserPlus size={20} color="#6366f1" />
                Invite New Team Member
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              {formError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.82rem',
                    marginBottom: 16,
                  }}
                >
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Full Name *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Alex Johnson"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Email Address *
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="alex@example.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Phone Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="+1 (555) 000-0000"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Login Password *
                  </label>
                  <input
                    required
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              {/* Role Selection Cards */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 8 }}>
                  Assign Operational Role *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {TEAM_ROLES.map((r) => {
                    const RIcon = r.icon;
                    const isSelected = form.teamRole === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setForm((f) => ({ ...f, teamRole: r.id }))}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: `1.5px solid ${isSelected ? '#6366f1' : '#e2e8f0'}`,
                          background: isSelected ? '#f5f7ff' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          transition: 'all 0.15s',
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            background: r.color + '15',
                            color: r.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <RIcon size={16} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: isSelected ? '#4338ca' : '#0f172a' }}>
                            {r.label}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            {r.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#475569',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#6366f1',
                    color: '#fff',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Creating...' : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          MODAL 2: EDIT TEAM MEMBER
          ═════════════════════════════════════════════════════════════════════ */}
      {editingMember && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 540,
              maxWidth: '96vw',
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              overflow: 'hidden',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Edit3 size={18} color="#6366f1" />
                Edit Member: {editingMember.name}
              </h3>
              <button
                onClick={() => setEditingMember(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdate} style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
              {formError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.82rem',
                    marginBottom: 16,
                  }}
                >
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Full Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={editingMember.name}
                    onChange={(e) => setEditingMember((m) => ({ ...m, name: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Email Address *
                  </label>
                  <input
                    required
                    type="email"
                    value={editingMember.email}
                    onChange={(e) => setEditingMember((m) => ({ ...m, email: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={editingMember.phone || ''}
                    onChange={(e) => setEditingMember((m) => ({ ...m, phone: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                    Reset Password (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={editingMember.newPassword || ''}
                    onChange={(e) => setEditingMember((m) => ({ ...m, newPassword: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 8 }}>
                  Operational Role
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {TEAM_ROLES.map((r) => {
                    const isSel = editingMember.team_role === r.id;
                    const RIcon = r.icon;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setEditingMember((m) => ({ ...m, team_role: r.id }))}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: `1.5px solid ${isSel ? '#6366f1' : '#e2e8f0'}`,
                          background: isSel ? '#f5f7ff' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <RIcon size={15} color={r.color} />
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isSel ? '#4338ca' : '#0f172a' }}>
                          {r.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#475569',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#6366f1',
                    color: '#fff',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          MODAL 3: VIEW TEAM MEMBER DETAILS (CLEAN MODERN PROFILE)
          ═════════════════════════════════════════════════════════════════════ */}
      {viewingMember && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 520,
              maxWidth: '96vw',
              background: '#ffffff',
              borderRadius: 16,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Team Member Profile
              </h3>
              <button
                onClick={() => setViewingMember(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 22 }}>
              {/* Profile Top Section */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    background: '#e0e7ff',
                    color: '#4338ca',
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {getInitials(viewingMember.name)}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    {viewingMember.name}
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '3px 9px',
                        borderRadius: 6,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: getRoleInfo(viewingMember.team_role).color + '15',
                        color: getRoleInfo(viewingMember.team_role).color,
                        border: `1px solid ${getRoleInfo(viewingMember.team_role).color}30`,
                      }}
                    >
                      {getRoleInfo(viewingMember.team_role).label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: viewingMember.is_active ? '#059669' : '#dc2626',
                      }}
                    >
                      ● {viewingMember.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info Details Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 14,
                  padding: 14,
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  marginBottom: 18,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                    Email Address
                  </div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b' }}>
                    {viewingMember.email}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                    Phone Number
                  </div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b' }}>
                    {viewingMember.phone || 'Not provided'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                    Live Status
                  </div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: viewingMember.is_online ? '#10b981' : '#94a3b8' }}>
                    {viewingMember.is_online ? '● Online Now' : 'Offline'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                    Member Since
                  </div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b' }}>
                    {formatDate(viewingMember.created_at)}
                  </div>
                </div>
              </div>

              {/* Role Scope Description */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.8rem',
                  color: '#475569',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                  Role Responsibilities:
                </div>
                {getRoleInfo(viewingMember.team_role).description}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  onClick={() => setViewingMember(null)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
