import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Capture } from '@/api/client';

import { Card, Heading, Muted, Row } from './components';
import { formatArea, visitDay } from './labels';
import { patternSummary } from './triage';
import { colors, radius, spacing } from './theme';

export function areaChange(first: Capture | undefined, current: Capture) {
  if (!first || first.id === current.id || !first.area_mm2 || !current.area_mm2) return null;
  return {
    percent: ((current.area_mm2 - first.area_mm2) / first.area_mm2) * 100,
    days: visitDay(current.captured_at, first.captured_at) - 1,
    from: first.area_mm2,
    to: current.area_mm2,
  };
}

export function formatSize(c: Pick<Capture, 'diameter_mm' | 'width_mm'>): string | null {
  return c.diameter_mm && c.width_mm ? `${c.diameter_mm.toFixed(1)} × ${c.width_mm.toFixed(1)} mm` : null;
}

/** The numbers a clinician reads first: area, size, change since the first visit. */
export function MeasurementSummary({ capture, visits }: { capture: Capture; visits: Capture[] }) {
  const first = visits.find((v) => v.status === 'processed');
  const change = areaChange(first, capture);
  const size = formatSize(capture);
  return (
    <Card testID="measurement-summary">
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Text style={styles.big} testID="lesion-area">
            {formatArea(capture.area_mm2)}
          </Text>
          <Muted>Area inside the outline</Muted>
        </View>
        {size ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.medium} testID="lesion-size">
              {size}
            </Text>
            <Muted>Longest diameter × width</Muted>
          </View>
        ) : null}
      </Row>
      {change ? (
        <View style={[styles.change, change.percent > 10 ? styles.changeUp : styles.changeFlat]}>
          <Text style={styles.changeText} testID="summary-change">
            {change.percent >= 0 ? '+' : ''}
            {change.percent.toFixed(0)}% area in {change.days} days ({formatArea(change.from)} →{' '}
            {formatArea(change.to)})
          </Text>
        </View>
      ) : (
        <Muted>First visit of this lesion: capture again at follow-up to measure change.</Muted>
      )}
    </Card>
  );
}

type Step = { title: string; result: string; how: string; active: boolean; testID?: string };

function StepRow({ step }: { step: Step }) {
  return (
    <View style={styles.step} testID={step.testID}>
      <View style={[styles.check, step.active ? styles.checkOn : styles.checkOff]}>
        <Text style={styles.checkMark}>{step.active ? '✓' : '–'}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.stepTitle, !step.active && { color: colors.textMuted }]}>{step.title}</Text>
        <Text style={[styles.stepResult, !step.active && { color: colors.textMuted }]}>{step.result}</Text>
        <Muted>{step.how}</Muted>
      </View>
    </View>
  );
}

const QUALITY_LABEL = { good: 'good image', blurry: 'blurry', glare: 'glare' } as const;

export function qualityStep(q: NonNullable<Capture['quality_model']>, rulesPassed: boolean): Step {
  const agrees = (q.label === 'good') === rulesPassed;
  const confidence = Math.round((q.probabilities[q.label] ?? 0) * 100);
  return {
    title: 'Learned quality model (second opinion)',
    result: `Looks ${QUALITY_LABEL[q.label]} (${confidence}%) · ${agrees ? 'agrees with the rules' : 'disagrees with the rules: check the image'}`,
    how: `Small classifier trained on simulated captures only; ${Math.round(q.held_out_accuracy * 100)}% accurate on held-out simulated captures. Advisory: the rules decide. Judges image quality, never the lesion.`,
    active: true,
    testID: 'quality-model',
  };
}

/**
 * What the software did automatically for this capture, each step with how it works and its
 * limits. Assistance only: it measures and checks images; people interpret them.
 */
export function AutomatedAnalysis({ capture, visits }: { capture: Capture; visits: Capture[] }) {
  const router = useRouter();
  const first = visits.find((v) => v.status === 'processed');
  const change = areaChange(first, capture);
  const m = capture.qc.metrics;
  const steps: Step[] = [
    {
      title: 'Image quality check',
      result: capture.qc.passed
        ? `Passed: sharp, ${((m.saturated_fraction ?? 0) * 100).toFixed(1)}% glare, reference patches found`
        : `Failed: ${capture.qc.guidance[0] ?? 'retake needed'}`,
      how: 'Rule-based: focus, saturated pixels, gray patch ratio. Cannot judge clinical relevance.',
      active: true,
    },
    ...(capture.quality_model ? [qualityStep(capture.quality_model, capture.qc.passed)] : []),
    {
      title: 'Lesion outline and size',
      result: capture.area_mm2
        ? `${formatArea(capture.area_mm2)}${formatSize(capture) ? ` · ${formatSize(capture)}` : ''}`
        : 'Not measured',
      how: 'Classical thresholding of the pigment and blood maps. The edge can be off by a few percent; check the outline.',
      active: !!capture.area_mm2,
    },
    {
      title: 'Change since the first visit',
      result: change
        ? `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(0)}% area over ${change.days} days`
        : 'Needs at least two visits',
      how: 'Compares automated areas across visits of the same lesion. Same device and spacer assumed.',
      active: !!change,
    },
    {
      title: 'Pigment and blood maps',
      result: capture.spectral_signature
        ? `Melanin ${capture.spectral_signature.melanin.lesion.toFixed(1)} vs skin ${capture.spectral_signature.melanin.skin.toFixed(1)}`
        : 'Computed from four LED bands',
      how: 'Physics-based unmixing of four bands (simplified optical model), not a learned model.',
      active: capture.status === 'processed',
    },
    ...(capture.triage_model
      ? [
          {
            title: 'Lesion pattern (triage support, research mode)',
            result: patternSummary(capture.triage_model),
            how: 'Small model trained on simulated lesions only. Describes the dominant pigment or blood pattern; not validated on real skin.',
            active: true,
            testID: 'triage-row',
          },
        ]
      : []),
  ];
  return (
    <Card testID="automated-analysis">
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading>Automated analysis</Heading>
        <View style={styles.assist}>
          <Text style={styles.assistText}>Assistance, not diagnosis</Text>
        </View>
      </Row>
      {steps.map((s) => (
        <StepRow key={s.title} step={s} />
      ))}
      <StepRow
        step={{
          title: 'Benign or malignant assessment',
          result: 'Not active',
          how: 'Needs real, consented, histopathology-labelled captures and ethics approval. Never estimated from simulated data.',
          active: false,
          testID: 'triage-not-active',
        }}
      />
      <Pressable onPress={() => router.push('/ai-roadmap')} testID="open-ai-roadmap">
        <Text style={styles.link}>How AI is planned, step by step →</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 30, fontWeight: '800', color: colors.text },
  medium: { fontSize: 20, fontWeight: '700', color: colors.text },
  change: { borderRadius: radius.md, padding: spacing.sm },
  changeUp: { backgroundColor: '#FEF3C7' },
  changeFlat: { backgroundColor: colors.surface },
  changeText: { fontSize: 15, fontWeight: '700', color: colors.text },
  assist: { backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  assistText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkOn: { backgroundColor: colors.successSoft },
  checkOff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  checkMark: { fontSize: 13, fontWeight: '800', color: colors.success },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  stepResult: { fontSize: 14, color: colors.text },
  link: { color: colors.accent, fontWeight: '600', paddingVertical: spacing.xs },
});
