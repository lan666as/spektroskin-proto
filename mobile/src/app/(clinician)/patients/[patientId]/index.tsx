import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image, View } from 'react-native';

import { absoluteUrl } from '@/api/config';

import { api } from '@/api/client';
import {
  Button,
  Card,
  Empty,
  ErrorBanner,
  Heading,
  KeyValue,
  ListItem,
  Loading,
  Muted,
  Pill,
  Row,
  Screen,
} from '@/ui/components';
import { formatDate, siteLabel } from '@/ui/labels';

export default function PatientScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: () => api.patient(patientId) });
  const p = patient.data;

  return (
    <Screen testID="patient-screen">
      <Stack.Screen options={{ title: p?.code ?? 'Patient' }} />
      <ErrorBanner error={patient.error} />
      {patient.isPending ? <Loading /> : null}
      {p ? (
        <>
          <Card>
            <KeyValue label="Code" value={p.code} />
            <KeyValue label="Age" value={`${p.age} years`} />
            <KeyValue label="Sex" value={p.sex === 'female' ? 'Female' : 'Male'} />
            <KeyValue label="Fitzpatrick" value={p.fitzpatrick} />
            <KeyValue label="Research consent" value={p.research_consent ? 'Yes' : 'No'} />
          </Card>
          <Heading>Lesions</Heading>
          {p.lesions.length === 0 ? <Empty>No lesions recorded yet.</Empty> : null}
          {p.lesions.map((lesion) => (
            <ListItem
              key={lesion.id}
              title={siteLabel(lesion)}
              subtitle={
                lesion.capture_count
                  ? `${lesion.capture_count} capture(s) · last ${formatDate(lesion.last_captured_at!)}`
                  : 'No captures yet'
              }
              onPress={() => router.push({ pathname: '/lesions/[lesionId]', params: { lesionId: lesion.id } })}
              right={
                <Row>
                  {lesion.looks_different ? (
                    <View testID={`looks-different-${lesion.body_site}`}>
                      <Pill label="Looks different" tone="danger" />
                    </View>
                  ) : null}
                  {lesion.latest_thumbnail_url ? (
                    <Image
                      source={{ uri: absoluteUrl(lesion.latest_thumbnail_url) }}
                      style={{ width: 56, height: 56, borderRadius: 8 }}
                    />
                  ) : null}
                </Row>
              }
              testID={`lesion-${lesion.body_site}`}
            />
          ))}
          {p.lesions.some((l) => l.looks_different) ? (
            <Muted testID="ugly-duckling-note">
              "Looks different": this lesion stands out from the patient's other lesions by its pigment
              and blood statistics (the ugly duckling sign). Automated comparison, research mode; the
              dermatologist interprets it.
            </Muted>
          ) : null}
          <Button
            label="Add lesion"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/patients/[patientId]/new-lesion', params: { patientId } })
            }
            testID="add-lesion"
          />
        </>
      ) : null}
    </Screen>
  );
}
