import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Empty, ErrorBanner, ListItem, Loading, Pill, Screen } from '@/ui/components';
import { ACTION_LABELS, STATUS_LABELS, siteLabel, statusTone } from '@/ui/labels';

const POLL_MS = 3_000;

export default function MyCases() {
  const router = useRouter();
  const cases = useQuery({ queryKey: ['cases', 'mine'], queryFn: () => api.cases(), refetchInterval: POLL_MS });

  return (
    <Screen testID="my-cases-screen">
      <Stack.Screen options={{ title: 'My cases' }} />
      <ErrorBanner error={cases.error} />
      {cases.isPending ? <Loading /> : null}
      {cases.data?.length === 0 ? <Empty>No cases submitted yet.</Empty> : null}
      {cases.data?.map((c) => (
        <ListItem
          key={c.id}
          title={`${c.patient.code} · ${siteLabel(c.lesion)}`}
          subtitle={
            c.review_action
              ? `Recommendation: ${ACTION_LABELS[c.review_action]}`
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
