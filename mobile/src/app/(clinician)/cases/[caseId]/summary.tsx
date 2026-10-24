import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { absoluteUrl } from '@/api/config';
import { Button, ErrorBanner, Loading, Muted, Row, Screen } from '@/ui/components';
import { SIMULATION_FOOTNOTE } from '@/ui/clinical';
import { formatSize } from '@/ui/analysis';
import {
  ACTION_LABELS,
  FLAG_LABELS,
  formatArea,
  formatDate,
  formatDateTime,
  isAcral,
  siteLabel,
  visitDay,
} from '@/ui/labels';
import { HISTO_LABELS, OUTCOME_LABELS } from '@/ui/outcome';
import { patternSummary } from '@/ui/triage';
import { usePrintStyles } from '@/ui/printStyles';
import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, spacing } from '@/ui/theme';

const VIEWS = ['standard', 'pigment', 'vascular', 'evidence'] as const;

export default function ReferralSummary() {
  usePrintStyles();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const query = useQuery({ queryKey: ['case', caseId], queryFn: () => api.case(caseId) });
  const c = query.data;
  const reviewed = c?.captures[c.captures.length - 1];
  const visits = c?.lesion_history ?? [];
  const first = visits[0];

  return (
    <Screen testID="summary-screen">
      <Stack.Screen options={{ title: 'Referral summary', headerShown: false }} />
      <ErrorBanner error={query.error} />
      {query.isPending ? <Loading /> : null}
      {c && !c.review ? <Muted>The summary is available once the dermatologist has answered.</Muted> : null}
      {c?.review && reviewed ? (
        <>
          <View testID="print-hide">
            <Row>
              {Platform.OS === 'web' ? (
                <Button label="Print / Save as PDF" onPress={() => window.print()} testID="print" />
              ) : null}
              <Button label="Back" variant="secondary" onPress={() => router.back()} />
            </Row>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>SpektroSkin referral summary</Text>
            <Muted>Research prototype · generated {formatDateTime(new Date().toISOString())}</Muted>
            <SimulatedBadge label="Optical module and images simulated" />
          </View>

          <Section title="Patient and lesion">
            <Line label="Patient code" value={c.patient.code} />
            <Line
              label="Age / sex / Fitzpatrick"
              value={`${c.patient.age} · ${c.patient.sex === 'female' ? 'Female' : 'Male'} · ${c.patient.fitzpatrick}`}
            />
            <Line label="Site" value={siteLabel(c.lesion)} />
            <Line label="Requested by" value={`${c.requested_by}, ${formatDateTime(c.created_at)}`} />
          </Section>

          <Section title="Question">
            <Text style={styles.body}>{c.question}</Text>
          </Section>

          <Section title="Dermatologist recommendation">
            <Text style={styles.action} testID="summary-action">
              {ACTION_LABELS[c.review.action]}
              {c.review.follow_up_days != null ? ` · follow up in ${c.review.follow_up_days} days` : ''}
            </Text>
            <Text style={styles.body}>{c.review.impression}</Text>
            {c.review.notes ? <Text style={styles.body}>Notes: {c.review.notes}</Text> : null}
            <Muted>
              {c.review.reviewer_name} · {formatDateTime(c.review.created_at)}
            </Muted>
            <Text style={styles.bold}>The dermatologist recommends; the treating clinician decides.</Text>
          </Section>

          {c.outcome ? (
            <Section title="Outcome">
              <Line label="Action taken" value={OUTCOME_LABELS[c.outcome.action_taken]} />
              {c.outcome.procedure_date ? <Line label="Date" value={formatDate(c.outcome.procedure_date)} /> : null}
              {c.outcome.histopathology ? (
                <Line label="Histopathology" value={HISTO_LABELS[c.outcome.histopathology]} />
              ) : null}
              {c.outcome.histopathology_notes ? (
                <Text style={styles.body}>Report: {c.outcome.histopathology_notes}</Text>
              ) : null}
            </Section>
          ) : null}

          <Section title="Automated measurements (reviewed capture)">
            <Line label="Area · size" value={`${formatArea(reviewed.area_mm2)}${formatSize(reviewed) ? ` · ${formatSize(reviewed)}` : ''}`} />
            {reviewed.morphology ? (
              <>
                <Line label="Asymmetry (0 = symmetric)" value={reviewed.morphology.asymmetry.toFixed(2)} />
                <Line label="Border irregularity (1 = circle)" value={reviewed.morphology.border_irregularity.toFixed(2)} />
                <Line
                  label="Pigment variation"
                  value={reviewed.morphology.pigment_variation != null ? reviewed.morphology.pigment_variation.toFixed(2) : 'Not pigmented'}
                />
              </>
            ) : null}
            {c.attention_flags.length ? (
              <Line label="Attention flags" value={c.attention_flags.map((f) => FLAG_LABELS[f].label).join(', ')} />
            ) : null}
          </Section>

          {reviewed.triage_model || reviewed.acral_model ? (
            <Section title="AI suggestions (research mode, simulated training data)">
              {reviewed.triage_model ? (
                <Line label="Lesion pattern" value={patternSummary(reviewed.triage_model)} />
              ) : null}
              {reviewed.acral_model && isAcral(c.lesion.body_site) ? (
                <Line
                  label="Acral pattern"
                  value={
                    reviewed.acral_model.pattern
                      ? `Pigment along the ${reviewed.acral_model.pattern === 'ridge' ? 'ridges' : 'furrows'}`
                      : 'Uncertain'
                  }
                />
              ) : null}
              {c.review.pattern_read ? <Line label="Dermatologist's pattern read" value={c.review.pattern_read} /> : null}
              <Muted>Not a diagnosis. Models trained and tested on simulated data only.</Muted>
            </Section>
          ) : null}

          {first && first.id !== reviewed.id ? (
            <Section title="First visit vs reviewed visit">
              <View style={styles.views}>
                {[first, reviewed].map((v) => (
                  <View key={v.id} style={styles.viewCell}>
                    <Image source={{ uri: absoluteUrl(v.views.standard) }} style={styles.image} />
                    <Muted>
                      Day {String(visitDay(v.captured_at, first.captured_at)).padStart(2, '0')} ·{' '}
                      {formatArea(v.area_mm2)}
                    </Muted>
                  </View>
                ))}
              </View>
              {first.area_mm2 && reviewed.area_mm2 ? (
                <Text style={styles.bold}>
                  Area change: {reviewed.area_mm2 >= first.area_mm2 ? '+' : ''}
                  {(((reviewed.area_mm2 - first.area_mm2) / first.area_mm2) * 100).toFixed(0)}% (
                  {formatArea(first.area_mm2)} → {formatArea(reviewed.area_mm2)})
                </Text>
              ) : null}
            </Section>
          ) : null}

          <Section title="Visits (automated area measurement)">
            {visits.map((v) => (
              <Line
                key={v.id}
                label={`Day ${String(visitDay(v.captured_at, first.captured_at)).padStart(2, '0')} · ${formatDate(v.captured_at)}`}
                value={formatArea(v.area_mm2)}
              />
            ))}
          </Section>

          <Section title={`Reviewed capture · ${formatDateTime(reviewed.captured_at)}`}>
            <View style={styles.views}>
              {VIEWS.filter((name) => reviewed.views[name]).map((name) => (
                <View key={name} style={styles.viewCell}>
                  <Image source={{ uri: absoluteUrl(reviewed.views[name]) }} style={styles.image} />
                  <Muted>{name[0].toUpperCase() + name.slice(1)} (simulated)</Muted>
                </View>
              ))}
            </View>
          </Section>

          <Muted style={{ fontStyle: 'italic' }}>{SIMULATION_FOOTNOTE}</Muted>
        </>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, borderBottomWidth: 2, borderBottomColor: colors.text, paddingBottom: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  section: { gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  body: { fontSize: 15, color: colors.text },
  bold: { fontSize: 13, color: colors.text, fontWeight: '600' },
  action: { fontSize: 20, fontWeight: '700', color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  label: { fontSize: 14, color: colors.textMuted },
  value: { fontSize: 14, color: colors.text, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  views: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  viewCell: { flexBasis: 160, flexGrow: 1, gap: 2 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: colors.surface },
});
