import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { captureDevice } from '@/device/VirtualCaptureDevice';

import { SimulatedBadge } from './SimulatedBadge';
import { colors, radius, shadow, spacing } from './theme';

const SPECS = ['White · NIR 850 nm', 'Polarized', 'Pigment contrast', '50–100×'];

/** The SK-2 module card from the Figma home screen; tonight it is the virtual module. */
export function DeviceCard({ children, note }: { children?: ReactNode; note?: string }) {
  const status = captureDevice.status();
  return (
    <View style={styles.card} testID="device-card">
      <View style={[styles.ring, styles.ringLarge]} />
      <View style={[styles.ring, styles.ringSmall]} />
      <View style={styles.top}>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: status.connected ? '#4ADE80' : '#F87171' }]} />
          <Text style={styles.statusText}>{status.connected ? 'Connected' : 'Disconnected'}</Text>
        </View>
        <SimulatedBadge />
      </View>
      <View>
        <Text style={styles.name}>SpektroSkin SK-2</Text>
        <Text style={styles.sub}>Virtual module · {status.deviceId}</Text>
      </View>
      <View style={styles.specs}>
        {SPECS.map((spec) => (
          <View key={spec} style={styles.spec}>
            <Text style={styles.specText}>{spec}</Text>
          </View>
        ))}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    overflow: 'hidden',
    ...shadow,
  },
  ring: { position: 'absolute', borderRadius: 999 },
  ringLarge: { width: 260, height: 260, right: -90, top: -110, backgroundColor: 'rgba(255,255,255,0.08)' },
  ringSmall: { width: 160, height: 160, left: -60, bottom: -90, backgroundColor: colors.accentDeep, opacity: 0.6 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#DCFCE7', fontSize: 13, fontWeight: '700' },
  name: { color: colors.onAccent, fontSize: 22, fontWeight: '800', letterSpacing: -0.2 },
  sub: { color: 'rgba(255,255,255,0.72)', fontSize: 14, marginTop: 2 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  spec: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  specText: { color: colors.onAccent, fontSize: 13, fontWeight: '600' },
  note: { color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 18 },
});
