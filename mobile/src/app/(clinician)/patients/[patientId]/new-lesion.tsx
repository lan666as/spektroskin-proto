import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { api } from '@/api/client';
import { BodyMap, type SiteChoice } from '@/ui/BodyMap';
import { Button, Card, Chips, ErrorBanner, Heading, Muted, Screen } from '@/ui/components';
import { BODY_SITES, siteLabel } from '@/ui/labels';
import { colors } from '@/ui/theme';

const LATERALITY = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'midline', label: 'Midline' },
] as const;

export default function NewLesion() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<SiteChoice | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.createLesion({ patient_id: patientId, body_site: choice!.site, laterality: choice!.laterality }),
    onSuccess: (lesion) => {
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      router.replace({ pathname: '/lesions/[lesionId]/capture', params: { lesionId: lesion.id } });
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New lesion' }} />
      <Card>
        <Heading>Where is the lesion?</Heading>
        <BodyMap value={choice} onChange={setChoice} />
        <Pressable onPress={() => setListOpen((v) => !v)} testID="toggle-site-list">
          <Muted style={{ color: colors.accent, textAlign: 'center' }}>
            {listOpen ? 'Hide the list of sites' : 'Pick from a list instead'}
          </Muted>
        </Pressable>
        {listOpen ? (
          <>
            <Chips
              label="Site"
              options={BODY_SITES}
              value={choice?.site ?? null}
              onChange={(site) => setChoice({ site, laterality: choice?.laterality ?? null })}
              testIDPrefix="site"
            />
            <Chips
              label="Side"
              options={LATERALITY}
              value={choice?.laterality ?? null}
              onChange={(laterality) => choice && setChoice({ ...choice, laterality })}
              testIDPrefix="side"
            />
          </>
        ) : null}
        <Heading>{choice ? siteLabel({ body_site: choice.site, laterality: choice.laterality ?? null }) : 'No site selected'}</Heading>
        <ErrorBanner error={create.error} />
        <Button
          label="Save and capture"
          onPress={() => create.mutate()}
          disabled={!choice}
          busy={create.isPending}
          testID="create-lesion"
        />
      </Card>
    </Screen>
  );
}
