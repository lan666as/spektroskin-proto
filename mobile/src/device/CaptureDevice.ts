/**
 * Boundary between the app and the optical module. Tonight only VirtualCaptureDevice exists;
 * a USB implementation of this interface replaces it with no changes elsewhere.
 */
export const BANDS = ['blue', 'green', 'red', 'nir'] as const;
export type Band = (typeof BANDS)[number];
export type FrameName = Band | 'dark';
export const FRAME_NAMES: readonly FrameName[] = [...BANDS, 'dark'];

/** A frame ready for multipart upload: a Blob on web, a file reference on native. */
export type FramePart = Blob | { uri: string; name: string; type: string };

export type FrameSet = {
  id: string;
  capturedAt: string;
  deviceId: string;
  phantomId: string | null;
  frames: Record<FrameName, FramePart>;
};

export type DeviceStatus = {
  connected: boolean;
  deviceId: string;
  label: string;
  simulated: boolean;
};

export type CaptureProgress = { step: FrameName; index: number; total: number };

export interface CaptureDevice {
  connect(): Promise<DeviceStatus>;
  status(): DeviceStatus;
  capture(onProgress?: (progress: CaptureProgress) => void): Promise<FrameSet>;
}
