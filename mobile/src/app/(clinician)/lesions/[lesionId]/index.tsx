import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Button, Card, Empty, ErrorBanner, Loading, Muted, Screen, Title } from '@/ui/components';
import { useSync } from '@/sync/SyncProvider';
import { HistoryStrip } from '@/ui/clinical';
import { patientLabel, siteLabel } from '@/ui/labels';

export default function LesionScreen() {
  const { lesionId } = useLocalSearchParams<{ lesionId: string }>();
  const router = useRouter();
  const lesion = useQuery({ queryKey: ['lesion', lesionId], queryFn: () => api.lesion(lesionId) });
  const l = lesion.data;
  const failed = l?.captures.filter((c) => c.status === 'qc_failed').length ?? 0;
  const { pending, syncNow } = useSync();
  const waiting = pending.filter((p) => p.lesionId === lesionId);
  const rejected = waiting.filter((p) => p.failedReason);

  return (
    <Screen testID="lesion-screen">
      <Stack.Screen options={{ title: l ? siteLabel(l) : 'Lesion' }} />
      <ErrorBanner error={lesion.error} />
      {lesion.isPending ? <Loading /> : null}
      {l ? (
        <>
          <Card>
            <Title>{siteLabel(l)}</Title>
            <Muted>{patientLabel(l.patient)}</Muted>
          </Card>
          {waiting.length > rejected.length ? (
            <Card testID="pending-uploads">
              <Muted>
                {waiting.length - rejected.length} capture(s) saved on this phone, waiting for a
                connection. They upload automatically.
              </Muted>
              <Button label="Try upload now" variant="secondary" onPress={() => void syncNow()} />
            </Card>
          ) : null}
          {rejected.map((p) => (
            <ErrorBanner key={p.frameSet.id} error={new Error(`Upload rejected: ${p.failedReason}`)} />
          ))}
          <Button
            label="New capture"
            onPress={() => router.push({ pathname: '/lesions/[lesionId]/capture', params: { lesionId } })}
            testID="new-capture"
          />
          {l.captures.some((c) => c.status === 'processed') ? (
            <HistoryStrip
              captures={l.captures}
              onSelect={(c) =>
                router.push({ pathname: '/captures/[captureId]', params: { captureId: c.id } })
              }
            />
          ) : (
            <Empty>No processed captures yet.</Empty>
          )}
          {failed ? <Muted>{failed} capture(s) failed the quality check and are not shown.</Muted> : null}
        </>
      ) : null}
    </Screen>
  );
}
