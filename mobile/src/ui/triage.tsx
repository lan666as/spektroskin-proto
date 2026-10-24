import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BodySite, Capture } from '@/api/client';

import { Card, Heading, Muted, Row } from './components';
import { isAcral } from './labels';
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
export function TriageSupport({ capture, read }: { capture: Capture; read?: string | null }) {
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
        <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
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
      {read ? (
        <Text style={styles.agreement} testID="triage-agreement">
          {read === 'unsure'
            ? 'Your read: unsure'
            : !t.pattern
              ? `Your read: ${PATTERN_LABELS[read as Pattern]} · model abstained`
              : read === t.pattern
                ? `Your read: ${PATTERN_LABELS[read as Pattern]} · model agrees`
                : `Your read: ${PATTERN_LABELS[read as Pattern]} · model differs`}
        </Text>
      ) : null}
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

const ACRAL_LABELS = {
  furrow: 'Pigment follows the furrows (parallel furrow pattern)',
  ridge: 'Pigment follows the ridges (parallel ridge pattern)',
} as const;

/**
 * Research-mode acral pattern read, shown only for palm, sole and nail sites. The ridge pattern is
 * a guideline reason for prompt specialist review; the card says so, and nothing more.
 */
export function AcralPattern({ capture, site }: { capture: Capture; site: BodySite }) {
  const a = capture.acral_model;
  if (!a || !isAcral(site)) return null;
  const ridge = a.pattern === 'ridge';
  return (
    <Card testID="acral-pattern" style={{ borderColor: ridge ? colors.danger : colors.accent }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Heading>Acral pattern</Heading>
        <Row style={{ gap: spacing.xs, flexWrap: 'wrap' }}>
          <View style={styles.research}>
            <Text style={styles.researchText}>Research mode · not a diagnosis</Text>
          </View>
          <SimulatedBadge label="Simulated training data" />
        </Row>
      </Row>
      <Text style={styles.acral} testID="acral-pattern-result">
        {a.pattern ? ACRAL_LABELS[a.pattern] : 'Uncertain: pattern too faint to call'}
      </Text>
      {(['furrow', 'ridge'] as const).map((p) => (
        <View key={p} style={styles.barRow}>
          <Text style={styles.barLabel}>{p === 'furrow' ? 'Along furrows' : 'Along ridges'}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((a.probabilities[p] ?? 0) * 100)}%` }]} />
          </View>
          <Text style={styles.barValue}>{Math.round((a.probabilities[p] ?? 0) * 100)}%</Text>
        </View>
      ))}
      {ridge ? (
        <Text style={styles.guideline} testID="acral-guideline">
          On palms and soles, a parallel ridge pattern is a recognised reason for prompt dermatologist
          review (Saida et al., 2004). Consider asking for a review.
        </Text>
      ) : null}
      <Muted>
        Compares the pigment map with the skin ridges found by the unmixing. On held-out simulated
        acral lesions it answered {Math.round(a.held_out_coverage * 100)}% of the time and was right
        on {Math.round(a.held_out_accuracy_when_answered * 100)}% of those; it abstains on faint
        patterns. Trained on {a.trained_on}; not validated on real skin.
      </Muted>
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
  acral: { fontSize: 18, fontWeight: '800', color: colors.text },
  agreement: { fontSize: 14, fontWeight: '700', color: colors.accent },
  guideline: { fontSize: 14, fontWeight: '600', color: colors.danger },
  driver: { fontSize: 14, color: colors.text, flex: 1 },
  driverEffect: { fontSize: 13, fontWeight: '700' },
});
