import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { api, type CaseSummary } from '@/api/client';
import { absoluteUrl } from '@/api/config';
import { Empty, ErrorBanner, Heading, ListItem, Loading, Muted, Pill, Row, Screen } from '@/ui/components';
import { ACTION_LABELS, duration, formatDateTime, siteLabel, STATUS_LABELS, statusTone } from '@/ui/labels';
import { radius } from '@/ui/theme';

const POLL_MS = 2_000;
const NEW_HIGHLIGHT_MS = 60_000;

function CaseRow({ item, onOpen, fresh }: { item: CaseSummary; onOpen: () => void; fresh?: boolean }) {
  return (
    <View style={fresh ? styles.fresh : undefined}>
    <ListItem
      title={`${item.patient.code} · ${siteLabel(item.lesion)} · Fitzpatrick ${item.patient.fitzpatrick}`}
      subtitle={`${item.requested_by} · ${
        item.answered_at
          ? `answered in ${duration(item.created_at, item.answered_at)}`
          : `waiting ${duration(item.created_at)}`
      }${item.review_action ? ` · ${ACTION_LABELS[item.review_action]}` : ''} · ${formatDateTime(item.created_at)}`}
      right={
        <Row>
          {fresh ? <Pill label="New" tone="danger" /> : null}
          {item.thumbnail_url ? (
            <Image source={{ uri: absoluteUrl(item.thumbnail_url) }} style={styles.thumb} />
          ) : null}
          <Pill label={STATUS_LABELS[item.status]} tone={statusTone(item.status)} />
        </Row>
      }
      onPress={onOpen}
      testID={`queue-case-${item.id}`}
    />
    </View>
  );
}

export default function Queue() {
  const router = useRouter();
  const open = useQuery({
    queryKey: ['queue'],
    queryFn: () => api.cases(['submitted', 'in_review']),
    refetchInterval: POLL_MS,
  });
  const answered = useQuery({
    queryKey: ['answered'],
    queryFn: () => api.cases(['answered']),
    refetchInterval: POLL_MS * 6,
  });
  // Cases that appear after the queue first loaded are highlighted for a minute.
  const known = useRef<Set<string> | null>(null);
  const [arrivals, setArrivals] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open.data) return;
    const ids = open.data.map((c) => c.id);
    if (known.current) {
      const now = Date.now();
      const fresh = ids.filter((id) => !known.current!.has(id));
      if (fresh.length) setArrivals((a) => ({ ...a, ...Object.fromEntries(fresh.map((id) => [id, now])) }));
    }
    known.current = new Set(ids);
  }, [open.data]);
  const isFresh = (id: string) => (arrivals[id] ?? 0) > Date.now() - NEW_HIGHLIGHT_MS;
  const openCase = (id: string) => router.push({ pathname: '/review/[caseId]', params: { caseId: id } });

  return (
    <Screen wide testID="queue-screen" onRefresh={() => Promise.all([open.refetch(), answered.refetch()])}>
      <Stack.Screen options={{ title: 'Review queue' }} />
      <Muted>Cases sent by clinicians for a second look. Updates automatically.</Muted>
      <ErrorBanner error={open.error} />
      {open.isPending ? <Loading /> : null}
      {open.data?.length === 0 ? <Empty>No cases waiting. New cases appear here automatically.</Empty> : null}
      {open.data?.map((c) => (
        <CaseRow key={c.id} item={c} fresh={isFresh(c.id)} onOpen={() => openCase(c.id)} />
      ))}
      {answered.data?.length ? (
        <>
          <Heading>Recently answered</Heading>
          {answered.data.slice(0, 10).map((c) => (
            <CaseRow key={c.id} item={c} onOpen={() => openCase(c.id)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  fresh: { backgroundColor: '#FEF2F2', borderLeftWidth: 4, borderLeftColor: '#DC2626', borderRadius: radius.sm },
});
