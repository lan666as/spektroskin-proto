import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { api } from '@/api/client';
import { Chips, Empty, ErrorBanner, ListItem, Loading, Pill, Screen } from '@/ui/components';
import { ACTION_LABELS, duration, STATUS_LABELS, siteLabel, statusTone } from '@/ui/labels';

const POLL_MS = 3_000;

export default function MyCases() {
  const router = useRouter();
  const cases = useQuery({ queryKey: ['cases', 'mine'], queryFn: () => api.cases(), refetchInterval: POLL_MS });
  const [filter, setFilter] = useState<'all' | 'waiting' | 'answered'>('all');
  const all = cases.data ?? [];
  const waitingCount = all.filter((c) => c.status !== 'answered').length;
  const shown = all.filter(
    (c) => filter === 'all' || (filter === 'answered' ? c.status === 'answered' : c.status !== 'answered'),
  );

  return (
    <Screen testID="my-cases-screen" onRefresh={() => cases.refetch()}>
      <Stack.Screen options={{ title: 'My cases' }} />
      <ErrorBanner error={cases.error} />
      {cases.isPending ? <Loading /> : null}
      <Chips
        options={[
          { value: 'all', label: `All (${all.length})` },
          { value: 'waiting', label: `Waiting (${waitingCount})` },
          { value: 'answered', label: `Answered (${all.length - waitingCount})` },
        ]}
        value={filter}
        onChange={setFilter}
        testIDPrefix="cases-filter"
      />
      {cases.data && shown.length === 0 ? (
        <Empty>{all.length ? 'Nothing in this list.' : 'No cases submitted yet.'}</Empty>
      ) : null}
      {shown.map((c) => (
        <ListItem
          key={c.id}
          title={`${c.patient.code} · ${siteLabel(c.lesion)}`}
          subtitle={
            c.review_action
              ? `Recommendation: ${ACTION_LABELS[c.review_action]} · answered in ${duration(c.created_at, c.answered_at)}`
              : c.question.length > 80
                ? `${c.question.slice(0, 80)}…`
                : c.question
          }
          right={<Pill label={STATUS_LABELS[c.status]} tone={statusTone(c.status)} />}
          onPress={() => router.push({ pathname: '/cases/[caseId]', params: { caseId: c.id } })}
          testID={`case-${c.id}`}
        />
      ))}
    </Screen>
  );
}
