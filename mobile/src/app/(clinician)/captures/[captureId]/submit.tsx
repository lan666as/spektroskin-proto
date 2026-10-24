import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { api } from '@/api/client';
import { Button, Card, ErrorBanner, Field, Muted, Screen } from '@/ui/components';
import { formatArea } from '@/ui/labels';

export default function SubmitForReview() {
  const { captureId } = useLocalSearchParams<{ captureId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const capture = useQuery({ queryKey: ['capture', captureId], queryFn: () => api.capture(captureId) });
  const [question, setQuestion] = useState('');

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
