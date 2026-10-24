import type { components } from './schema';
import { absoluteUrl } from './config';

export type Schemas = components['schemas'];
export type User = Schemas['UserOut'];
export type Patient = Schemas['PatientOut'];
export type PatientListItem = Schemas['PatientListItem'];
export type PatientDetail = Schemas['PatientDetail'];
export type Lesion = Schemas['LesionOut'];
export type LesionDetail = Schemas['LesionDetail'];
export type Capture = Schemas['CaptureOut'];
export type CaseSummary = Schemas['CaseSummary'];
export type CaseDetail = Schemas['CaseDetail'];
export type PatientCreate = Schemas['PatientCreate'];
export type LesionCreate = Schemas['LesionCreate'];
export type CaseCreate = Schemas['CaseCreate'];
export type ReviewCreate = Schemas['ReviewCreate'];
export type BodySite = Schemas['LesionCreate']['body_site'];
export type Validation = Schemas['ValidationOut'];
export type AuditEvent = Schemas['AuditEventOut'];
export type ReviewAction = Schemas['ReviewCreate']['action'];
export type CaseStatus = Schemas['CaseSummary']['status'];
export type OutcomeIn = Schemas['OutcomeIn'];
export type SimulatedCapture = Schemas['SimulatedCaptureOut'];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 30_000;
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/** Bearer header for callers outside `request` (the XHR upload). */
export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function notifyUnauthorized() {
  onUnauthorized?.();
}

export function detailMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  if (status === 0) return 'Network error. Check the connection and try again.';
  return `Request failed (${status})`;
}

async function request<T>(
  method: string,
  path: string,
  body?: BodyInit,
  contentType: string | null = 'application/json',
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // Multipart bodies (FormData) must not set Content-Type: fetch adds the boundary itself.
  if (contentType && body !== undefined) headers['Content-Type'] = contentType;
  let response: Response;
  try {
    response = await fetch(absoluteUrl(`/api${path}`), {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    // Only a real transport failure (or our timeout) is "network"; anything else is a bug to show.
    const transport = error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
    if (transport) throw new ApiError(0, 'Network error. Check the connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/token') onUnauthorized?.();
    throw new ApiError(response.status, detailMessage(payload, response.status));
  }
  return payload as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body: unknown) => request<T>('POST', path, JSON.stringify(body));
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, JSON.stringify(body));

export const api = {
  login(username: string, password: string) {
    const form = new URLSearchParams({ username, password });
    return request<Schemas['Token']>(
      'POST',
      '/auth/token',
      form.toString(),
      'application/x-www-form-urlencoded',
    ).catch(
      (error: ApiError) => {
        throw error.status === 401 ? new ApiError(401, 'Incorrect username or password') : error;
      },
    );
  },
  me: () => get<User>('/auth/me'),
  patients: () => get<PatientListItem[]>('/patients'),
  patient: (id: string) => get<PatientDetail>(`/patients/${id}`),
  createPatient: (body: PatientCreate) => post<Patient>('/patients', body),
  createLesion: (body: LesionCreate) => post<Lesion>('/lesions', body),
  lesion: (id: string) => get<LesionDetail>(`/lesions/${id}`),
  capture: (id: string) => get<Capture>(`/captures/${id}`),
  cases: (statuses: CaseStatus[] = []) =>
    get<CaseSummary[]>(`/cases${statuses.length ? '?' + statuses.map((s) => `status=${s}`).join('&') : ''}`),
  case: (id: string) => get<CaseDetail>(`/cases/${id}`),
  createCase: (body: CaseCreate) => post<CaseDetail>('/cases', body),
  audit: (before?: string) =>
    get<AuditEvent[]>(`/audit?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  validation: (captureId: string) => get<Validation>(`/validation/${captureId}`),
  review: (caseId: string, body: ReviewCreate) => post<CaseDetail>(`/cases/${caseId}/review`, body),
  similarCases: (caseId: string) => get<Schemas['SimilarCase'][]>(`/cases/${caseId}/similar`),
  aiSummary: () => get<Schemas['AISummary']>('/ai/summary'),
  simulateCapture: (body: Schemas['SimulatedCaptureIn']) => post<SimulatedCapture>('/simulator/captures', body),
  recordOutcome: (caseId: string, body: OutcomeIn) => put<CaseDetail>(`/cases/${caseId}/outcome`, body),
};
