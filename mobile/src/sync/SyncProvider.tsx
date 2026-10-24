import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { useSession } from '@/api/session';

import { discard, enqueue, flush, offlineSupported, pendingCaptures } from './queue';
import type { PendingCapture } from './types';

const RETRY_MS = 30_000;

type SyncState = {
  offlineSupported: boolean;
  pending: PendingCapture[];
  enqueue: typeof enqueue;
  discard: (captureId: string) => Promise<void>;
  syncNow: () => Promise<void>;
};

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [pending, setPending] = useState<PendingCapture[]>([]);
  const flushing = useRef(false);

  const refresh = useCallback(async () => setPending(await pendingCaptures()), []);

  const syncNow = useCallback(async () => {
    if (flushing.current || !user) return; // one flush at a time; uploads need a session
    flushing.current = true;
    try {
      const result = await flush();
      for (const { lesionId } of result.uploaded) {
        queryClient.invalidateQueries({ queryKey: ['lesion', lesionId] });
      }
    } finally {
      flushing.current = false;
      await refresh();
    }
  }, [queryClient, refresh, user]);

  useEffect(() => {
    if (!offlineSupported) return;
    void syncNow();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void syncNow();
    });
    const timer = setInterval(() => void syncNow(), RETRY_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [syncNow]);

  const value: SyncState = {
    offlineSupported,
    pending,
    enqueue: async (frameSet, lesionId) => {
      const queued = await enqueue(frameSet, lesionId);
      await refresh();
      return queued;
    },
    discard: async (captureId) => {
      await discard(captureId);
      await refresh();
    },
    syncNow,
  };
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
