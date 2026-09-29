import { useEffect, useRef, useState } from 'react';
import { createSocket } from '../lib/socket.js';
import api, { unwrap } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { Button, Card, Input } from '../components/ui/index.jsx';
import { cn } from '../lib/utils.js';

// Map a server ChatMessage (or socket payload) into the view model.
function toView(m) {
  return {
    id: String(m.id || m._id),
    body: m.body ?? '',
    mine: m.senderRole === 'client',
    from: m.senderRole === 'client' ? 'You' : 'Klyro team',
    at: m.createdAt || Date.now(),
  };
}

export default function Chat() {
  useAuth();
  const [status, setStatus] = useState('connecting'); // connecting|online|offline
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadError, setLoadError] = useState(false);
  const socketRef = useRef(null);
  const listRef = useRef(null);

  // Load (or lazily create) the client's conversation + history.
  useEffect(() => {
    let alive = true;
    unwrap(api.get('/me/conversation'))
      .then((data) => {
        if (!alive) return;
        const convo = data.conversation;
        setConversationId(String(convo.id || convo._id));
        setMessages((data.messages || []).map(toView));
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  // Realtime once we know the room.
  useEffect(() => {
    if (!conversationId) return undefined;
    let socket;
    try {
      socket = createSocket();
    } catch {
      setStatus('offline');
      return undefined;
    }
    socketRef.current = socket;

    const onConnect = () => {
      setStatus('online');
      socket.emit('join', { room: conversationId });
    };
    const onDisconnect = () => setStatus('offline');
    const onMessage = (msg) => {
      if (String(msg.conversationId) !== conversationId) return;
      const view = toView(msg);
      setMessages((prev) => {
        // Replace our optimistic copy (matched by body) or skip exact duplicates.
        if (prev.some((m) => m.id === view.id)) return prev;
        const pendingIdx = prev.findIndex((m) => m.pending && m.body === view.body && view.mine);
        if (pendingIdx !== -1) {
          const next = [...prev];
          next[pendingIdx] = view;
          return next;
        }
        return [...prev, view];
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    socket.on('chat:message', onMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
      socket.off('chat:message', onMessage);
      socket.disconnect();
    };
  }, [conversationId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(e) {
    e.preventDefault();
    const body = draft.trim();
    const socket = socketRef.current;
    if (!body || !conversationId || !socket?.connected) return;
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, body, mine: true, from: 'You', at: Date.now(), pending: true },
    ]);
    setDraft('');
    socket.emit('message', { room: conversationId, body });
  }

  const statusLabel = {
    connecting: 'Connecting…',
    online: 'Connected',
    offline: 'Offline — reconnecting',
  }[status];
  const canSend = status === 'online' && Boolean(conversationId);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Chat</h1>
        <span
          role="status"
          className={cn(
            'inline-flex items-center gap-2 text-sm',
            status === 'online' ? 'text-[var(--color-success)]' : 'text-[var(--color-muted-foreground)]'
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              status === 'online' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-muted-foreground)]'
            )}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </div>

      {/* Height accounts for the sticky mobile header + input bar. */}
      <Card className="flex h-[calc(100dvh-13rem)] min-h-[320px] flex-col p-0 md:h-[65dvh]">
        <div
          ref={listRef}
          className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
          aria-live="polite"
          aria-label="Messages"
        >
          {loadError ? (
            <p className="pt-10 text-center text-sm text-[var(--color-muted-foreground)]">
              Couldn&apos;t load messages. Refresh to try again.
            </p>
          ) : messages.length === 0 ? (
            <p className="pt-10 text-center text-sm text-[var(--color-muted-foreground)]">
              No messages yet. Say hello to get started.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn('flex flex-col', m.mine ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm sm:max-w-[75%]',
                    m.mine
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
                    m.pending && 'opacity-60'
                  )}
                >
                  {m.body}
                </div>
                <span className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {m.from}
                  {m.pending ? ' · sending…' : ''}
                </span>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={send}
          className="flex items-center gap-2 border-t border-[var(--color-border)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={canSend ? 'Type a message…' : 'Connecting…'}
            aria-label="Message"
            maxLength={5000}
            enterKeyHint="send"
          />
          <Button type="submit" disabled={!draft.trim() || !canSend}>
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
