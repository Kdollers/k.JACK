import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, X, Minus, Wifi, WifiOff, Check, CheckCheck, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../i18n';
import { useShortcuts, useEscapeLayer } from '../context/ShortcutsContext';
import { apiRequest, getSessionToken } from '../services/api';
import ConfirmDialog from './ConfirmDialog';

/**
 * JENESIS Messenger.
 *
 * Conversations between authorised users of the same company. Everything goes
 * through the existing local API — no new port, no new OS surface — and the
 * server decides who may read and write (messaging:read / messaging:write).
 *
 * Live updates use Server-Sent Events over the same authenticated endpoint,
 * with automatic reconnection and a polling fallback; messages are de-duplicated
 * by id, so a reconnect never shows the same message twice.
 */
export default function MessengerPanel() {
  const { currentUser, showToast } = useApp();
  const { t } = useI18n();
  const { messengerOpen, closeMessenger, messengerUnread, setMessengerUnread } = useShortcuts();

  const [peers, setPeers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activePeerId, setActivePeerId] = useState('');
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [connected, setConnected] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [sending, setSending] = useState(false);

  const threadRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const streamAbortRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const [people, convs, unread] = await Promise.all([
        apiRequest('/api/messenger/users'),
        apiRequest('/api/messenger/conversations'),
        apiRequest('/api/messenger/unread')
      ]);
      setPeers(people);
      setConversations(convs);
      setMessengerUnread(unread.unread || 0);
    } catch (_) { /* permissions or offline: the panel simply stays empty */ }
  }, [setMessengerUnread]);

  const loadThread = useCallback(async (peerId) => {
    if (!peerId) { setThread([]); return; }
    try {
      const messages = await apiRequest(`/api/messenger/messages?peerId=${encodeURIComponent(peerId)}`);
      messages.forEach((m) => seenIdsRef.current.add(m.id));
      setThread(messages);
      // Opening a conversation marks everything from that colleague as read.
      apiRequest(`/api/messenger/conversations/${encodeURIComponent(peerId)}/read`, { method: 'POST' })
        .then(() => loadConversations())
        .catch(() => {});
    } catch (err) {
      showToast(err.message || t('messenger.load_error'), 'error');
    }
  }, [loadConversations, showToast, t]);

  // Initial load + polling fallback (also covers users without SSE support).
  useEffect(() => {
    if (!messengerOpen) return undefined;
    loadConversations();
    const id = setInterval(loadConversations, 20000);
    return () => clearInterval(id);
  }, [messengerOpen, loadConversations]);

  useEffect(() => {
    if (messengerOpen && activePeerId) loadThread(activePeerId);
  }, [messengerOpen, activePeerId, loadThread]);

  // --- live updates (SSE with automatic reconnect) --------------------------
  useEffect(() => {
    if (!messengerOpen) return undefined;
    let stopped = false;
    let reconnectTimer = null;

    const connect = async () => {
      if (stopped) return;
      const controller = new AbortController();
      streamAbortRef.current = controller;
      try {
        const res = await fetch('/api/messenger/stream', {
          headers: {
            Accept: 'text/event-stream',
            ...(getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : {})
          },
          signal: controller.signal
        });
        if (!res.ok || !res.body) throw new Error('stream failed');
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';
          for (const chunk of chunks) {
            const payload = chunk.split('\n').find((line) => line.startsWith('data: '));
            if (!payload) continue;
            let message = null;
            try { message = JSON.parse(payload.slice(6)); } catch (_) { continue; }
            if (!message || !message.id) continue;
            if (seenIdsRef.current.has(message.id)) continue; // never show twice
            seenIdsRef.current.add(message.id);
            const isActiveThread = message.senderId === activePeerId || message.recipientId === activePeerId;
            if (isActiveThread && message.senderId !== currentUser?.id) {
              setThread((prev) => [...prev, message]);
              apiRequest(`/api/messenger/conversations/${encodeURIComponent(message.senderId)}/read`, { method: 'POST' })
                .catch(() => {});
            } else if (message.recipientId === currentUser?.id) {
              setMessengerUnread((n) => n + 1);
            }
            loadConversations();
          }
        }
      } catch (_) {
        setConnected(false);
      }
      if (!stopped) {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 4000);
      }
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      streamAbortRef.current?.abort();
      setConnected(false);
    };
  }, [messengerOpen, activePeerId, currentUser?.id, loadConversations, setMessengerUnread]);

  // --- Escape: close the panel (confirm first if a draft would be lost) -----
  useEscapeLayer({
    id: 'messenger',
    priority: 80,
    active: messengerOpen,
    onEscape: () => {
      if (draft.trim()) {
        setConfirmClose(true);
        return true;
      }
      closeMessenger();
      return true;
    }
  });

  // Keep the newest message in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, messengerOpen]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activePeerId || sending) return;
    setSending(true);
    try {
      const message = await apiRequest('/api/messenger/messages', {
        method: 'POST',
        body: JSON.stringify({ recipientId: activePeerId, body })
      });
      seenIdsRef.current.add(message.id);
      setThread((prev) => [...prev, message]);
      setDraft('');
      loadConversations();
    } catch (err) {
      showToast(err.message || t('messenger.send_error'), 'error');
    } finally {
      setSending(false);
    }
  };

  const onDraftKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const visibleConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      `${c.peer.full_name} ${c.peer.username} ${c.peer.role}`.toLowerCase().includes(q));
  }, [conversations, search]);

  const recipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const known = new Set(conversations.map((c) => c.peer.id));
    const extra = peers.filter((p) => !known.has(p.id));
    if (!q) return extra;
    return [...extra].filter((p) => `${p.full_name} ${p.username}`.toLowerCase().includes(q));
  }, [peers, conversations, search]);

  if (!messengerOpen) return null;

  const activePeer = conversations.find((c) => c.peer.id === activePeerId)?.peer
    || peers.find((p) => p.id === activePeerId)
    || null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[55] w-[min(30rem,calc(100vw-2rem))] h-[32rem] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      role="dialog"
      aria-label={t('messenger.title')}
    >
      <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span>{t('messenger.title')}</span>
          {messengerUnread > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-[9px] font-bold text-white">
              {messengerUnread}
            </span>
          )}
        </h3>
        <div className="flex items-center space-x-1">
          <span
            title={connected ? t('messenger.connected') : t('messenger.reconnecting')}
            className={`p-1 rounded ${connected ? 'text-emerald-400' : 'text-amber-400'}`}
          >
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          </span>
          <button onClick={() => setConfirmClose(true)} className="text-slate-400 hover:text-white p-1 rounded" aria-label={t('messenger.minimise')}>
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={() => (draft.trim() ? setConfirmClose(true) : closeMessenger())} className="text-slate-400 hover:text-white p-1 rounded" aria-label={t('common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Conversation list */}
        <div className="w-2/5 border-r border-slate-200 flex flex-col min-h-0">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('messenger.search')}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {visibleConversations.map((c) => (
              <button
                key={c.peer.id}
                onClick={() => setActivePeerId(c.peer.id)}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-slate-50 transition ${
                  activePeerId === c.peer.id ? 'bg-emerald-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 truncate">{c.peer.full_name || c.peer.username}</span>
                  {c.unread > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-[9px] font-bold text-white">{c.unread}</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {c.lastMessage
                    ? `${c.lastMessage.mine ? `${t('messenger.you')}: ` : ''}${c.lastMessage.body}`
                    : t('messenger.no_messages')}
                </div>
              </button>
            ))}
            {recipients.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePeerId(p.id)}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-slate-50 transition ${
                  activePeerId === p.id ? 'bg-emerald-50' : ''
                }`}
              >
                <div className="text-xs font-semibold text-slate-800 truncate">{p.full_name || p.username}</div>
                <div className="text-[10px] text-slate-400 truncate">{t('messenger.start_conversation')}</div>
              </button>
            ))}
            {visibleConversations.length === 0 && recipients.length === 0 && (
              <p className="text-[10px] text-slate-400 p-3 text-center">{t('messenger.no_colleagues')}</p>
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="w-3/5 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-700 truncate">
            {activePeer ? (activePeer.full_name || activePeer.username) : t('messenger.select_colleague')}
          </div>
          <div ref={threadRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {thread.map((m) => (
              <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-xs whitespace-pre-wrap break-words ${
                  m.mine ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                }`}>
                  <div>{m.body}</div>
                  <div className={`flex items-center justify-end space-x-1 text-[9px] mt-0.5 ${
                    m.mine ? 'text-emerald-100' : 'text-slate-400'
                  }`}>
                    <span>{String(m.createdAt || '').slice(11, 16)}</span>
                    {m.mine && (
                      m.status === 'READ'
                        ? <CheckCheck className="w-3 h-3 text-sky-300" title={t('messenger.read')} />
                        : m.status === 'DELIVERED'
                          ? <CheckCheck className="w-3 h-3" title={t('messenger.delivered')} />
                          : <Check className="w-3 h-3" title={t('messenger.sent')} />
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!thread.length && (
              <p className="text-[10px] text-slate-400 text-center pt-6">{t('messenger.empty_thread')}</p>
            )}
          </div>

          <div className="p-2 border-t border-slate-200">
            <div className="flex items-end space-x-2">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onDraftKeyDown}
                disabled={!activePeerId}
                placeholder={activePeerId ? t('messenger.write_placeholder') : t('messenger.select_colleague')}
                className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
              />
              <button
                type="button"
                onClick={send}
                disabled={!activePeerId || !draft.trim() || sending}
                className="px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition"
                aria-label={t('messenger.send')}
                title={t('messenger.send')}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 mt-1">{t('messenger.send_hint')}</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClose}
        title={t('messenger.discard_title')}
        message={t('messenger.discard_message')}
        confirmLabel={t('messenger.discard_confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          setDraft('');
          closeMessenger();
        }}
      />
    </div>
  );
}
