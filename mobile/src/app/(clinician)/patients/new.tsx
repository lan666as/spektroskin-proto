import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { api, type PatientCreate } from '@/api/client';
import { Button, Card, Chips, ErrorBanner, Field, Muted, Screen } from '@/ui/components';

const SEX = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
] as const;
const CONSENT = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;
const FITZPATRICK = (['I', 'II', 'III', 'IV', 'V', 'VI'] as const).map((v) => ({ value: v, label: v }));

function nextCode(codes: string[]): string {
  const max = codes.reduce((m, c) => Math.max(m, Number(c.slice(3)) || 0), 0);
  return `PT-${String(max + 1).padStart(4, '0')}`;
}

export default function NewPatient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const existing = useQuery({ queryKey: ['patients'], queryFn: api.patients });
  const [code, setCode] = useState<string | null>(null);
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<PatientCreate['sex'] | null>(null);
  const [fitzpatrick, setFitzpatrick] = useState<PatientCreate['fitzpatrick'] | null>(null);
  const [consent, setConsent] = useState<'yes' | 'no' | null>(null);

  const suggested = existing.data ? nextCode(existing.data.map((p) => p.code)) : '';
  const codeValue = code ?? suggested;
  const ageNumber = Number(age);
  const valid =
    /^PT-\d{4}$/.test(codeValue) && age !== '' && ageNumber >= 0 && ageNumber <= 120 && sex && fitzpatrick && consent;

  const create = useMutation({
    mutationFn: () =>
      api.createPatient({
        code: codeValue,
        age: ageNumber,
        sex: sex!,
        fitzpatrick: fitzpatrick!,
        research_consent: consent === 'yes',
      }),
    onSuccess: (patient) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      router.replace({ pathname: '/patients/[patientId]', params: { patientId: patient.id } });
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New patient' }} />
      <Card>
        <Field
          label="Pseudonymous code"
          value={codeValue}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="PT-0001"
          testID="patient-code"
        />
        <Muted>Format PT-0000. Never enter names or ID numbers.</Muted>
        <Field
          label="Age (years)"
          value={age}
          onChangeText={(t) => setAge(t.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          testID="patient-age"
        />
        <Chips label="Sex" options={SEX} value={sex} onChange={setSex} testIDPrefix="sex" />
        <Chips
          label="Fitzpatrick skin type"
          options={FITZPATRICK}
          value={fitzpatrick}
          onChange={setFitzpatrick}
          testIDPrefix="fitzpatrick"
        />
        <Chips
          label="Consent to research use of images"
          options={CONSENT}
          value={consent}
          onChange={setConsent}
          testIDPrefix="consent"
        />
        <Muted>Care does not depend on this answer. Only consented images may enter research datasets.</Muted>
        <ErrorBanner error={create.error} />
        <Button
          label="Create patient"
          onPress={() => create.mutate()}
          disabled={!valid}
          busy={create.isPending}
          testID="create-patient"
        />
      </Card>
    </Screen>
  );
}
