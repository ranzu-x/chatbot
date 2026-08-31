import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { io } from 'socket.io-client';
import api from '../services/api';
import { playNotificationSound } from '../services/soundEffects';
import {
  Bell,
  Volume2,
  VolumeX,
  Radio,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  MessageSquare,
  Shield,
  CreditCard,
  Settings,
} from 'lucide-react';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [settings, setSettings] = useState({
    soundEnabled: true,
    pushEnabled: true,
    notifyNewMessage: true,
    notifyHandover: true,
  });
  const [activeAlert, setActiveAlert] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSettings();

    // Connect WebSocket
    const socket = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
    });

    socket.on('agent:alert', (data) => {
      handleIncomingAlert(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadSettings = async () => {
    try {
      const res = await api.get('/notifications/settings');
      if (res.data?.settings) {
        setSettings(res.data.settings);
      }
    } catch {
      // Ignore if unauthenticated
    }
  };

  const handleIncomingAlert = (data) => {
    // 1. Play Sound if enabled
    if (settings.soundEnabled) {
      if (data.eventType === 'HANDOVER_REQUEST') {
        playNotificationSound('handover');
      } else if (data.eventType === 'ORDER_PAID') {
        playNotificationSound('order');
      } else {
        playNotificationSound('message');
      }
    }

    // 2. Native Desktop Notification if enabled and permitted
    if (settings.pushEnabled && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(data.title || 'Nexa Chatbot Alert', {
          body: data.body || 'New message received',
          icon: '/favicon.ico',
        });
      }
    }

    // 3. Show In-App Floating Toast
    setActiveAlert(data);
    setTimeout(() => {
      setActiveAlert(null);
    }, 6000);
  };

  const requestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setSettings((prev) => ({ ...prev, pushEnabled: true }));
      }
    }
  };

  const saveSettings = async (newSettings) => {
    setSettings(newSettings);
    try {
      await api.put('/notifications/settings', newSettings);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        settings,
        saveSettings,
        openSettingsModal: () => setIsSettingsOpen(true),
        requestBrowserPermission,
      }}
    >
      {children}

      {/* Floating In-App Live Alert Toast */}
      {activeAlert && (
        <div
          onClick={() => {
            if (activeAlert.conversationId) {
              navigate(`/inbox?conv=${activeAlert.conversationId}`);
            } else {
              navigate('/inbox');
            }
            setActiveAlert(null);
          }}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 999999,
            background: '#0f172a',
            color: '#ffffff',
            borderRadius: 14,
            padding: '14px 18px',
            maxWidth: 380,
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid #334155',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'start',
            gap: 12,
            animation: 'slideUp 0.25s ease-out',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: activeAlert.eventType === 'HANDOVER_REQUEST' ? '#dc2626' : (activeAlert.eventType === 'ORDER_PAID' ? '#16a34a' : '#2563eb'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {activeAlert.eventType === 'HANDOVER_REQUEST' ? (
              <Shield size={18} />
            ) : activeAlert.eventType === 'ORDER_PAID' ? (
              <CreditCard size={18} />
            ) : (
              <MessageSquare size={18} />
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff', marginBottom: 2 }}>
              {activeAlert.title}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#cbd5e1', lineHeight: 1.35 }}>
              {activeAlert.body}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700, marginTop: 4, display: 'inline-block' }}>
              Click to view in Live Chat →
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveAlert(null);
            }}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Notification Settings Modal */}
      {isSettingsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={18} color="#2563eb" />
                <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Agent Notification Preferences
                </h3>
              </div>
              <button type="button" onClick={() => setIsSettingsOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Sound toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {settings.soundEnabled ? <Volume2 size={18} color="#16a34a" /> : <VolumeX size={18} color="#94a3b8" />}
                  <div>
                    <strong style={{ fontSize: '0.82rem', color: '#0f172a', display: 'block' }}>Audio Chimes</strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Play chime on new messages and alerts</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => playNotificationSound('message')}
                    style={{ padding: '4px 8px', borderRadius: 6, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.7rem', color: '#475569', cursor: 'pointer' }}
                  >
                    Test Chime
                  </button>
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => saveSettings({ ...settings, soundEnabled: e.target.checked })}
                  />
                </div>
              </div>

              {/* Browser Push */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Radio size={18} color="#2563eb" />
                  <div>
                    <strong style={{ fontSize: '0.82rem', color: '#0f172a', display: 'block' }}>Desktop Push Notifications</strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Show alerts when the tab is in background</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={requestBrowserPermission}
                    style={{ padding: '4px 8px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.7rem', color: '#2563eb', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Enable Browser
                  </button>
                  <input
                    type="checkbox"
                    checked={settings.pushEnabled}
                    onChange={(e) => saveSettings({ ...settings, pushEnabled: e.target.checked })}
                  />
                </div>
              </div>

              {/* Test Alerts */}
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Simulate Real-Time Trigger:
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => api.post('/notifications/test-alert', { eventType: 'NEW_MESSAGE' })}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontSize: '0.72rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                  >
                    💬 Message Alert
                  </button>

                  <button
                    type="button"
                    onClick={() => api.post('/notifications/test-alert', { eventType: 'HANDOVER_REQUEST' })}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}
                  >
                    🚨 Handover Alert
                  </button>

                  <button
                    type="button"
                    onClick={() => api.post('/notifications/test-alert', { eventType: 'ORDER_PAID' })}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', cursor: 'pointer' }}
                  >
                    💰 Order Paid
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  return useContext(NotificationContext);
}
