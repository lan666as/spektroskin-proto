import type { BodySite, CaseStatus, Lesion, Patient, ReviewAction } from '@/api/client';

export const BODY_SITES: { value: BodySite; label: string; acral?: boolean }[] = [
  { value: 'sole', label: 'Sole', acral: true },
  { value: 'palm', label: 'Palm', acral: true },
  { value: 'fingernail', label: 'Fingernail', acral: true },
  { value: 'toenail', label: 'Toenail', acral: true },
  { value: 'face', label: 'Face' },
  { value: 'scalp', label: 'Scalp' },
  { value: 'neck', label: 'Neck' },
  { value: 'chest', label: 'Chest' },
  { value: 'abdomen', label: 'Abdomen' },
  { value: 'upper_back', label: 'Upper back' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'upper_arm', label: 'Upper arm' },
  { value: 'forearm', label: 'Forearm' },
  { value: 'hand_dorsum', label: 'Back of hand' },
  { value: 'thigh', label: 'Thigh' },
  { value: 'lower_leg', label: 'Lower leg' },
  { value: 'foot_dorsum', label: 'Top of foot' },
  { value: 'genital', label: 'Genital' },
  { value: 'other', label: 'Other' },
];

export const ACTION_LABELS: Record<ReviewAction, string> = {
  observe: 'Observe',
  biopsy: 'Biopsy',
  refer: 'Refer',
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  answered: 'Answered',
};

export function statusTone(status: CaseStatus): 'neutral' | 'info' | 'success' {
  return status === 'answered' ? 'success' : status === 'in_review' ? 'info' : 'neutral';
}

export function siteLabel(lesion: Pick<Lesion, 'body_site' | 'laterality'>): string {
  const site = BODY_SITES.find((s) => s.value === lesion.body_site)?.label ?? lesion.body_site;
  if (!lesion.laterality || lesion.laterality === 'midline') return site;
  const side = lesion.laterality === 'left' ? 'Left' : 'Right';
  return `${side} ${site.toLowerCase()}`;
}

export function demographics(p: Pick<Patient, 'age' | 'sex' | 'fitzpatrick'>): string {
  return `${p.age} ${p.sex === 'female' ? 'F' : 'M'} · Fitzpatrick ${p.fitzpatrick}`;
}

export function patientLabel(p: Pick<Patient, 'code' | 'age' | 'sex' | 'fitzpatrick'>): string {
  return `${p.code} · ${demographics(p)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Visit day relative to the lesion's first capture: the first visit is Day 01. */
export function visitDay(capturedAt: string, firstCapturedAt: string): number {
  return Math.floor((Date.parse(capturedAt) - Date.parse(firstCapturedAt)) / DAY_MS) + 1;
}

export function formatArea(mm2: number | null | undefined): string {
  return mm2 == null ? '—' : `${mm2.toFixed(1)} mm²`;
}
