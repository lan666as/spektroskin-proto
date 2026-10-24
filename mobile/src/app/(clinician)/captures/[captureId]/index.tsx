import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Button, Card, ErrorBanner, Heading, KeyValue, Loading, Muted, Screen } from '@/ui/components';
import { Footnote, HistoryStrip, QCCard, SpectralViews, ValidationPanel } from '@/ui/clinical';
import { formatArea, formatDateTime, patientLabel, siteLabel } from '@/ui/labels';

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

  return (
    <Screen testID="results-screen">
      <Stack.Screen options={{ title: 'Results' }} />
      <ErrorBanner error={capture.error ?? lesion.error} />
      {capture.isPending ? <Loading /> : null}
      {c ? (
        <>
          {lesion.data ? (
            <Muted>
              {patientLabel(lesion.data.patient)} · {siteLabel(lesion.data)} · {formatDateTime(c.captured_at)}
            </Muted>
          ) : null}
          <QCCard
            capture={c}
            onRetake={() =>
              router.replace({ pathname: '/lesions/[lesionId]/capture', params: { lesionId: c.lesion_id } })
            }
          />
          {c.qc.passed ? (
            <>
              <SpectralViews capture={c} />
              <Card>
                <Heading>Measurement</Heading>
                <KeyValue label="Lesion area (outline)" value={<Muted testID="lesion-area">{formatArea(c.area_mm2)}</Muted>} />
              </Card>
              {lesion.data ? <HistoryStrip captures={lesion.data.captures} currentId={c.id} /> : null}
              <ValidationPanel capture={c} />
              <Button
                label="Submit for dermatologist review"
                onPress={() =>
                  router.push({ pathname: '/captures/[captureId]/submit', params: { captureId: c.id } })
                }
                testID="submit-for-review"
              />
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
