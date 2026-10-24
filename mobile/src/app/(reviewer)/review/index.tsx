import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { Image, StyleSheet } from 'react-native';

import { api, type CaseSummary } from '@/api/client';
import { absoluteUrl } from '@/api/config';
import { Empty, ErrorBanner, Heading, ListItem, Loading, Muted, Pill, Row, Screen } from '@/ui/components';
import { ACTION_LABELS, formatDateTime, siteLabel, STATUS_LABELS, statusTone } from '@/ui/labels';
import { radius } from '@/ui/theme';

const POLL_MS = 5_000;

function CaseRow({ item, onOpen }: { item: CaseSummary; onOpen: () => void }) {
  return (
    <ListItem
      title={`${item.patient.code} · ${siteLabel(item.lesion)} · Fitzpatrick ${item.patient.fitzpatrick}`}
      subtitle={`${item.requested_by} · ${formatDateTime(item.created_at)}${
        item.review_action ? ` · ${ACTION_LABELS[item.review_action]}` : ''
      }`}
      right={
        <Row>
          {item.thumbnail_url ? (
            <Image source={{ uri: absoluteUrl(item.thumbnail_url) }} style={styles.thumb} />
          ) : null}
          <Pill label={STATUS_LABELS[item.status]} tone={statusTone(item.status)} />
        </Row>
      }
      onPress={onOpen}
      testID={`queue-case-${item.id}`}
    />
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
  const openCase = (id: string) => router.push({ pathname: '/review/[caseId]', params: { caseId: id } });

  return (
    <Screen wide testID="queue-screen">
      <Stack.Screen options={{ title: 'Review queue' }} />
      <Muted>Cases sent by clinicians for a second look. Updates every 5 seconds.</Muted>
      <ErrorBanner error={open.error} />
      {open.isPending ? <Loading /> : null}
      {open.data?.length === 0 ? <Empty>No cases waiting. New cases appear here automatically.</Empty> : null}
      {open.data?.map((c) => <CaseRow key={c.id} item={c} onOpen={() => openCase(c.id)} />)}
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
});
