import type { BodySite, CaseStatus, CaseSummary, Lesion, Patient, ReviewAction } from '@/api/client';

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

/** "just now", "4 min", "2 h 5 min", "3 days" between two instants (default: now). */
export function duration(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso);
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Palms, soles and nails: flagged so reviewers notice the site (metadata, not a diagnosis). */
export function isAcral(site: BodySite): boolean {
  return BODY_SITES.some((s) => s.value === site && s.acral);
}

export type AttentionFlag = CaseSummary['attention_flags'][number];

/** Queue flag text and why it is raised; each is a named criterion, never a score. */
export const FLAG_LABELS: Record<AttentionFlag, { label: string; why: string; tone: 'danger' | 'info' | 'neutral' }> = {
  ridge_pattern: {
    label: 'Ridge pattern',
    why: 'Acral pattern model (research mode): pigment along the ridges, a guideline reason for prompt review.',
    tone: 'danger',
  },
  checklist_suspicious: {
    label: 'Checklist threshold met',
    why: 'An automated melanoma checklist (ABCD TDS or, on acral sites, BRAAFF) reaches its published threshold.',
    tone: 'danger',
  },
  growing: {
    label: 'Growing',
    why: 'Area grew 20% or more since the first visit (evolution).',
    tone: 'danger',
  },
  border_change: {
    label: 'Border changed',
    why: 'Border became less regular since the first visit.',
    tone: 'info',
  },
  looks_different: {
    label: 'Looks different',
    why: "Stands out from this patient's other lesions by pigment and blood statistics (ugly duckling sign).",
    tone: 'danger',
  },
  ai_unsure: {
    label: 'AI unsure',
    why: 'The triage model abstained: no pattern suggestion for this lesion.',
    tone: 'neutral',
  },
};
