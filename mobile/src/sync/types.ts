import type { FrameSet } from '@/device/CaptureDevice';

export type PendingCapture = {
  frameSet: FrameSet;
  lesionId: string;
  queuedAt: string;
  /** Set when the server rejected the upload (4xx); the item is kept for the clinician to see. */
  failedReason: string | null;
};

export type FlushResult = {
  uploaded: { captureId: string; lesionId: string }[];
  stillPending: number;
};
