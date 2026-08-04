import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

interface PosUpdateEvent {
  resource: string;
}

// Subscribes to pos:update events and re-runs `onUpdate` whenever one of the
// given resources changes anywhere else (another terminal, another tab).
// `onUpdate` is read through a ref so callers don't need to memoize it.
export function useRealtimeRefresh(resources: string[], onUpdate: () => void) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  const resourceKey = resources.join(',');

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const handler = (payload: PosUpdateEvent) => {
      if (resourceKey.split(',').includes(payload.resource)) {
        callbackRef.current();
      }
    };

    socket.on('pos:update', handler);
    return () => {
      socket.off('pos:update', handler);
    };
  }, [resourceKey]);
}
