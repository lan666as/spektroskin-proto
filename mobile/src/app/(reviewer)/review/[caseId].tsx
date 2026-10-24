import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

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
import { CaseTimeline, Footnote, HistoryStrip, Recommendation, SpectralViews, VisitCompare } from '@/ui/clinical';
import { SpectralSignature } from '@/ui/measurement';
import { isAcral } from '@/ui/labels';
import { formatArea, formatDateTime, siteLabel, STATUS_LABELS, statusTone } from '@/ui/labels';
import { colors, radius, spacing } from '@/ui/theme';

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
// Phrases the dermatologist can tap to start the impression, then edit. Typed by the human
// reviewer's choice; nothing here is generated from the images.
const PHRASES = [
  'Irregular pigment with growth between visits.',
  'Acral site; change in size over 30 days.',
  'Stable appearance compared with earlier visits.',
  'Vascular pattern visible on the hemoglobin map.',
] as const;

function ReviewForm({ caseId, onSent }: { caseId: string; onSent: () => void }) {
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
      onSent();
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
      <Chips
        label="Add a phrase"
        options={PHRASES.map((phrase, i) => ({ value: String(i), label: phrase }))}
        value={null}
        onChange={(i) =>
          setImpression((current) => (current.trim() ? `${current.trim()} ` : '') + PHRASES[Number(i)])
        }
        testIDPrefix="phrase"
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
      <KeyValue label="Site" value={`${siteLabel(c.lesion)}${isAcral(c.lesion.body_site) ? ' (acral)' : ''}`} />
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
  const router = useRouter();
  const [justSent, setJustSent] = useState(false);

  return (
    <Screen wide testID="review-case-screen">
      <Stack.Screen options={{ title: c ? `Review · ${c.patient.code}` : 'Review' }} />
      <ErrorBanner error={query.error} />
      {query.isPending ? <Loading /> : null}
      {c ? (
        <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: spacing.lg, alignItems: 'flex-start' }}>
          <View style={{ flex: twoColumns ? 3 : undefined, width: twoColumns ? undefined : '100%', gap: spacing.lg }}>
            {latest ? <SpectralViews key={latest.id} capture={latest} allowAll={twoColumns} /> : null}
            <HistoryStrip
              captures={c.lesion_history}
              currentId={latest?.id}
              onSelect={(v) => setSelectedId(v.id)}
            />
            <VisitCompare captures={c.lesion_history} selectedId={reviewed?.id} />
            {latest ? <SpectralSignature capture={latest} /> : null}
            <Footnote />
          </View>
          <View style={{ flex: twoColumns ? 2 : undefined, width: twoColumns ? undefined : '100%', gap: spacing.lg }}>
            <CaseInfo c={c} />
            <CaseTimeline c={c} />
            {c.review ? (
              <>
                {justSent ? (
                  <View
                    style={{ backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md }}
                    testID="review-sent"
                  >
                    <Text style={{ color: colors.onAccent, fontWeight: '700', fontSize: 16 }}>
                      Sent to {c.requested_by}. It appears on their screen within seconds.
                    </Text>
                  </View>
                ) : null}
                <Recommendation review={c.review} />
                <Button label="Back to queue" variant="secondary" onPress={() => router.navigate('/review')} />
              </>
            ) : (
              <ReviewForm caseId={c.id} onSent={() => setJustSent(true)} />
            )}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
