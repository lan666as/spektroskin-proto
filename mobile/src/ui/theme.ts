export const colors = {
  background: '#FFFFFF',
  canvas: '#F1F5F9',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  accent: '#0F766E',
  accentSoft: '#CCFBF1',
  onAccent: '#FFFFFF',
  simulatedText: '#B45309',
  simulatedBg: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  success: '#15803D',
  successSoft: '#DCFCE7',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16 } as const;

export const type = {
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
} as const;

export const touchTarget = 48;
