import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/api/client';
import { uploadCapture } from '@/api/uploadCapture';
import type { FrameSet } from '@/device/CaptureDevice';

import type { FlushResult, PendingCapture } from './types';

const KEY = 'spektroskin.pendingCaptures.v1';

async function read(): Promise<PendingCapture[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as PendingCapture[]) : [];
}

async function write(items: PendingCapture[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export const offlineSupported = true;

export async function pendingCaptures(): Promise<PendingCapture[]> {
  return read();
}

/** Persist a frame set whose upload failed for lack of network. Idempotent on the capture id. */
export async function enqueue(frameSet: FrameSet, lesionId: string): Promise<boolean> {
  const items = await read();
  if (!items.some((i) => i.frameSet.id === frameSet.id)) {
    items.push({ frameSet, lesionId, queuedAt: new Date().toISOString(), failedReason: null });
    await write(items);
  }
  return true;
}

export async function discard(captureId: string): Promise<void> {
  await write((await read()).filter((i) => i.frameSet.id !== captureId));
}

/**
 * Upload pending captures oldest first. Stops at the first network error (still offline); a 4xx
 * answer is terminal for that item, which stays visible with its reason instead of retrying.
 */
export async function flush(): Promise<FlushResult> {
  const result: FlushResult = { uploaded: [], stillPending: 0 };
  for (const item of await read()) {
    if (item.failedReason) continue;
    try {
      const capture = await uploadCapture(item.frameSet, item.lesionId);
      result.uploaded.push({ captureId: capture.id, lesionId: item.lesionId });
      await discard(item.frameSet.id);
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401) {
        const items = await read();
        const target = items.find((i) => i.frameSet.id === item.frameSet.id);
        if (target) target.failedReason = error.message;
        await write(items);
        continue;
      }
      break;
    }
  }
  result.stillPending = (await read()).filter((i) => !i.failedReason).length;
  return result;
}
