import { FRAME_NAMES, type FrameSet } from '@/device/CaptureDevice';

import { api, ApiError, type Capture } from './client';

const MAX_ATTEMPTS = 3;

/**
 * Upload a frame set. The capture id is the idempotency key, so retrying after a network error
 * never creates a duplicate: the server returns the existing capture.
 */
export async function uploadCapture(frameSet: FrameSet, lesionId: string): Promise<Capture> {
  const form = new FormData();
  form.append('id', frameSet.id);
  form.append('lesion_id', lesionId);
  form.append('captured_at', frameSet.capturedAt);
  form.append('device_id', frameSet.deviceId);
  if (frameSet.phantomId) form.append('phantom_id', frameSet.phantomId);
  for (const name of FRAME_NAMES) {
    const part = frameSet.frames[name];
    if (part instanceof Blob) form.append(name, part, `${name}.png`);
    else form.append(name, part as unknown as Blob); // React Native file reference
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await api.uploadCapture(form);
    } catch (error) {
      const retryable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt * (0.5 + Math.random())));
    }
  }
}
