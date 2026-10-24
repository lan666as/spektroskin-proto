import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { api } from '@/api/client';
import { Button, Card, Chips, ErrorBanner, Field, Muted, Screen } from '@/ui/components';
import { measuredFindings } from '@/ui/analysis';
import { formatArea } from '@/ui/labels';

const QUICK_QUESTIONS = [
  'Pigmented lesion that has grown since the first visit. Biopsy or observe?',
  'Please advise: observe, biopsy or refer?',
  'Changed in size and colour. Is referral needed?',
] as const;

export default function SubmitForReview() {
  const { captureId } = useLocalSearchParams<{ captureId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const capture = useQuery({ queryKey: ['capture', captureId], queryFn: () => api.capture(captureId) });
  const [question, setQuestion] = useState('');
  const lesionId = capture.data?.lesion_id;
  const lesion = useQuery({
    queryKey: ['lesion', lesionId],
    queryFn: () => api.lesion(lesionId!),
    enabled: !!lesionId,
  });
  const draft =
    capture.data && lesion.data
      ? `${measuredFindings(capture.data, lesion.data.captures, lesion.data.body_site, true)} Biopsy, observe or refer?`
      : null;

  const submit = useMutation({
    mutationFn: () =>
      api.createCase({
        lesion_id: capture.data!.lesion_id,
        capture_ids: [captureId],
        question: question.trim(),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      router.replace({ pathname: '/cases/[caseId]', params: { caseId: created.id } });
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Submit for review' }} />
      <Card>
        <Muted>
          Sends this capture ({formatArea(capture.data?.area_mm2)}) and the lesion history to a
          dermatologist for a second look.
        </Muted>
        <Chips
          label="Quick question (tap to use, then edit if needed)"
          options={QUICK_QUESTIONS.map((q, i) => ({ value: String(i), label: q }))}
          value={null}
          onChange={(i) => setQuestion(QUICK_QUESTIONS[Number(i)])}
          testIDPrefix="quick-question"
        />
        {draft ? (
          <Button
            label="Draft the question from the measurements"
            variant="secondary"
            onPress={() => setQuestion(draft)}
            testID="draft-question"
          />
        ) : null}
        <Field
          label="Question for the dermatologist"
          value={question}
          onChangeText={setQuestion}
          multiline
          maxLength={2000}
          placeholder="e.g. Pigmented macule on left sole, growing over 30 days. Biopsy or observe?"
          testID="case-question"
        />
        <ErrorBanner error={submit.error} />
        <Button
          label="Submit"
          onPress={() => submit.mutate()}
          disabled={!question.trim() || !capture.data}
          busy={submit.isPending}
          testID="submit-case"
        />
      </Card>
    </Screen>
  );
}
