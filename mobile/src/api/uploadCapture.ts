import { FRAME_NAMES, type FrameSet } from '@/device/CaptureDevice';

import { ApiError, authHeaders, type Capture, detailMessage, notifyUnauthorized } from './client';
import { absoluteUrl } from './config';

const MAX_ATTEMPTS = 3;
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * POST multipart with XMLHttpRequest. On native, Expo SDK 58 replaces global fetch with expo/fetch,
 * which rejects React Native file parts ({ uri, name, type }); RN's XHR uploads them natively and
 * also reports upload progress.
 */
function postMultipart<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', absoluteUrl(`/api${path}`));
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [key, value] of Object.entries(authHeaders())) xhr.setRequestHeader(key, value);
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      };
    }
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      if (xhr.status === 401) notifyUnauthorized();
      reject(new ApiError(xhr.status, detailMessage(body, xhr.status)));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error. Check the connection and try again.'));
    xhr.ontimeout = () => reject(new ApiError(0, 'Upload timed out. Check the connection and try again.'));
    xhr.send(form);
  });
}

/**
 * Upload a frame set. The capture id is the idempotency key, so retrying after a network error
 * never creates a duplicate: the server returns the existing capture.
 */
export async function uploadCapture(
  frameSet: FrameSet,
  lesionId: string,
  onProgress?: (fraction: number) => void,
): Promise<Capture> {
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
      return await postMultipart<Capture>('/captures', form, onProgress);
    } catch (error) {
      const retryable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
      if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt * (0.5 + Math.random())));
    }
  }
}
