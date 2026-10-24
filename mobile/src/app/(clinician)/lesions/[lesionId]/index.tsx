import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { api } from '@/api/client';
import { useSync } from '@/sync/SyncProvider';
import { Footnote, HistoryStrip, SpectralViews, VisitCompare } from '@/ui/clinical';
import { AreaTrend } from '@/ui/analysis';
import { Button, Card, Empty, ErrorBanner, Loading, Muted, Row, Screen, Title } from '@/ui/components';
import { formatArea, formatDate, patientLabel, siteLabel, visitDay } from '@/ui/labels';

export default function LesionScreen() {
  const { lesionId } = useLocalSearchParams<{ lesionId: string }>();
  const router = useRouter();
  const lesion = useQuery({ queryKey: ['lesion', lesionId], queryFn: () => api.lesion(lesionId) });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { pending, syncNow } = useSync();
  const l = lesion.data;
  const visits = l?.captures.filter((c) => c.status === 'processed') ?? [];
  const failed = (l?.captures.length ?? 0) - visits.length;
  const selected = visits.find((c) => c.id === selectedId) ?? visits[visits.length - 1];
  const waiting = pending.filter((p) => p.lesionId === lesionId);
  const rejected = waiting.filter((p) => p.failedReason);
  const newCapture = () => router.push({ pathname: '/lesions/[lesionId]/capture', params: { lesionId } });

  return (
    <Screen testID="lesion-screen" onRefresh={() => Promise.all([lesion.refetch(), syncNow()])}>
      <Stack.Screen options={{ title: l ? siteLabel(l) : 'Lesion' }} />
      <ErrorBanner error={lesion.error} />
      {lesion.isPending ? <Loading /> : null}
      {l ? (
        <>
          <Card>
            <Title>{siteLabel(l)}</Title>
            <Muted>
              {patientLabel(l.patient)} · {visits.length} visit{visits.length === 1 ? '' : 's'}
            </Muted>
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
          <Button label="New capture" onPress={newCapture} testID="new-capture" />
          {selected ? (
            <>
              <HistoryStrip captures={l.captures} currentId={selected.id} onSelect={(c) => setSelectedId(c.id)} />
              <SpectralViews
                key={selected.id}
                capture={selected}
                caption={`Day ${String(visitDay(selected.captured_at, visits[0].captured_at)).padStart(2, '0')} · ${formatDate(selected.captured_at)} · ${formatArea(selected.area_mm2)}`}
              />
              <Row>
                <Button
                  label="Open this visit"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/captures/[captureId]', params: { captureId: selected.id } })}
                  testID="open-visit"
                />
              </Row>
              <VisitCompare captures={l.captures} selectedId={selected.id} />
              <AreaTrend visits={l.captures} />
              <Footnote />
            </>
          ) : (
            <Empty>No processed captures yet. Tap "New capture" to take the first one.</Empty>
          )}
          {failed ? <Muted>{failed} capture(s) failed the quality check and are not shown.</Muted> : null}
        </>
      ) : null}
    </Screen>
  );
}
