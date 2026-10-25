import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Button, Card, ErrorBanner, Heading, Loading, Muted, Pill, Row, Screen, SectionLabel } from '@/ui/components';
import { CaseTimeline, Footnote, HistoryStrip, Recommendation, SpectralViews, VisitCompare } from '@/ui/clinical';
import { OutcomeCard } from '@/ui/outcome';
import { formatDate, formatDateTime, patientLabel, siteLabel, STATUS_LABELS, statusTone } from '@/ui/labels';
import { colors, radius, spacing } from '@/ui/theme';

const POLL_MS = 2_000;

export default function ClinicianCase() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api.case(caseId),
    refetchInterval: (q) => (q.state.data?.status === 'answered' ? false : POLL_MS),
  });
  const c = query.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reviewed = c?.captures[c.captures.length - 1];
  const latest = c?.lesion_history.find((v) => v.id === selectedId) ?? reviewed;
  // Announce an answer that arrives while this page is open (not one that was already there).
  const seenStatus = useRef<string | null>(null);
  const [justAnswered, setJustAnswered] = useState(false);
  useEffect(() => {
    if (!c) return;
    if (seenStatus.current && seenStatus.current !== 'answered' && c.status === 'answered') {
      setJustAnswered(true);
    }
    seenStatus.current = c.status;
  }, [c]);

  return (
    <Screen testID="clinician-case-screen">
      <Stack.Screen options={{ title: c ? `Case · ${c.patient.code}` : 'Case' }} />
      <ErrorBanner error={query.error} />
      {query.isPending ? <Loading /> : null}
      {c ? (
        <>
          {c.review ? (
            <>
              {justAnswered ? (
                <View style={styles.arrived} testID="recommendation-arrived">
                  <Text style={styles.arrivedText}>Recommendation received just now</Text>
                </View>
              ) : null}
              <Recommendation review={c.review} due={c.follow_up_due} />
              <OutcomeCard c={c} editable />
              {c.review.follow_up_days != null ? (
                <Button
                  label={`Capture follow-up visit${c.follow_up_due ? ` (due ${formatDate(c.follow_up_due)})` : ''}`}
                  onPress={() =>
                    router.push({ pathname: '/lesions/[lesionId]/capture', params: { lesionId: c.lesion.id } })
                  }
                  testID="capture-follow-up"
                />
              ) : null}
              <Button
                label="Referral summary"
                variant="secondary"
                onPress={() => router.push({ pathname: '/cases/[caseId]/summary', params: { caseId } })}
                testID="open-summary"
              />
            </>
          ) : (
            <Card testID="awaiting-review">
              <Row>
                <Pill label={STATUS_LABELS[c.status]} tone={statusTone(c.status)} />
                <ActivityIndicator color={colors.accent} />
                <Muted>Sent. Waiting for the dermatologist; this page updates by itself.</Muted>
              </Row>
            </Card>
          )}
          <SectionLabel>YOUR REQUEST</SectionLabel>
          <Card>
            <Muted>
              {patientLabel(c.patient)} · {siteLabel(c.lesion)}
            </Muted>
            <Heading>Your question</Heading>
            <Muted style={{ fontSize: 15 }}>{c.question}</Muted>
            <Muted>Submitted {formatDateTime(c.created_at)}</Muted>
          </Card>
          <CaseTimeline c={c} />
          <SectionLabel>IMAGES SENT WITH THE CASE</SectionLabel>
          {latest ? <SpectralViews key={latest.id} capture={latest} /> : null}
          <SectionLabel>THIS LESION OVER TIME</SectionLabel>
          <HistoryStrip captures={c.lesion_history} currentId={latest?.id} onSelect={(v) => setSelectedId(v.id)} />
          <VisitCompare captures={c.lesion_history} selectedId={reviewed?.id} />
          <Footnote />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  arrived: { backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md },
  arrivedText: { color: colors.onAccent, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
