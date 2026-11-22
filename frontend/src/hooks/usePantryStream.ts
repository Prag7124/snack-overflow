import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api';

export interface SseEventMessage {
  type: 'connected' | 'snack.created' | 'snack.updated' | 'snack.deleted' | 'vote.updated';
  data: Record<string, unknown>;
}

export function usePantryStream(
  token: string | null,
  onEvent: (event: SseEventMessage) => void
) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    const url = `${API_BASE}/events/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    source.onopen = () => {
      setConnected(true);
    };

    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as SseEventMessage;
        if (parsed.type === 'connected') {
          setConnected(true);
        }
        onEventRef.current(parsed);
      } catch {
        // Ignore malformed heartbeats
      }
    };

    source.onerror = () => {
      setConnected(false);
      // Browser EventSource automatically retries connection
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [token]);

  return { connected };
}
