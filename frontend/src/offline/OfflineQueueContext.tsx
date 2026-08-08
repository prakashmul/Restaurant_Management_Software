import React, { createContext, useContext } from 'react';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

type OfflineQueueValue = ReturnType<typeof useOfflineQueue>;

const OfflineQueueContext = createContext<OfflineQueueValue | null>(null);

// One provider at the app root so there's exactly one flush loop and one set
// of online/offline listeners, no matter how many components (Header's
// indicator, PosPage's save/pay calls) need this state.
export const OfflineQueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useOfflineQueue();
  return <OfflineQueueContext.Provider value={value}>{children}</OfflineQueueContext.Provider>;
};

export function useOfflineQueueContext(): OfflineQueueValue {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error('useOfflineQueueContext must be used within an OfflineQueueProvider');
  return ctx;
}
