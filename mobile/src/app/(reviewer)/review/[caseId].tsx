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
import { areaChange, AutomatedAnalysis, formatSize, measuredFindings, MorphologyCard } from '@/ui/analysis';
import { AcralPattern, RunAiBanner, TriageSupport } from '@/ui/triage';
import { OutcomeCard } from '@/ui/outcome';
import { SimilarCases } from '@/ui/similar';
import { SpectralSignature } from '@/ui/measurement';
import { isAcral } from '@/ui/labels';
import { FLAG_LABELS, formatArea, formatDateTime, siteLabel, STATUS_LABELS, statusTone } from '@/ui/labels';
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
const PATTERN_READS = [
  { value: 'pigmented', label: 'Pigment-dominant' },
  { value: 'vascular', label: 'Blood-vessel-dominant' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'unsure', label: 'Unsure' },
] as const;
type PatternRead = (typeof PATTERN_READS)[number]['value'];
// Phrases the dermatologist can tap to start the impression, then edit. Typed by the human
// reviewer's choice; nothing here is generated from the images.
const PHRASES = [
  'Irregular pigment with growth between visits.',
  'Acral site; change in size over 30 days.',
  'Stable appearance compared with earlier visits.',
  'Vascular pattern visible on the hemoglobin map.',
] as const;

function ReviewForm({
  caseId,
  aiHidden,
  findings,
  onSent,
}: {
  caseId: string;
  aiHidden: boolean;
  /** Measured findings as text, offered as a starting point for the impression. */
  findings: string | null;
  onSent: () => void;
}) {
  const queryClient = useQueryClient();
  const [impression, setImpression] = useState('');
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [notes, setNotes] = useState('');
  const [read, setRead] = useState<PatternRead | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      api.review(caseId, {
        impression: impression.trim(),
        action: action!,
        follow_up_days: followUp && followUp !== 'none' ? Number(followUp) : null,
        notes: notes.trim() || null,
        pattern_read: read,
        ai_hidden: aiHidden,
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
      {findings ? (
        <Button
          label="Insert measured findings (edit before sending)"
          variant="secondary"
          onPress={() => setImpression((current) => (current.trim() ? `${current.trim()} ` : '') + findings)}
          testID="insert-findings"
        />
      ) : null}
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
      <Chips
        label="Your read of the dominant pattern (optional: validates the triage model in shadow mode)"
        options={PATTERN_READS}
        value={read}
        onChange={setRead}
        testIDPrefix="pattern-read"
      />
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
      {c.attention_flags.length ? (
        <View style={{ gap: 4 }} testID="attention-flags">
          <Text style={{ fontWeight: '700', color: colors.text }}>Attention flags</Text>
          {c.attention_flags.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <Pill label={FLAG_LABELS[f].label} tone={FLAG_LABELS[f].tone} />
              <Muted style={{ flex: 1 }}>{FLAG_LABELS[f].why}</Muted>
            </View>
          ))}
        </View>
      ) : null}
      <KeyValue label="Research consent" value={c.patient.research_consent ? 'Yes' : 'No'} />
      <KeyValue label="Site" value={`${siteLabel(c.lesion)}${isAcral(c.lesion.body_site) ? ' (acral)' : ''}`} />
      <KeyValue
        label="Area · size (latest)"
        value={`${formatArea(latest?.area_mm2)}${latest && formatSize(latest) ? ` · ${formatSize(latest)}` : ''}`}
      />
      {latest && areaChange(c.lesion_history[0], latest) ? (
        <KeyValue
          label="Change since first visit"
          value={`${(areaChange(c.lesion_history[0], latest)!.percent >= 0 ? '+' : '')}${areaChange(c.lesion_history[0], latest)!.percent.toFixed(0)}% in ${areaChange(c.lesion_history[0], latest)!.days} days`}
        />
      ) : null}
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
  const [blind, setBlind] = useState(false);
  const hideAI = blind && !c?.review;

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
            {latest ? <MorphologyCard capture={latest} visits={c.lesion_history} /> : null}
            {latest && !hideAI ? (
              <AutomatedAnalysis capture={latest} visits={c.lesion_history} site={c.lesion.body_site} />
            ) : null}
            {latest ? <SpectralSignature capture={latest} /> : null}
            <Footnote />
          </View>
          <View style={{ flex: twoColumns ? 2 : undefined, width: twoColumns ? undefined : '100%', gap: spacing.lg }}>
            <CaseInfo c={c} />
            {latest && !hideAI ? <RunAiBanner capture={latest} /> : null}
            {!c.review ? (
              <Card testID="blind-read">
                <Chips
                  label="AI suggestions while you review"
                  options={[
                    { value: 'shown', label: 'Show' },
                    { value: 'hidden', label: 'Hide until I send (blind read)' },
                  ]}
                  value={blind ? 'hidden' : 'shown'}
                  onChange={(v) => setBlind(v === 'hidden')}
                  testIDPrefix="ai"
                />
                <Muted>Blind reads avoid anchoring on the model and make the shadow-mode comparison fair.</Muted>
              </Card>
            ) : null}
            {latest && !hideAI ? <TriageSupport capture={latest} read={c.review?.pattern_read} /> : null}
            {latest && !hideAI ? <AcralPattern capture={latest} site={c.lesion.body_site} /> : null}
            {!hideAI ? <SimilarCases caseId={c.id} /> : null}
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
                <Recommendation review={c.review} due={c.follow_up_due} />
                <OutcomeCard c={c} editable={false} />
                <Button label="Back to queue" variant="secondary" onPress={() => router.navigate('/review')} />
              </>
            ) : (
              <ReviewForm
                caseId={c.id}
                aiHidden={hideAI}
                findings={reviewed ? measuredFindings(reviewed, c.lesion_history, c.lesion.body_site, !hideAI) : null}
                onSent={() => setJustSent(true)}
              />
            )}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
