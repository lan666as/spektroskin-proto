import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

import { BANDS, FRAME_NAMES, type FrameName } from '@/device/CaptureDevice';

import { SimulatedBadge } from './SimulatedBadge';
import { colors, radius, spacing } from './theme';

export const BAND_INFO: Record<FrameName, { label: string; nm: string; color: string }> = {
  blue: { label: 'Blue LED', nm: '470 nm', color: '#3B82F6' },
  green: { label: 'Green LED', nm: '550 nm', color: '#22C55E' },
  red: { label: 'Red LED', nm: '660 nm', color: '#EF4444' },
  nir: { label: 'Near-infrared LED', nm: '850 nm', color: '#BE185D' },
  dark: { label: 'Dark frame', nm: 'LEDs off', color: '#64748B' },
};

export type CaptureView = {
  frames: Partial<Record<FrameName, ImageSourcePropType>>;
  firing: FrameName | null;
  processing: boolean;
};

/** Live view of the multispectral sequence: one LED at a time, then the dark frame. */
export function MultispectralCapture({ frames, firing, processing }: CaptureView) {
  const last = [...FRAME_NAMES].reverse().find((n) => frames[n]);
  const shown = firing ?? last ?? null;
  return (
    <View style={{ gap: spacing.md }} testID="multispectral-capture">
      <View style={styles.viewer}>
        {processing ? (
          <View style={styles.grid} testID="capture-processing">
            {BANDS.map((band) => (
              <View key={band} style={styles.gridCell}>
                {frames[band] ? <Image source={frames[band]} style={styles.fill} /> : null}
                <Text style={styles.gridLabel}>{BAND_INFO[band].nm}</Text>
              </View>
            ))}
          </View>
        ) : shown && frames[shown] && firing !== shown ? (
          <Image source={frames[shown]} style={styles.fill} />
        ) : shown ? (
          <View style={[styles.fill, styles.glow, { backgroundColor: BAND_INFO[shown].color }]} />
        ) : (
          <View style={[styles.fill, styles.idle]} testID="capture-ready">
            <View style={styles.spacerRing}>
              <Text style={styles.idleText}>Ready</Text>
              <Text style={styles.idleSub}>Lesion inside the ring</Text>
            </View>
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
              <View key={corner} style={[styles.patch, PATCH_POSITION[corner]]} />
            ))}
            <Text style={styles.guideText}>Press the spacer flat; gray patches stay in view</Text>
          </View>
        )}
        {shown && !processing ? (
          <View style={styles.caption}>
            <Text style={styles.captionText} testID="capture-band">
              {BAND_INFO[shown].label} · {BAND_INFO[shown].nm}
            </Text>
          </View>
        ) : null}
        <View style={styles.badge}>
          <SimulatedBadge />
        </View>
      </View>
      <View style={styles.tiles}>
        {FRAME_NAMES.map((name) => {
          const info = BAND_INFO[name];
          const active = firing === name;
          return (
            <View key={name} style={styles.tileWrap}>
              <View
                style={[
                  styles.tile,
                  { borderColor: active || frames[name] ? info.color : colors.border },
                  active && styles.tileActive,
                ]}
                testID={frames[name] ? `band-captured-${name}` : `band-pending-${name}`}
              >
                {frames[name] ? <Image source={frames[name]} style={styles.fill} /> : null}
              </View>
              <Text style={styles.tileLabel}>{name === 'dark' ? 'Dark' : info.nm.replace(' nm', '')}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const PATCH_POSITION = {
  tl: { top: 14, left: 14 },
  tr: { top: 14, right: 14 },
  bl: { bottom: 40, left: 14 },
  br: { bottom: 40, right: 14 },
} as const;

const styles = StyleSheet.create({
  spacerRing: {
    width: '62%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  patch: { position: 'absolute', width: 26, height: 26, borderRadius: 4, backgroundColor: '#64748B' },
  guideText: { position: 'absolute', bottom: 12, color: '#94A3B8', fontSize: 12 },
  viewer: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1,
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  fill: { width: '100%', height: '100%' },
  glow: { opacity: 0.55 },
  idle: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  idleText: { color: '#E2E8F0', fontSize: 22, fontWeight: '700' },
  idleSub: { color: '#94A3B8', fontSize: 14 },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  captionText: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  badge: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: '50%', height: '50%', padding: 1 },
  gridLabel: {
    position: 'absolute',
    left: 6,
    bottom: 4,
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  tiles: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  tileWrap: { flex: 1, maxWidth: 72, alignItems: 'center', gap: 4 },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tileActive: { borderWidth: 3, transform: [{ scale: 1.08 }] },
  tileLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
});
