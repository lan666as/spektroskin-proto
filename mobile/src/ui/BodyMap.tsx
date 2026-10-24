import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BodySite, LesionCreate } from '@/api/client';

import { Chips, Muted } from './components';
import { colors, radius, spacing } from './theme';

type Laterality = LesionCreate['laterality'];
export type SiteChoice = { site: BodySite; laterality: Laterality };
type Region = SiteChoice & { x: number; y: number; w: number; h: number; r?: number };

// Figure drawn on a 200 × 380 canvas. Front view: the patient's right is on the viewer's left.
const R = 'right' as const;
const L = 'left' as const;
const M = 'midline' as const;
const LIMBS = (near: Laterality, far: Laterality, foot: BodySite): Region[] => [
  { site: 'upper_arm', laterality: near, x: 34, y: 60, w: 24, h: 56, r: 10 },
  { site: 'upper_arm', laterality: far, x: 142, y: 60, w: 24, h: 56, r: 10 },
  { site: 'forearm', laterality: near, x: 26, y: 118, w: 24, h: 56, r: 10 },
  { site: 'forearm', laterality: far, x: 150, y: 118, w: 24, h: 56, r: 10 },
  { site: 'hand_dorsum', laterality: near, x: 20, y: 176, w: 26, h: 28, r: 10 },
  { site: 'hand_dorsum', laterality: far, x: 154, y: 176, w: 26, h: 28, r: 10 },
  { site: 'thigh', laterality: near, x: 66, y: 186, w: 32, h: 80, r: 12 },
  { site: 'thigh', laterality: far, x: 102, y: 186, w: 32, h: 80, r: 12 },
  { site: 'lower_leg', laterality: near, x: 68, y: 270, w: 28, h: 78, r: 12 },
  { site: 'lower_leg', laterality: far, x: 104, y: 270, w: 28, h: 78, r: 12 },
  { site: foot, laterality: near, x: 62, y: 352, w: 34, h: 22, r: 8 },
  { site: foot, laterality: far, x: 104, y: 352, w: 34, h: 22, r: 8 },
];
const FRONT: Region[] = [
  { site: 'face', laterality: M, x: 80, y: 0, w: 40, h: 44, r: 20 },
  { site: 'neck', laterality: M, x: 90, y: 44, w: 20, h: 12, r: 4 },
  { site: 'chest', laterality: M, x: 62, y: 58, w: 76, h: 54, r: 12 },
  { site: 'abdomen', laterality: M, x: 66, y: 114, w: 68, h: 50, r: 12 },
  { site: 'genital', laterality: M, x: 88, y: 166, w: 24, h: 18, r: 8 },
  ...LIMBS(R, L, 'foot_dorsum'),
];
// Back view: the patient's left is on the viewer's left; the feet show the soles.
const BACK: Region[] = [
  { site: 'scalp', laterality: M, x: 80, y: 0, w: 40, h: 44, r: 20 },
  { site: 'neck', laterality: M, x: 90, y: 44, w: 20, h: 12, r: 4 },
  { site: 'upper_back', laterality: M, x: 62, y: 58, w: 76, h: 54, r: 12 },
  { site: 'lower_back', laterality: M, x: 66, y: 114, w: 68, h: 70, r: 12 },
  ...LIMBS(L, R, 'sole'),
];

const ACRAL: { value: string; label: string; choice: SiteChoice }[] = [
  { value: 'sole-left', label: 'Left sole', choice: { site: 'sole', laterality: 'left' } },
  { value: 'sole-right', label: 'Right sole', choice: { site: 'sole', laterality: 'right' } },
  { value: 'palm-left', label: 'Left palm', choice: { site: 'palm', laterality: 'left' } },
  { value: 'palm-right', label: 'Right palm', choice: { site: 'palm', laterality: 'right' } },
  { value: 'fingernail', label: 'Fingernail', choice: { site: 'fingernail', laterality: null } },
  { value: 'toenail', label: 'Toenail', choice: { site: 'toenail', laterality: null } },
];

const same = (a: SiteChoice | null, b: SiteChoice) =>
  !!a && a.site === b.site && (a.laterality ?? null) === (b.laterality ?? null);

export function BodyMap({ value, onChange }: { value: SiteChoice | null; onChange: (c: SiteChoice) => void }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const regions = side === 'front' ? FRONT : BACK;
  const acralValue = ACRAL.find((a) => same(value, a.choice))?.value ?? null;
  return (
    <View style={{ gap: spacing.md }} testID="body-map">
      <Chips
        label="Acral sites (palms, soles, nails)"
        options={ACRAL}
        value={acralValue}
        onChange={(v) => onChange(ACRAL.find((a) => a.value === v)!.choice)}
        testIDPrefix="acral"
      />
      <Chips
        options={[
          { value: 'front', label: 'Front' },
          { value: 'back', label: 'Back' },
        ]}
        value={side}
        onChange={setSide}
        testIDPrefix="body-side"
      />
      <View style={styles.canvas}>
        {regions.map((region) => {
          const selected = same(value, region);
          return (
            <Pressable
              key={`${region.site}-${region.laterality}`}
              accessibilityRole="button"
              accessibilityLabel={`${region.laterality && region.laterality !== 'midline' ? `${region.laterality} ` : ''}${region.site.replace('_', ' ')}`}
              onPress={() => onChange({ site: region.site, laterality: region.laterality })}
              testID={`region-${side}-${region.site}-${region.laterality}`}
              style={[
                styles.region,
                {
                  left: region.x,
                  top: region.y,
                  width: region.w,
                  height: region.h,
                  borderRadius: region.r ?? radius.sm,
                },
                selected && styles.selected,
              ]}
            />
          );
        })}
        <Text style={[styles.sideLabel, { left: 0 }]}>{side === 'front' ? 'R' : 'L'}</Text>
        <Text style={[styles.sideLabel, { right: 0 }]}>{side === 'front' ? 'L' : 'R'}</Text>
      </View>
      <Muted style={{ textAlign: 'center' }}>
        {side === 'front'
          ? "Front view: the patient's right is on your left."
          : "Back view: the patient's left is on your left. Feet show the soles."}
      </Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: 200, height: 380, alignSelf: 'center' },
  region: { position: 'absolute', backgroundColor: '#E7D3C4', borderWidth: 1, borderColor: '#C9AE9A' },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  sideLabel: { position: 'absolute', top: 0, fontSize: 13, fontWeight: '700', color: colors.textMuted },
});
