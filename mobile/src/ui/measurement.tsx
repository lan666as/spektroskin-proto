import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Capture } from '@/api/client';

import { Card, Heading, KeyValue, Muted, Row } from './components';
import { BAND_INFO } from './MultispectralCapture';
import { SimulatedBadge } from './SimulatedBadge';
import { colors, radius, spacing } from './theme';

const BAND_KEYS = ['blue', 'green', 'red', 'nir'] as const;
const CHART_HEIGHT = 140;

/** Measured reflectance per LED band, lesion vs surrounding skin: the contrast the maps use. */
export function SpectralSignature({ capture }: { capture: Capture }) {
  const sig = capture.spectral_signature;
  if (!sig) return null;
  const max = Math.max(...sig.skin, ...sig.lesion, 0.01);
  return (
    <Card testID="spectral-signature">
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading>Spectral signature</Heading>
        <SimulatedBadge />
      </Row>
      <Muted>Measured reflectance per LED band after calibration: lesion vs surrounding skin.</Muted>
      <View style={styles.chart}>
        {BAND_KEYS.map((band, i) => {
          const skin = sig.skin[i];
          const lesion = sig.lesion[i];
          const darker = skin > 0 ? Math.round((1 - lesion / skin) * 100) : 0;
          return (
            <View key={band} style={styles.group}>
              <Text style={styles.drop}>{darker > 0 ? `−${darker}%` : `${-darker}%`}</Text>
              <View style={styles.bars}>
                <View style={[styles.bar, { height: (skin / max) * CHART_HEIGHT, backgroundColor: colors.border }]} />
                <View
                  style={[styles.bar, { height: (lesion / max) * CHART_HEIGHT, backgroundColor: BAND_INFO[band].color }]}
                />
              </View>
              <Text style={styles.axis}>{sig.bands_nm[i]} nm</Text>
            </View>
          );
        })}
      </View>
      <Row>
        <View style={[styles.legendSwatch, { backgroundColor: colors.border }]} />
        <Muted>Skin</Muted>
        <View style={[styles.legendSwatch, { backgroundColor: BAND_INFO.blue.color }]} />
        <Muted>Lesion (band colour)</Muted>
      </Row>
      <KeyValue
        label="Melanin estimate, lesion vs skin"
        value={`${sig.melanin.lesion.toFixed(2)} vs ${sig.melanin.skin.toFixed(2)}`}
      />
      <KeyValue
        label="Hemoglobin estimate, lesion vs skin"
        value={`${sig.hemoglobin.lesion.toFixed(2)} vs ${sig.hemoglobin.skin.toFixed(2)}`}
      />
      <Muted>
        Why several bands: melanin absorbs strongly at 470 nm and little at 850 nm, while blood absorbs
        most at 550 nm. Unmixing these differences gives the pigment and vascular maps. Units are
        model units from a simplified optical model.
      </Muted>
    </Card>
  );
}

/** The real numbers behind the quality check and calibration, collapsed by default. */
export function QualityDetails({ capture }: { capture: Capture }) {
  const [open, setOpen] = useState(false);
  const m = capture.qc.metrics;
  const shifts = capture.registration_shift_px ?? {};
  const gains = capture.gain_correction ?? {};
  return (
    <Card testID="quality-details">
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" testID="toggle-quality-details">
        <Row style={{ justifyContent: 'space-between' }}>
          <Heading>Quality and calibration details</Heading>
          <Text style={styles.toggle}>{open ? 'Hide' : 'Show'}</Text>
        </Row>
      </Pressable>
      {open ? (
        <>
          <KeyValue label="Sharpness (Laplacian variance)" value={`${m.sharpness?.toExponential(2)} (min 5.0e-5)`} />
          <KeyValue label="Saturated pixels (glare)" value={`${((m.saturated_fraction ?? 0) * 100).toFixed(2)}% (max 0.20%)`} />
          <KeyValue label="Reference patch ratio 50%/18%" value={`${m.patch_ratio?.toFixed(2)} (expected 2.78)`} />
          <KeyValue label="Reference patch uniformity (CV)" value={`${m.patch_cv?.toFixed(3)} (max 0.100)`} />
          {m.patch_noise != null ? (
            <KeyValue label="Sensor noise on the gray patches" value={`${m.patch_noise.toFixed(4)} (max 0.0200)`} />
          ) : null}
          {Object.entries(shifts).map(([band, [dy, dx]]) => (
            <KeyValue key={band} label={`Hand-motion correction, ${band}`} value={`${dy.toFixed(1)}, ${dx.toFixed(1)} px`} />
          ))}
          {Object.entries(gains).map(([band, g]) => (
            <KeyValue key={band} label={`LED gain drift, ${band}`} value={`${((g - 1) * 100).toFixed(1)}%`} />
          ))}
          <Muted>
            Gain drift is corrected with the gray reference patches on the spacer; hand motion between
            flashes is corrected by phase correlation to the green band.
          </Muted>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  group: { alignItems: 'center', gap: 4, flex: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: CHART_HEIGHT },
  bar: { width: 18, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  drop: { fontSize: 13, fontWeight: '700', color: colors.text },
  axis: { fontSize: 12, color: colors.textMuted, paddingVertical: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  toggle: { color: colors.accent, fontWeight: '600' },
});
