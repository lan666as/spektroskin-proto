import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { absoluteUrl } from '@/api/config';
import { useSession } from '@/api/session';
import { Button, Card, Empty, ErrorBanner, Field, Heading, ListItem, Loading, Muted, Pill, Row, Screen } from '@/ui/components';
import { nextStep } from '@/ui/outcome';
import { ACTION_LABELS, demographics, duration, formatDate, siteLabel } from '@/ui/labels';
import { colors, radius, spacing } from '@/ui/theme';

const POLL_MS = 5_000;
const TODO_SHOWN = 5;

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const patients = useQuery({ queryKey: ['patients'], queryFn: api.patients });
  const cases = useQuery({ queryKey: ['cases', 'mine'], queryFn: () => api.cases(), refetchInterval: POLL_MS });
  const waiting = cases.data?.filter((c) => c.status !== 'answered') ?? [];
  const answered = cases.data?.filter((c) => c.status === 'answered') ?? [];
  const todo = answered.flatMap((c) => {
    const step = nextStep(c);
    return step ? [{ c, step }] : [];
  });
  const latestAnswer = [...answered].sort((a, b) => (b.answered_at ?? '').localeCompare(a.answered_at ?? ''))[0];
  const query = search.trim().toUpperCase();
  const shown = patients.data?.filter((p) => !query || p.code.includes(query)) ?? [];

  return (
    <Screen testID="patients-screen" onRefresh={() => Promise.all([patients.refetch(), cases.refetch()])}>
      <Stack.Screen options={{ title: 'Home' }} />
      <View>
        <Text style={styles.hello}>Hello, {user?.display_name}</Text>
        <Muted>Capture a lesion, then ask a dermatologist for a second look.</Muted>
      </View>

      <Row style={{ flexWrap: 'nowrap' }}>
        <Pressable style={styles.stat} onPress={() => router.navigate('/cases')} testID="stat-waiting">
          <Text style={styles.statNumber}>{waiting.length}</Text>
          <Muted>Waiting for review</Muted>
        </Pressable>
        <Pressable style={styles.stat} onPress={() => router.navigate('/cases')} testID="stat-answered">
          <Text style={[styles.statNumber, { color: colors.success }]}>{answered.length}</Text>
          <Muted>Recommendations</Muted>
        </Pressable>
      </Row>

      {latestAnswer ? (
        <Card style={styles.latest}>
          <Muted style={{ color: colors.accent, fontWeight: '700' }}>LATEST RECOMMENDATION</Muted>
          <ListItem
            title={`${latestAnswer.patient.code} · ${siteLabel(latestAnswer.lesion)}`}
            subtitle={`Answered in ${duration(latestAnswer.created_at, latestAnswer.answered_at)}`}
            right={<Pill label={ACTION_LABELS[latestAnswer.review_action!]} tone="success" />}
            onPress={() => router.push({ pathname: '/cases/[caseId]', params: { caseId: latestAnswer.id } })}
            testID="latest-recommendation"
          />
        </Card>
      ) : null}

      {todo.length ? (
        <Card testID="todo">
          <Heading>To do</Heading>
          {todo.slice(0, TODO_SHOWN).map(({ c, step }) => (
            <ListItem
              key={c.id}
              title={`${c.patient.code} · ${siteLabel(c.lesion)}`}
              subtitle={step}
              right={<Pill label={ACTION_LABELS[c.review_action!]} tone="neutral" />}
              onPress={() => router.push({ pathname: '/cases/[caseId]', params: { caseId: c.id } })}
              testID={`todo-${c.id}`}
            />
          ))}
          {todo.length > TODO_SHOWN ? <Muted>and {todo.length - TODO_SHOWN} more in My cases</Muted> : null}
        </Card>
      ) : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <Heading>Patients</Heading>
        <Button label="New patient" onPress={() => router.push('/patients/new')} testID="new-patient" />
      </Row>
      <Field
        label="Search by patient code"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="characters"
        placeholder="e.g. PT-0007"
        testID="patient-search"
      />
      <ErrorBanner error={patients.error ?? cases.error} />
      {patients.isPending ? <Loading /> : null}
      {patients.data?.length === 0 ? <Empty>No patients yet. Register the first one.</Empty> : null}
      {patients.data?.length && shown.length === 0 ? <Empty>No patient matches “{search}”.</Empty> : null}
      {shown.map((p) => (
        <ListItem
          key={p.id}
          title={p.code}
          subtitle={`${demographics(p)} · ${p.lesion_count} lesion${p.lesion_count === 1 ? '' : 's'}${
            p.last_visit_at ? ` · last visit ${formatDate(p.last_visit_at)}` : ''
          }`}
          right={
            p.latest_thumbnail_url ? (
              <Image source={{ uri: absoluteUrl(p.latest_thumbnail_url) }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )
          }
          onPress={() => router.push({ pathname: '/patients/[patientId]', params: { patientId: p.id } })}
          testID={`patient-${p.code}`}
        />
      ))}
      <Pressable onPress={() => router.push('/about')} style={{ alignSelf: 'center', padding: spacing.sm }}>
        <Muted style={{ color: colors.accent }}>About this prototype</Muted>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { fontSize: 22, fontWeight: '700', color: colors.text },
  stat: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  statNumber: { fontSize: 28, fontWeight: '800', color: colors.text },
  latest: { borderColor: colors.accent, paddingVertical: spacing.sm, gap: 0 },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  thumbEmpty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
