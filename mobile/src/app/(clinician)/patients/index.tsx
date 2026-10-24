import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';

import { api } from '@/api/client';
import { Button, Empty, ErrorBanner, ListItem, Loading, Screen } from '@/ui/components';
import { patientLabel } from '@/ui/labels';

export default function Patients() {
  const router = useRouter();
  const patients = useQuery({ queryKey: ['patients'], queryFn: api.patients });

  return (
    <Screen testID="patients-screen">
      <Stack.Screen options={{ title: 'Patients' }} />
      <Button label="New patient" onPress={() => router.push('/patients/new')} testID="new-patient" />
      <ErrorBanner error={patients.error} />
      {patients.isPending ? <Loading /> : null}
      {patients.data?.length === 0 ? <Empty>No patients yet. Register the first one.</Empty> : null}
      {patients.data?.map((p) => (
        <ListItem
          key={p.id}
          title={p.code}
          subtitle={patientLabel(p)}
          onPress={() => router.push({ pathname: '/patients/[patientId]', params: { patientId: p.id } })}
          testID={`patient-${p.code}`}
        />
      ))}
    </Screen>
  );
}
