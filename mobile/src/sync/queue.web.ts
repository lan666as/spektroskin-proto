import type { FrameSet } from '@/device/CaptureDevice';

import type { FlushResult, PendingCapture } from './types';

// Web frames are in-memory Blobs that cannot be persisted cheaply; the web build stays online-only.
export const offlineSupported = false;

export async function pendingCaptures(): Promise<PendingCapture[]> {
  return [];
}

export async function enqueue(_frameSet: FrameSet, _lesionId: string): Promise<boolean> {
  return false;
}

export async function discard(_captureId: string): Promise<void> {}

export async function flush(): Promise<FlushResult> {
  return { uploaded: [], stillPending: 0 };
}
