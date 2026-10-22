import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { liveFrameSchema, socketTicketResponseSchema } from '@agapay/shared';
import { apiFetch } from '../../lib/api-client';
import { getUser } from '../../lib/session';
import { fetchCurrentUser } from '../../lib/auth-api';

const LiveContext = createContext('Connecting');
export const useLiveStatus = () => useContext(LiveContext);
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [status, setStatus] = useState('Connecting');
  useEffect(() => {
    if (!getUser()) return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let connecting = false;
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let invalidationTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingKeys = new Set<string>();
    let failures = 0;
    let cursor = 0;
    function invalidate(topic?: string) {
      const keys =
        topic === 'messages'
          ? ['support', 'in-app']
          : topic === 'notifications'
            ? ['in-app']
            : topic === 'donations'
              ? [
                  'in-app',
                  'donations',
                  'donor-dashboard',
                  'admin-dashboard',
                  'calendar',
                  'distributions',
                  'inventory',
                ]
              : [
                  'support',
                  'in-app',
                  'donations',
                  'donor-dashboard',
                  'admin-dashboard',
                  'calendar',
                  'distributions',
                  'inventory',
                ];
      for (const key of keys) pendingKeys.add(key);
      if (invalidationTimer !== undefined) return;
      invalidationTimer = setTimeout(() => {
        invalidationTimer = undefined;
        for (const key of pendingKeys) void client.invalidateQueries({ queryKey: [key] });
        pendingKeys.clear();
      }, 100);
    }
    function schedule() {
      if (stopped) return;
      setStatus(navigator.onLine ? 'Reconnecting' : 'Offline');
      clearTimeout(retry);
      retry = setTimeout(
        () => void connect(),
        Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)),
      );
    }
    async function connect() {
      if (stopped || connecting || (socket && socket.readyState !== WebSocket.CLOSED)) return;
      connecting = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      try {
        const ticket = socketTicketResponseSchema.parse(
          await apiFetch('/api/v1/auth/realtime-ticket', {
            method: 'POST',
            credentials: 'include',
            headers: { 'x-requested-with': 'agapay' },
            signal: controller.signal,
          }),
        );
        if (stopped) return;
        const base = import.meta.env.VITE_API_BASE_URL ?? '';
        const url = new URL(`${base}/api/v1/live`, window.location.origin);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(url);
        socket = ws;
        let synchronized = false;
        ws.onopen = () =>
          ws.send(JSON.stringify({ type: 'authenticate', ticket: ticket.data.ticket, cursor }));
        ws.onmessage = (message: MessageEvent<unknown>) => {
          if (stopped || socket !== ws || typeof message.data !== 'string') return;
          let raw: unknown;
          try {
            raw = JSON.parse(message.data);
          } catch {
            ws.close();
            return;
          }
          const parsed = liveFrameSchema.safeParse(raw);
          if (!parsed.success) {
            ws.close();
            return;
          }
          const frame = parsed.data;
          if (frame.type === 'ready') {
            synchronized = true;
            cursor = Math.max(cursor, frame.cursor);
            failures = 0;
            setStatus('Live');
            invalidate();
          } else if (frame.sequence > cursor) {
            const gap = frame.sequence > cursor + 1;
            cursor = frame.sequence;
            if (synchronized) invalidate(gap ? undefined : frame.topic);
          }
        };
        ws.onerror = () => ws.close();
        ws.onclose = (event) => {
          if (stopped || socket !== ws) return;
          socket = undefined;
          if (event.code === 1008) void fetchCurrentUser().catch(() => {});
          schedule();
        };
      } catch {
        schedule();
      } finally {
        clearTimeout(timeout);
        connecting = false;
      }
    }
    const online = () => {
      clearTimeout(retry);
      controller?.abort();
      socket?.close();
      if (!socket || socket.readyState === WebSocket.CLOSED) void connect();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    void connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(invalidationTimer);
      controller?.abort();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
      socket?.close();
    };
  }, [client]);
  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}
