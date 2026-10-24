import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { api, type CaseDetail, type ReviewAction } from '@/api/client';
import {
  Button,
  Card,
  Chips,
  ErrorBanner,
  Field,
  Heading,
  KeyValue,
  Loading,
  Muted,
  Pill,
  Row,
  Screen,
} from '@/ui/components';
import { Footnote, HistoryStrip, Recommendation, SpectralViews, VisitCompare } from '@/ui/clinical';
import { formatArea, formatDateTime, siteLabel, STATUS_LABELS, statusTone } from '@/ui/labels';
import { spacing } from '@/ui/theme';

const ACTIONS = [
  { value: 'observe', label: 'Observe' },
  { value: 'biopsy', label: 'Biopsy' },
  { value: 'refer', label: 'Refer' },
] as const;
const FOLLOW_UP = [
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'none', label: 'None' },
] as const;
type FollowUp = (typeof FOLLOW_UP)[number]['value'];

function ReviewForm({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [impression, setImpression] = useState('');
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [notes, setNotes] = useState('');
  const submit = useMutation({
    mutationFn: () =>
      api.review(caseId, {
        impression: impression.trim(),
        action: action!,
        follow_up_days: followUp && followUp !== 'none' ? Number(followUp) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['review-case', caseId], updated);
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['answered'] });
    },
  });
  return (
    <Card testID="review-form">
      <Heading>Your recommendation</Heading>
      <Field
        label="Impression"
        value={impression}
        onChangeText={setImpression}
        multiline
        maxLength={2000}
        placeholder="What you see and why"
        testID="review-impression"
      />
      <Chips label="Recommended action" options={ACTIONS} value={action} onChange={setAction} testIDPrefix="action" />
      <Chips label="Follow-up" options={FOLLOW_UP} value={followUp} onChange={setFollowUp} testIDPrefix="follow-up" />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={2000} testID="review-notes" />
      <Muted>Your recommendation goes back to the requesting clinician, who makes the decision.</Muted>
      <ErrorBanner error={submit.error} />
      <Button
        label="Send recommendation"
        onPress={() => submit.mutate()}
        disabled={!impression.trim() || !action}
        busy={submit.isPending}
        testID="send-review"
      />
    </Card>
  );
}

function CaseInfo({ c }: { c: CaseDetail }) {
  const latest = c.captures[c.captures.length - 1];
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading>{c.patient.code}</Heading>
        <Pill label={STATUS_LABELS[c.status]} tone={statusTone(c.status)} />
      </Row>
      <KeyValue label="Age / sex" value={`${c.patient.age} · ${c.patient.sex === 'female' ? 'Female' : 'Male'}`} />
      <KeyValue label="Fitzpatrick" value={c.patient.fitzpatrick} />
      <KeyValue label="Research consent" value={c.patient.research_consent ? 'Yes' : 'No'} />
      <KeyValue label="Site" value={siteLabel(c.lesion)} />
      <KeyValue label="Area (latest)" value={formatArea(latest?.area_mm2)} />
      <KeyValue label="Requested by" value={c.requested_by} />
      <KeyValue label="Submitted" value={formatDateTime(c.created_at)} />
      <Heading>Question</Heading>
      <Muted style={{ fontSize: 15 }} testID="case-question-text">
        {c.question}
      </Muted>
    </Card>
  );
}

export default function ReviewCase() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { width } = useWindowDimensions();
  const query = useQuery({ queryKey: ['review-case', caseId], queryFn: () => api.case(caseId) });
  const c = query.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reviewed = c?.captures[c.captures.length - 1];
  const latest = c?.lesion_history.find((v) => v.id === selectedId) ?? reviewed;
  const twoColumns = width >= 960;

  return (
    <Screen wide testID="review-case-screen">
      <Stack.Screen options={{ title: c ? `Review · ${c.patient.code}` : 'Review' }} />
      <ErrorBanner error={query.error} />
      {query.isPending ? <Loading /> : null}
      {c ? (
        <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: spacing.lg, alignItems: 'flex-start' }}>
          <View style={{ flex: twoColumns ? 3 : undefined, width: twoColumns ? undefined : '100%', gap: spacing.lg }}>
            {latest ? <SpectralViews key={latest.id} capture={latest} /> : null}
            <HistoryStrip
              captures={c.lesion_history}
              currentId={latest?.id}
              onSelect={(v) => setSelectedId(v.id)}
            />
            <VisitCompare captures={c.lesion_history} selectedId={reviewed?.id} />
            <Footnote />
          </View>
          <View style={{ flex: twoColumns ? 2 : undefined, width: twoColumns ? undefined : '100%', gap: spacing.lg }}>
            <CaseInfo c={c} />
            {c.review ? <Recommendation review={c.review} /> : <ReviewForm caseId={c.id} />}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
