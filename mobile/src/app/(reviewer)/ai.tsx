import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type Schemas } from '@/api/client';
import { Card, ErrorBanner, Heading, Loading, Muted, Row, Screen, Title } from '@/ui/components';
import { formatDateTime } from '@/ui/labels';
import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, radius, spacing } from '@/ui/theme';

const pct = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v * 100)}%`);

function Bar({ label, value, max, testID }: { label: string; value: number; max: number; testID?: string }) {
  return (
    <View style={styles.barRow} testID={testID}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${max ? Math.round((value / max) * 100) : 0}%` }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

function ModelCard({ m }: { m: Schemas['ModelSummary'] }) {
  const research = m.status === 'research';
  return (
    <Card testID={`model-${m.version}`}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Heading>{m.name}</Heading>
        <View style={[styles.pill, { backgroundColor: research ? colors.accentSoft : colors.successSoft }]}>
          <Text style={[styles.pillText, { color: research ? colors.accent : colors.success }]}>
            {research ? 'Research mode' : 'Advisory'} · {m.version}
          </Text>
        </View>
      </Row>
      <Muted>{m.purpose}</Muted>
      <Row style={{ flexWrap: 'wrap', gap: spacing.lg }}>
        <View>
          <Text style={styles.big}>{pct(m.held_out.accuracy)}</Text>
          <Muted>held-out accuracy (n = {m.held_out.n})</Muted>
        </View>
        {m.held_out.coverage != null ? (
          <View>
            <Text style={styles.big}>{pct(m.held_out.coverage)}</Text>
            <Muted>answered (abstains otherwise)</Muted>
          </View>
        ) : null}
        {m.held_out.accuracy_when_answered != null ? (
          <View>
            <Text style={styles.big}>{pct(m.held_out.accuracy_when_answered)}</Text>
            <Muted>right when it answers</Muted>
          </View>
        ) : null}
      </Row>
      {m.ablation ? (
        <View style={{ gap: 4 }} testID="ablation">
          <Text style={styles.sub}>Optics kill test: same model, with and without the extra bands</Text>
          {Object.entries(m.ablation).map(([arm, acc]) => (
            <View key={arm} style={styles.barRow}>
              <Text style={styles.barLabel}>{arm === 'rgb_only' ? 'RGB bands only' : 'RGB + NIR + maps'}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(acc * 100)}%` }]} />
              </View>
              <Text style={styles.barValue}>{pct(acc)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Muted>
        Simulated held-out data · trained {m.trained_at} · model card {m.model_card}
      </Muted>
    </Card>
  );
}

/** Model cards, live shadow-mode agreement with dermatologists, and the validation-data funnel. */
export default function AiOverview() {
  const router = useRouter();
  const query = useQuery({ queryKey: ['ai-summary'], queryFn: api.aiSummary, refetchInterval: 10_000 });
  const s = query.data;
  const shadow = s?.shadow;
  const d = s?.data;
  return (
    <Screen wide testID="ai-screen">
      <Stack.Screen options={{ title: 'AI & validation' }} />
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title>AI-assisted review</Title>
        <SimulatedBadge label="Simulated data" />
      </Row>
      <Muted>
        Three small models assist; none diagnoses. Dermatologist reads and biopsy results are how
        each model is checked before it may do more.
      </Muted>
      <ErrorBanner error={query.error} />
      {query.isPending ? <Loading /> : null}
      {s ? (
        <>
          {s.models.map((m) => (
            <ModelCard key={m.version} m={m} />
          ))}

          <Card testID="shadow-mode">
            <Heading>Shadow mode: model vs dermatologist</Heading>
            <Muted>
              When dermatologists record their own pattern read, it is compared with the triage
              model's suggestion. Blind reads (AI hidden) are counted separately.
            </Muted>
            <Row style={{ flexWrap: 'wrap', gap: spacing.lg }}>
              <View>
                <Text style={styles.big} testID="shadow-agreement">
                  {shadow!.compared ? pct(shadow!.agreed / shadow!.compared) : '–'}
                </Text>
                <Muted>
                  agreement ({shadow!.agreed} of {shadow!.compared} compared)
                </Muted>
              </View>
              <View>
                <Text style={styles.big}>
                  {shadow!.blind_compared ? pct(shadow!.blind_agreed / shadow!.blind_compared) : '–'}
                </Text>
                <Muted>
                  blind agreement ({shadow!.blind_agreed} of {shadow!.blind_compared})
                </Muted>
              </View>
              <View>
                <Text style={styles.big}>{shadow!.reads}</Text>
                <Muted>dermatologist reads · model abstained on {shadow!.model_abstained}</Muted>
              </View>
            </Row>
          </Card>

          <Card testID="data-funnel">
            <Heading>From reviews to validation data</Heading>
            <Muted>
              A model may only move past research mode on consented, dermatologist-reviewed,
              histopathology-confirmed cases, reported per skin tone.
            </Muted>
            <Bar label="Cases" value={d!.cases} max={d!.cases} />
            <Bar label="Reviewed" value={d!.reviewed} max={d!.cases} />
            <Bar label="Reviewed + research consent" value={d!.consented_reviewed} max={d!.cases} />
            <Bar label="Outcome recorded" value={d!.with_outcome} max={d!.cases} />
            <Bar label="Histopathology confirmed" value={d!.histopathology_confirmed} max={d!.cases} />
            <Bar
              label="Eligible for validation"
              value={d!.validation_eligible}
              max={d!.cases}
              testID="validation-eligible"
            />
          </Card>
          <Muted>
            {s.scope} Computed {formatDateTime(s.computed_at)}.
          </Muted>
          <Pressable onPress={() => router.push('/ai-roadmap')} testID="ai-open-roadmap">
            <Text style={styles.link}>AI roadmap: what is active, what is not →</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: '700' },
  big: { fontSize: 28, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, fontWeight: '700', color: colors.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { width: 200, fontSize: 14, color: colors.text },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6, backgroundColor: colors.accent },
  barValue: { width: 48, textAlign: 'right', fontSize: 14, fontWeight: '700', color: colors.text },
  link: { color: colors.accent, fontWeight: '600', paddingVertical: spacing.xs },
});
