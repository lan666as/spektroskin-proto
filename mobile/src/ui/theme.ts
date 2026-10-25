// Palette from the pitch deck and the Figma mocks (docs/figma): light canvas, white cards, clinical
// blue accent, navy for emphasis. Amber stays reserved for the Simulated badge.
export const colors = {
  background: '#FFFFFF',
  canvas: '#F1F4F9',
  surface: '#F7F9FC',
  border: '#E6EBF2',
  text: '#0B2545',
  textMuted: '#5B6B82',
  navy: '#0B2545',
  navySoft: '#1C3A63',
  onNavyMuted: '#B9C7DD',
  accent: '#1A5DA6',
  accentDeep: '#14497F',
  accentSoft: '#E6EFFA',
  teal: '#12A4A0',
  tealSoft: '#E0F5F4',
  onAccent: '#FFFFFF',
  simulatedText: '#B45309',
  simulatedBg: '#FEF3C7',
  danger: '#C0262D',
  dangerSoft: '#FDE8E8',
  success: '#157F4A',
  successSoft: '#DFF5E8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const type = {
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.1 },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
} as const;

export const shadow = {
  shadowColor: '#0B2545',
  shadowOpacity: 0.06,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

export const touchTarget = 48;
