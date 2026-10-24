import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Capture } from '@/api/client';

import { Card, Heading, Muted, Row } from './components';
import { SimulatedBadge } from './SimulatedBadge';
import { colors, radius, spacing } from './theme';

type Triage = NonNullable<Capture['triage_model']>;
type Pattern = keyof typeof PATTERN_LABELS;

export const PATTERN_LABELS = {
  pigmented: 'Pigment-dominant',
  vascular: 'Blood-vessel-dominant',
  mixed: 'Mixed pigment and vessels',
} as const;

export function patternSummary(t: Triage): string {
  return t.pattern ? PATTERN_LABELS[t.pattern] : 'Uncertain: dermatologist decides';
}

/**
 * Research-mode lesion-pattern suggestion. It describes which chromophore pattern dominates,
 * never whether a lesion is benign or malignant: the simulated training data has no such labels.
 */
export function TriageSupport({ capture }: { capture: Capture }) {
  const router = useRouter();
  const t = capture.triage_model;
  if (!t) return null;
  const ranked = (Object.keys(PATTERN_LABELS) as Pattern[]).sort(
    (a, b) => (t.probabilities[b] ?? 0) - (t.probabilities[a] ?? 0),
  );
  return (
    <Card testID="triage-support" style={{ borderColor: colors.accent }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Heading>Triage support</Heading>
        <Row style={{ gap: spacing.xs }}>
          <View style={styles.research}>
            <Text style={styles.researchText}>Research mode · not a diagnosis</Text>
          </View>
          <SimulatedBadge label="Simulated training data" />
        </Row>
      </Row>
      <View style={{ gap: 2 }}>
        <Muted>Suggested lesion pattern</Muted>
        <Text style={styles.pattern} testID="triage-pattern">
          {patternSummary(t)}
        </Text>
      </View>
      {ranked.map((p) => {
        const value = t.probabilities[p] ?? 0;
        return (
          <View key={p} style={styles.barRow} testID={`triage-prob-${p}`}>
            <Text style={styles.barLabel}>{PATTERN_LABELS[p]}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(value * 100)}%` }]} />
            </View>
            <Text style={styles.barValue}>{Math.round(value * 100)}%</Text>
          </View>
        );
      })}
      {t.drivers?.length ? (
        <View style={{ gap: 4 }} testID="triage-drivers">
          <Text style={styles.why}>Why this suggestion</Text>
          {t.drivers.map((d) => (
            <Row key={d.feature} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={styles.driver}>
                {d.level === 'high' ? 'High' : 'Low'} {d.feature}
              </Text>
              <Text style={[styles.driverEffect, { color: d.contribution > 0 ? colors.success : colors.danger }]}>
                {d.contribution > 0 ? 'supports' : 'argues against'}
              </Text>
            </Row>
          ))}
        </View>
      ) : null}
      <Muted>
        Model confidence across the three patterns, from the pigment and blood maps. Below{' '}
        {Math.round(t.abstain_below * 100)}% it abstains. On held-out simulated lesions it answered{' '}
        {Math.round(t.held_out_coverage * 100)}% of the time and was right on{' '}
        {Math.round(t.held_out_accuracy_when_answered * 100)}% of those. Trained on {t.trained_on}: it
        does not say whether a lesion is benign or malignant, and is not validated on real skin.
      </Muted>
      <Pressable onPress={() => router.push('/ai-roadmap')} testID="triage-roadmap">
        <Text style={styles.link}>Model card and roadmap →</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  research: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  researchText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  pattern: { fontSize: 22, fontWeight: '800', color: colors.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { width: 170, fontSize: 14, color: colors.text },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  barValue: { width: 44, textAlign: 'right', fontSize: 14, fontWeight: '700', color: colors.text },
  link: { color: colors.accent, fontWeight: '600', paddingVertical: spacing.xs },
  why: { fontSize: 14, fontWeight: '700', color: colors.text },
  driver: { fontSize: 14, color: colors.text, flex: 1 },
  driverEffect: { fontSize: 13, fontWeight: '700' },
});
