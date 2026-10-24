import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BodySite, Capture } from '@/api/client';

import { Card, Heading, Muted, Row } from './components';
import { formatArea, isAcral, visitDay } from './labels';
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

const QUALITY_LABEL = { good: 'good image', blurry: 'blurry', glare: 'glare', noisy: 'noisy' } as const;

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
export function AutomatedAnalysis({
  capture,
  visits,
  site,
}: {
  capture: Capture;
  visits: Capture[];
  site?: BodySite;
}) {
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
      how: 'Rule-based: focus, saturated pixels, sensor noise, gray patch ratio. Cannot judge clinical relevance.',
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
    ...(capture.acral_model && site && isAcral(site)
      ? [
          {
            title: 'Acral pattern (research mode)',
            result: capture.acral_model.pattern
              ? `Pigment along the ${capture.acral_model.pattern === 'ridge' ? 'ridges' : 'furrows'}`
              : 'Uncertain: pattern too faint',
            how: 'Pigment map compared with the skin ridges. Trained on simulated acral lesions only.',
            active: true,
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
  morphRow: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  morphValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  morphChange: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textAlign: 'right' },
});

type MorphologyRow = { label: string; value: string; change?: string; how: string; testID: string };

/**
 * Dermoscopy-style criteria measured on the outline (asymmetry, border, colour, diameter,
 * evolution). Each value stands alone: no combined score, the dermatologist interprets.
 */
export function MorphologyCard({ capture, visits }: { capture: Capture; visits: Capture[] }) {
  const m = capture.morphology;
  if (!m) return null;
  const first = visits.find((v) => v.status === 'processed');
  const firstM = first && first.id !== capture.id ? first.morphology : null;
  const change = areaChange(first, capture);
  const delta = (now: number, then?: number | null) =>
    then != null ? `${now - then >= 0 ? '+' : ''}${(now - then).toFixed(2)} since Day 01` : undefined;
  const rows: MorphologyRow[] = [
    {
      label: 'Asymmetry',
      value: m.asymmetry.toFixed(2),
      change: delta(m.asymmetry, firstM?.asymmetry),
      how: 'Share of the outline that does not overlap its mirror image (0 = symmetric).',
      testID: 'morph-asymmetry',
    },
    {
      label: 'Border irregularity',
      value: m.border_irregularity.toFixed(2),
      change: delta(m.border_irregularity, firstM?.border_irregularity),
      how: 'Perimeter² ÷ (4π × area): 1.0 is a circle, higher is more notched.',
      testID: 'morph-border',
    },
    {
      label: 'Pigment variation',
      value: m.pigment_variation != null ? m.pigment_variation.toFixed(2) : 'Not pigmented',
      how: 'How uneven the melanin is inside the outline (from the pigment map).',
      testID: 'morph-pigment',
    },
    {
      label: 'Blood-spot focality',
      value: m.vessel_focality.toFixed(2),
      how: 'Brightest blood spots vs the typical level (from the blood map): dots and vessels raise it.',
      testID: 'morph-vessels',
    },
    {
      label: 'Diameter',
      value: formatSize(capture) ?? '–',
      how: 'Longest diameter × width of the outline.',
      testID: 'morph-diameter',
    },
    {
      label: 'Evolution',
      value: change ? `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(0)}% area in ${change.days} days` : 'First visit',
      change: capture.change_since_first
        ? `${capture.change_since_first.new_area_mm2.toFixed(1)} mm² new · ${capture.change_since_first.no_longer_covered_mm2.toFixed(1)} mm² receded`
        : undefined,
      how: 'Area change across visits; new and receded area from the registered outlines (see the Change view).',
      testID: 'morph-evolution',
    },
  ];
  return (
    <Card testID="morphology">
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading>Dermoscopy-style measurements</Heading>
        <View style={styles.assist}>
          <Text style={styles.assistText}>Automated · no score</Text>
        </View>
      </Row>
      {rows.map((r) => (
        <View key={r.label} style={styles.morphRow} testID={r.testID}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <Text style={styles.stepTitle}>{r.label}</Text>
            <Text style={styles.morphValue}>{r.value}</Text>
          </Row>
          {r.change ? <Text style={styles.morphChange}>{r.change}</Text> : null}
          <Muted>{r.how}</Muted>
        </View>
      ))}
      <Muted>
        Asymmetry, border, colour, diameter and evolution, measured on the automated outline of a
        simulated capture. Each is shown on its own, never added up into a risk score: the
        dermatologist interprets them.
      </Muted>
    </Card>
  );
}
