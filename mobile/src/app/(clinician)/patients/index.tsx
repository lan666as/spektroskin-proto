import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { api } from '@/api/client';
import { absoluteUrl } from '@/api/config';
import { useSession } from '@/api/session';
import { Avatar, Button, Card, Chips, Empty, ErrorBanner, Field, Heading, ListItem, Loading, Muted, Pill, Row, Screen, SectionLabel } from '@/ui/components';
import { DeviceCard } from '@/ui/DeviceCard';
import { nextStep } from '@/ui/outcome';
import { ACTION_LABELS, demographics, duration, FLAG_LABELS, formatDate, siteLabel } from '@/ui/labels';
import { colors, radius, spacing } from '@/ui/theme';

const POLL_MS = 5_000;
const TODO_SHOWN = 5;
const RECENT_DAYS = 7;
const TODAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function initials(name: string): string {
  const words = name.replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '·';
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'flagged', label: 'Needs attention' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'recent', label: 'Recent' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { width } = useWindowDimensions();
  const patients = useQuery({ queryKey: ['patients'], queryFn: api.patients });
  const cases = useQuery({ queryKey: ['cases', 'mine'], queryFn: () => api.cases(), refetchInterval: POLL_MS });
  const waiting = cases.data?.filter((c) => c.status !== 'answered') ?? [];
  const answered = cases.data?.filter((c) => c.status === 'answered') ?? [];
  const todo = answered.flatMap((c) => {
    const step = nextStep(c);
    return step ? [{ c, step }] : [];
  });
  const secondLook = (patients.data ?? []).flatMap((patient) =>
    patient.lesion_flags.map((flag) => ({ patient, flag })),
  );
  const latestAnswer = [...answered].sort((a, b) => (b.answered_at ?? '').localeCompare(a.answered_at ?? ''))[0];
  const query = search.trim().toUpperCase();
  const followUpCodes = new Set(todo.map(({ c }) => c.patient.code));
  const recentSince = Date.now() - RECENT_DAYS * 86_400_000;
  const matchesFilter = (p: NonNullable<typeof patients.data>[number]) =>
    filter === 'all' ||
    (filter === 'flagged' && p.lesion_flags.length > 0) ||
    (filter === 'follow-up' && followUpCodes.has(p.code)) ||
    (filter === 'recent' && !!p.last_visit_at && Date.parse(p.last_visit_at) >= recentSince);
  const shown = patients.data?.filter((p) => (!query || p.code.includes(query)) && matchesFilter(p)) ?? [];

  return (
    <Screen testID="patients-screen" onRefresh={() => Promise.all([patients.refetch(), cases.refetch()])}>
      {/* The greeting is the title on phones, as in the Figma home; wide screens keep the header for navigation. */}
      <Stack.Screen options={{ title: 'Home', headerShown: width >= 700 }} />
      <View style={styles.greeting}>
        <View style={{ flex: 1 }}>
          <Muted style={styles.date}>{TODAY.format(new Date())}</Muted>
          <Text style={styles.hello}>
            {greeting()},{'\n'}
            {user?.display_name}
          </Text>
        </View>
        <Avatar label={initials(user?.display_name ?? '')} />
      </View>

      <DeviceCard>
        <Button label="New scan" variant="onDark" onPress={() => router.push('/patients/new')} testID="new-scan" />
      </DeviceCard>

      <Row style={{ flexWrap: 'wrap' }}>
        <Pressable style={styles.stat} onPress={() => setFilter('flagged')} testID="stat-flags">
          <Text style={[styles.statNumber, { color: colors.danger }]}>{secondLook.length}</Text>
          <Muted>Flags to check</Muted>
        </Pressable>
        <Pressable style={styles.stat} onPress={() => setFilter('follow-up')} testID="stat-follow-up">
          <Text style={[styles.statNumber, { color: colors.accent }]}>{todo.length}</Text>
          <Muted>Follow-ups due</Muted>
        </Pressable>
        <Pressable style={styles.stat} onPress={() => router.navigate('/cases')} testID="stat-waiting">
          <Text style={[styles.statNumber, { color: colors.teal }]}>{waiting.length}</Text>
          <Muted>Waiting for review</Muted>
        </Pressable>
        <Pressable style={styles.stat} onPress={() => router.navigate('/cases')} testID="stat-answered">
          <Text style={[styles.statNumber, { color: colors.success }]}>{answered.length}</Text>
          <Muted>Recommendations</Muted>
        </Pressable>
      </Row>

      {latestAnswer ? (
        <>
          <SectionLabel>LATEST RECOMMENDATION</SectionLabel>
          <ListItem
            title={`${latestAnswer.patient.code} · ${siteLabel(latestAnswer.lesion)}`}
            subtitle={`Answered in ${duration(latestAnswer.created_at, latestAnswer.answered_at)}`}
            right={<Pill label={ACTION_LABELS[latestAnswer.review_action!]} tone="success" />}
            onPress={() => router.push({ pathname: '/cases/[caseId]', params: { caseId: latestAnswer.id } })}
            testID="latest-recommendation"
          />
        </>
      ) : null}

      {todo.length ? (
        <View style={styles.group} testID="todo">
          <SectionLabel>TO DO · {todo.length}</SectionLabel>
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
        </View>
      ) : null}

      {secondLook.length ? (
        <View style={styles.group} testID="second-look">
          <SectionLabel>WORTH A SECOND LOOK · {secondLook.length}</SectionLabel>
          {secondLook.slice(0, TODO_SHOWN).map(({ patient, flag }) => (
            <ListItem
              key={`${flag.lesion_id}-${flag.flag}`}
              title={`${patient.code} · ${siteLabel(flag)}`}
              subtitle={FLAG_LABELS[flag.flag].why}
              right={<Pill label={FLAG_LABELS[flag.flag].label} tone={FLAG_LABELS[flag.flag].tone} />}
              onPress={() => router.push({ pathname: '/lesions/[lesionId]', params: { lesionId: flag.lesion_id } })}
              testID={`second-look-${flag.lesion_id}`}
            />
          ))}
          <Muted>Automated flags from measurements and lesion comparison; consider asking a dermatologist.</Muted>
        </View>
      ) : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.sectionTitle}>Patients</Text>
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
      <Chips scroll options={FILTERS} value={filter} onChange={setFilter} testIDPrefix="filter" />
      <ErrorBanner error={patients.error ?? cases.error} />
      {patients.isPending ? <Loading /> : null}
      {patients.data?.length === 0 ? <Empty>No patients yet. Register the first one.</Empty> : null}
      {patients.data?.length && shown.length === 0 ? <Empty>No patient matches this search and filter.</Empty> : null}
      {shown.map((p) => (
        <ListItem
          key={p.id}
          title={p.code}
          left={<Avatar label={p.code.slice(-2)} tone={p.lesion_flags.length ? 'danger' : 'info'} />}
          subtitle={`${p.age} ${p.sex === 'female' ? 'F' : 'M'} · Fitz. ${p.fitzpatrick} · ${p.lesion_count} lesion${
            p.lesion_count === 1 ? '' : 's'
          }${p.last_visit_at ? `\nLast visit ${formatDate(p.last_visit_at)}` : ''}`}
          right={
            <View style={styles.right}>
              {p.lesion_flags[0] ? (
                <Pill label={FLAG_LABELS[p.lesion_flags[0].flag].label} tone={FLAG_LABELS[p.lesion_flags[0].flag].tone} />
              ) : null}
              {p.latest_thumbnail_url ? (
                <Image source={{ uri: absoluteUrl(p.latest_thumbnail_url) }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
            </View>
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
  group: { gap: spacing.sm },
  sectionTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  greeting: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingTop: spacing.sm },
  date: { fontWeight: '600', fontSize: 14 },
  hello: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.6, lineHeight: 36 },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
  },
  statNumber: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  latest: { borderColor: colors.accent, paddingVertical: spacing.sm, gap: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  thumbEmpty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
