import { useCallback, useEffect, useRef, useState } from 'react';
import { posApi } from '../api/posApi';
import type { OrderItem } from '../types';
import { enqueueAction, getQueuedActions, removeAction, type QueuedAction } from '../offline/offlineQueue';

const getId = (item: any): string => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return String(item._id || item.id || '');
};

// True only when the request never reached the server at all (dropped
// connection, DNS failure, local network down) — axios leaves `.response`
// undefined in exactly that case. A real 4xx/5xx from the server (bad
// input, insufficient stock, etc.) always has a `.response` and must still
// surface as a normal error, not silently get queued.
function isNetworkFailure(err: any): boolean {
  return !!err && !err.response && !!err.request;
}

const FLUSH_INTERVAL_MS = 30_000;

export function useOfflineQueue() {
  // navigator.onLine only reflects whether the OS network adapter is up —
  // it stays true if the adapter's fine but our own backend specifically is
  // unreachable (the actual failure mode this whole feature targets: a
  // dropped local/ISP route, not the machine losing WiFi outright). So the
  // displayed state is driven by real request outcomes instead, seeded from
  // navigator.onLine only as a first guess before any request has happened.
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const flushingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const actions = await getQueuedActions();
    setPendingCount(actions.length);
  }, []);

  const flushQueue = useCallback(async () => {
    // Nothing to do while logged out — and critically, must not attempt an
    // authenticated probe here: a 401 trips posApi's global interceptor into
    // reloading the page, which remounts this hook, which probes again,
    // which 401s again — an infinite reload loop hammering the server.
    if (!localStorage.getItem('authToken')) return;
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      const actions = await getQueuedActions();

      if (actions.length === 0) {
        // Nothing to sync, but still probe reachability with a cheap read
        // so the indicator correctly flips back once the server returns,
        // even before the next real save/pay action happens.
        try {
          await posApi.getTables();
          setIsOnline(true);
        } catch (err) {
          if (isNetworkFailure(err)) setIsOnline(false);
        }
        return;
      }

      for (const action of actions) {
        try {
          if (action.type === 'saveOrder') {
            await posApi.saveOrder(action.tableId, action.items);
          } else {
            // Resolve the CURRENT real pending order for this table right
            // before paying — it may only just now exist because a queued
            // saveOrder for the same table synced earlier in this same pass.
            const orders = await posApi.getOrders();
            const order = orders.find((o) => getId(o.tableId) === action.tableId && o.status === 'pending');
            if (order) {
              try {
                await posApi.payOrder(getId(order), action.paymentMethod);
              } catch (payErr: any) {
                const message: string = payErr?.response?.data?.message || '';
                // Another device already paid this table while both were
                // offline — the order is in the state this action wanted,
                // so treat it as done rather than a failure to retry forever.
                if (!message.toLowerCase().includes('already paid')) throw payErr;
              }
            }
            // No pending order left at all (e.g. voided, or already paid and
            // cleared elsewhere) — nothing left to do, drop the action.
          }
          setIsOnline(true);
          await removeAction(action.id);
        } catch (err) {
          if (isNetworkFailure(err)) {
            // Still can't reach the server — stop here, keep the rest of the
            // queue intact, try again on the next flush.
            setIsOnline(false);
            break;
          }
          // A real, non-network error on a queued action (rare — the same
          // request already succeeded once against validation client-side).
          // Drop it rather than retrying forever on something that will
          // never succeed, so one bad action can't block everything behind it.
          await removeAction(action.id);
        }
      }
    } finally {
      flushingRef.current = false;
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    flushQueue();

    // Browser-reported changes are a useful prompt to try immediately, but
    // never trusted on their own — flushQueue always re-derives isOnline
    // from what actually happens against our server.
    const handleOnline = () => flushQueue();
    const handleOffline = () => flushQueue();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Safety net: those events don't always fire reliably on every OS/
    // browser combination, so also just retry periodically regardless.
    const interval = setInterval(flushQueue, FLUSH_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [flushQueue, refreshPendingCount]);

  // Tries the real request first; only falls back to the local queue when
  // the request couldn't reach the server at all. Never throws for a
  // network failure — the caller gets { synced: false } and shows
  // "saved offline" messaging instead of an error.
  const saveOrderResilient = useCallback(
    async (tableId: string, tableNumber: number, items: OrderItem[]) => {
      try {
        await posApi.saveOrder(tableId, items);
        setIsOnline(true);
        return { synced: true as const };
      } catch (err) {
        if (!isNetworkFailure(err)) throw err;
        setIsOnline(false);
        await enqueueAction({
          id: crypto.randomUUID(),
          type: 'saveOrder',
          tableId,
          tableNumber,
          items,
          timestamp: Date.now(),
        });
        await refreshPendingCount();
        return { synced: false as const };
      }
    },
    [refreshPendingCount]
  );

  const payOrderResilient = useCallback(
    async (tableId: string, tableNumber: number, orderId: string, paymentMethod: string) => {
      try {
        await posApi.payOrder(orderId, paymentMethod);
        setIsOnline(true);
        return { synced: true as const };
      } catch (err) {
        if (!isNetworkFailure(err)) throw err;
        setIsOnline(false);
        await enqueueAction({
          id: crypto.randomUUID(),
          type: 'payOrder',
          tableId,
          tableNumber,
          paymentMethod,
          timestamp: Date.now(),
        });
        await refreshPendingCount();
        return { synced: false as const };
      }
    },
    [refreshPendingCount]
  );

  return { isOnline, pendingCount, saveOrderResilient, payOrderResilient };
}

export type { QueuedAction };
