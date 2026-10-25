import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Button, ErrorBanner, Loading, Muted, Screen, SectionLabel } from '@/ui/components';
import { Footnote, HistoryStrip, QCCard, SpectralViews, ValidationPanel, VisitCompare } from '@/ui/clinical';
import { AutomatedAnalysis, MeasurementSummary, MorphologyCard } from '@/ui/analysis';
import { AcralPattern, AiGlance, RunAiBanner, TriageSupport } from '@/ui/triage';
import { ChecklistCard } from '@/ui/checklists';
import { QualityDetails, SpectralSignature } from '@/ui/measurement';
import { formatArea, formatDateTime, patientLabel, siteLabel, visitDay } from '@/ui/labels';
import { colors, radius, spacing } from '@/ui/theme';

export default function Results() {
  const { captureId } = useLocalSearchParams<{ captureId: string }>();
  const router = useRouter();
  const capture = useQuery({ queryKey: ['capture', captureId], queryFn: () => api.capture(captureId) });
  const lesionId = capture.data?.lesion_id;
  const lesion = useQuery({
    queryKey: ['lesion', lesionId],
    queryFn: () => api.lesion(lesionId!),
    enabled: !!lesionId,
  });
  const c = capture.data;
  const firstVisit = lesion.data?.captures.find((v) => v.status === 'processed');
  const day = c && firstVisit && c.qc.passed ? visitDay(c.captured_at, firstVisit.captured_at) : null;
  const [technical, setTechnical] = useState(false);
  const qc = c ? (
    <QCCard
      capture={c}
      onRetake={() => router.replace({ pathname: '/lesions/[lesionId]/capture', params: { lesionId: c.lesion_id } })}
    />
  ) : null;
  const submit = () =>
    c && router.push({ pathname: '/captures/[captureId]/submit', params: { captureId: c.id } });

  return (
    <Screen
      testID="results-screen"
      footer={
        c?.qc.passed ? (
          <Button label="Submit for dermatologist review" onPress={submit} testID="submit-for-review" />
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: day ? `Results · Day ${String(day).padStart(2, '0')}` : 'Results' }} />
      <ErrorBanner error={capture.error ?? lesion.error} />
      {capture.isPending ? <Loading /> : null}
      {c ? (
        <>
          {lesion.data ? (
            <Muted>
              {patientLabel(lesion.data.patient)} · {siteLabel(lesion.data)} · {formatDateTime(c.captured_at)}
            </Muted>
          ) : null}
          {c.qc.passed ? null : qc}
          {c.qc.passed ? (
            <>
              <RunAiBanner capture={c} />
              <SpectralViews capture={c} />
              <MeasurementSummary capture={c} visits={lesion.data?.captures ?? []} />
              <AiGlance capture={c} site={lesion.data?.body_site} />

              <SectionLabel>WHY · THE EVIDENCE BEHIND EACH STEP</SectionLabel>
              {qc}
              <TriageSupport capture={c} />
              {lesion.data ? <AcralPattern capture={c} site={lesion.data.body_site} /> : null}
              {lesion.data ? <ChecklistCard capture={c} site={lesion.data.body_site} /> : null}
              <MorphologyCard capture={c} visits={lesion.data?.captures ?? []} />
              <AutomatedAnalysis capture={c} visits={lesion.data?.captures ?? []} site={lesion.data?.body_site} />

              <SectionLabel>THIS LESION OVER TIME</SectionLabel>
              {lesion.data ? (
                <HistoryStrip
                  captures={lesion.data.captures}
                  currentId={c.id}
                  onSelect={(v) =>
                    v.id !== c.id &&
                    router.push({ pathname: '/captures/[captureId]', params: { captureId: v.id } })
                  }
                />
              ) : null}
              {lesion.data ? <VisitCompare captures={lesion.data.captures} selectedId={c.id} /> : null}
              <Pressable
                onPress={() => setTechnical((v) => !v)}
                accessibilityRole="button"
                style={styles.technicalToggle}
                testID="toggle-technical"
              >
                <Text style={styles.technicalText}>
                  {technical ? 'Hide technical details' : 'Technical details: spectral signature, quality metrics, validation'}
                </Text>
              </Pressable>
              {technical ? (
                <>
                  <SpectralSignature capture={c} />
                  <QualityDetails capture={c} />
                  <ValidationPanel capture={c} />
                </>
              ) : null}
            </>
          ) : (
            <SpectralViews capture={c} />
          )}
          <Footnote />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  technicalToggle: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  technicalText: { color: colors.accent, fontWeight: '600', textAlign: 'center' },
});
