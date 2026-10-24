import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { api, type BodySite, type LesionCreate } from '@/api/client';
import { Button, Card, Chips, ErrorBanner, Muted, Screen } from '@/ui/components';
import { BODY_SITES } from '@/ui/labels';

const ACRAL = BODY_SITES.filter((s) => s.acral);
const OTHER = BODY_SITES.filter((s) => !s.acral);
const LATERALITY = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'midline', label: 'Midline' },
] as const;

export default function NewLesion() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [site, setSite] = useState<BodySite | null>(null);
  const [laterality, setLaterality] = useState<LesionCreate['laterality'] | null>(null);

  const create = useMutation({
    mutationFn: () => api.createLesion({ patient_id: patientId, body_site: site!, laterality }),
    onSuccess: (lesion) => {
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      router.replace({ pathname: '/lesions/[lesionId]/capture', params: { lesionId: lesion.id } });
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New lesion' }} />
      <Card>
        <Chips label="Acral sites" options={ACRAL} value={site} onChange={setSite} testIDPrefix="site" />
        <Muted>Palms, soles and nails are listed first: acral sites matter in Indonesian patients.</Muted>
        <Chips label="Other sites" options={OTHER} value={site} onChange={setSite} testIDPrefix="site" />
        <Chips
          label="Side"
          options={LATERALITY}
          value={laterality ?? null}
          onChange={setLaterality}
          testIDPrefix="side"
        />
        <ErrorBanner error={create.error} />
        <Button
          label="Save and capture"
          onPress={() => create.mutate()}
          disabled={!site}
          busy={create.isPending}
          testID="create-lesion"
        />
      </Card>
    </Screen>
  );
}
