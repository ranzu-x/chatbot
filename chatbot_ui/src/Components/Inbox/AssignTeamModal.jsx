import React, { useState, useEffect, useMemo } from 'react';
import { UserCheck, Users, X, Search, Check, Shield, CircleDot, AlertCircle } from 'lucide-react';

function getInitials(name = '') {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
}

/**
 * AssignTeamModal - Prompts the user to select which team member should be assigned
 * when changing conversation status to "ASSIGNED" (or manually reassigning team).
 */
export default function AssignTeamModal({
  open,
  onClose,
  onAssign,
  agents = [],
  currentAssignedId = null,
  subscriberName = '',
  platform = '',
  loading = false,
}) {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Update selected agent whenever modal opens or currentAssignedId changes
  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    if (currentAssignedId) {
      setSelectedAgentId(String(currentAssignedId));
    } else if (agents.length > 0) {
      const firstId = agents[0].profileId || agents[0].agent_profile_id || agents[0].id;
      setSelectedAgentId(String(firstId));
    } else {
      setSelectedAgentId('');
    }
  }, [open, currentAssignedId, agents]);

  // Filter agents based on search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const q = searchQuery.toLowerCase().trim();
    return agents.filter((ag) => {
      const name = (ag.name || '').toLowerCase();
      const email = (ag.email || '').toLowerCase();
      const role = (ag.role || ag.team_role || '').toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [agents, searchQuery]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!selectedAgentId) return;
    onAssign?.(selectedAgentId);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(2px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: '96vw',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#fafbfe',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                Assign Conversation
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>
                Set conversation status to Assigned
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Target subscriber banner */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ color: '#64748b' }}>Subscriber:</span>
              <strong style={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subscriberName || 'Unknown Contact'}
              </strong>
            </div>
            {platform && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: '#e2e8f0',
                  color: '#475569',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {platform}
              </span>
            )}
          </div>

          {/* Prompt Question */}
          <div>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              Which team should be assigned?
            </label>
            <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b' }}>
              Choose a team member to take ownership of this conversation.
            </p>
          </div>

          {/* Search bar if multiple agents */}
          {agents.length > 4 && (
            <div style={{ position: 'relative' }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search team members by name or email..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Team Members List */}
          <div
            style={{
              maxHeight: 250,
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              background: '#ffffff',
            }}
          >
            {filteredAgents.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                <AlertCircle size={24} style={{ margin: '0 auto 6px', color: '#cbd5e1' }} />
                {agents.length === 0 ? 'No team members found in this workspace.' : 'No team members match your search.'}
              </div>
            ) : (
              filteredAgents.map((ag) => {
                const pid = String(ag.profileId || ag.agent_profile_id || ag.id);
                const isSelected = String(selectedAgentId) === pid;
                const isAdm = ag.isAdmin || ag.role === 'ADMIN' || ag.name === 'Admin';
                const displayName = isAdm ? 'Admin' : (ag.name || ag.email || 'Team Member');
                const initials = getInitials(displayName);

                return (
                  <div
                    key={pid}
                    onClick={() => setSelectedAgentId(pid)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    {/* Radio circle */}
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: isSelected ? '5px solid #2563eb' : '2px solid #cbd5e1',
                        background: '#ffffff',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    />

                    {/* Avatar */}
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: isSelected ? '#2563eb' : '#e2e8f0',
                        color: isSelected ? '#ffffff' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: isSelected ? 700 : 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {displayName}
                        </span>
                        {isAdm && (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: '#fef3c7',
                              color: '#92400e',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <Shield size={10} /> Admin
                          </span>
                        )}
                      </div>
                      {ag.email && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ag.email}
                        </div>
                      )}
                    </div>

                    {/* Online badge if available */}
                    {ag.is_online ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: '#16a34a', fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                        Online
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #e2e8f0',
            background: '#fafbfe',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !selectedAgentId}
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: 'none',
              background: loading || !selectedAgentId ? '#94a3b8' : '#2563eb',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: loading || !selectedAgentId ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
            }}
          >
            <UserCheck size={15} />
            {loading ? 'Assigning...' : 'Assign Team'}
          </button>
        </div>
      </div>
    </div>
  );
}
