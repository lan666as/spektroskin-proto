import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Button, Card, ErrorBanner, Heading, Loading, Muted, Pill, Row, Screen } from '@/ui/components';
import { Footnote, HistoryStrip, Recommendation, SpectralViews } from '@/ui/clinical';
import { formatDateTime, patientLabel, siteLabel, STATUS_LABELS, statusTone } from '@/ui/labels';

const POLL_MS = 5_000;

export default function ClinicianCase() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api.case(caseId),
    refetchInterval: (q) => (q.state.data?.status === 'answered' ? false : POLL_MS),
  });
  const c = query.data;
  const latest = c?.captures[c.captures.length - 1];

  return (
    <Screen testID="clinician-case-screen">
      <Stack.Screen options={{ title: c ? `Case · ${c.patient.code}` : 'Case' }} />
      <ErrorBanner error={query.error} />
      {query.isPending ? <Loading /> : null}
      {c ? (
        <>
          {c.review ? (
            <>
              <Recommendation review={c.review} />
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
                <Muted>Waiting for the dermatologist. This page updates automatically.</Muted>
              </Row>
            </Card>
          )}
          <Card>
            <Muted>
              {patientLabel(c.patient)} · {siteLabel(c.lesion)}
            </Muted>
            <Heading>Your question</Heading>
            <Muted style={{ fontSize: 15 }}>{c.question}</Muted>
            <Muted>Submitted {formatDateTime(c.created_at)}</Muted>
          </Card>
          {latest ? <SpectralViews capture={latest} /> : null}
          <HistoryStrip captures={c.lesion_history} currentId={latest?.id} />
          <Footnote />
        </>
      ) : null}
    </Screen>
  );
}
