import { useEffect, useRef, useState } from 'react';
import { createSocket } from '../lib/socket.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { Button, Card, Input } from '../components/ui/index.jsx';
import { cn } from '../lib/utils.js';

const ROOM = 'portal';

export default function Chat() {
  const { user } = useAuth();
  const [status, setStatus] = useState('connecting'); // connecting|online|offline
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const socketRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
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
      socket.emit('join', { room: ROOM });
    };
    const onDisconnect = () => setStatus('offline');
    const onError = () => setStatus('offline');
    const onMessage = (msg) =>
      setMessages((prev) => [
        ...prev,
        {
          id: msg.id || Math.random().toString(36).slice(2),
          body: msg.body ?? msg.text ?? '',
          from: msg.from || msg.senderName || 'Support',
          mine: false,
          at: msg.at || Date.now(),
        },
      ]);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.on('error', onError);
    socket.on('message', onMessage);
    socket.on('chat:message', onMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.off('error', onError);
      socket.off('message', onMessage);
      socket.off('chat:message', onMessage);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const local = {
      id: Math.random().toString(36).slice(2),
      body,
      from: user?.name || 'You',
      mine: true,
      at: Date.now(),
    };
    setMessages((prev) => [...prev, local]);
    setDraft('');
    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit('message', { room: ROOM, body });
    }
  }

  const statusLabel = {
    connecting: 'Connecting…',
    online: 'Connected',
    offline: 'Offline — messages will be queued locally',
  }[status];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Chat</h1>
        <span
          className={cn(
            'inline-flex items-center gap-2 text-sm',
            status === 'online'
              ? 'text-[var(--color-success)]'
              : 'text-[var(--color-muted-foreground)]'
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              status === 'online'
                ? 'bg-[var(--color-success)]'
                : 'bg-[var(--color-muted-foreground)]'
            )}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </div>

      <Card className="flex h-[60dvh] flex-col p-0">
        <div
          ref={listRef}
          className="flex-1 space-y-3 overflow-y-auto p-4"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <p className="pt-10 text-center text-sm text-[var(--color-muted-foreground)]">
              No messages yet. Say hello to get started.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex flex-col',
                  m.mine ? 'items-end' : 'items-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                    m.mine
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-foreground)]'
                  )}
                >
                  {m.body}
                </div>
                <span className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {m.from}
                </span>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={send}
          className="flex items-center gap-2 border-t border-[var(--color-border)] p-3"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            aria-label="Message"
          />
          <Button type="submit" disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
