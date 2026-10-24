import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Heading, Muted, Screen, Title } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';

type Status = 'active' | 'research' | 'planned';
const STATUS: Record<Status, { label: string; bg: string; fg: string }> = {
  active: { label: 'Active in this prototype', bg: colors.successSoft, fg: colors.success },
  research: { label: 'Not active · research', bg: colors.simulatedBg, fg: colors.simulatedText },
  planned: { label: 'Planned · not active', bg: colors.surface, fg: colors.textMuted },
};

const TIERS: { tier: string; title: string; status: Status; what: string; gate: string }[] = [
  {
    tier: 'Tier 1',
    title: 'Image quality',
    status: 'active',
    what:
      'Rule-based checks of focus, glare and the reference patches, with retake guidance when a capture fails.',
    gate: 'Next: retrain and re-measure on bench images from the real optical module.',
  },
  {
    tier: 'Tier 2',
    title: 'Outline, measurement and change tracking',
    status: 'active',
    what:
      'Classical segmentation of the pigment and blood maps; area, diameter and change across visits of the same lesion.',
    gate: 'Next: repeatability on physical phantoms (same lesion, repeated captures).',
  },
  {
    tier: 'Tier 3',
    title: 'Triage support',
    status: 'research',
    what:
      'A model that helps prioritise which lesions a dermatologist sees first, using a medical image encoder, a spectral branch and patient metadata, and abstaining when unsure. It would never output a diagnosis.',
    gate: 'Only after local, ethics-approved data with histopathology labels and skin-tone-stratified results.',
  },
  {
    tier: 'Tier 3a',
    title: 'Shadow-mode validation',
    status: 'planned',
    what:
      'The model runs silently beside real dermatologist reviews on consented cases; its output is stored, never shown, and compared with the dermatologist and histopathology.',
    gate: 'Report sensitivity and specificity with confidence intervals per Fitzpatrick type before any display.',
  },
  {
    tier: 'Tier 4',
    title: 'RGB vs RGB + spectral ablation',
    status: 'planned',
    what:
      'The same model trained with and without the extra bands. If the spectral bands add nothing measurable, we drop them: this is the kill test for the optics.',
    gate: 'Decided on held-out hospital sites, not on the training site.',
  },
];

export default function AiRoadmap() {
  return (
    <Screen testID="ai-roadmap-screen">
      <Stack.Screen options={{ title: 'AI roadmap' }} />
      <View style={{ gap: spacing.xs }}>
        <Title>AI, step by step</Title>
        <Muted>
          What runs today is automated assistance that measures and checks images. Anything that
          assesses lesions stays switched off until it is validated on local, consented data.
        </Muted>
      </View>
      {TIERS.map((t) => {
        const s = STATUS[t.status];
        return (
          <Card key={t.title} testID={`tier-${t.status}`}>
            <View style={styles.header}>
              <Text style={styles.tier}>{t.tier}</Text>
              <View style={[styles.status, { backgroundColor: s.bg }]}>
                <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
              </View>
            </View>
            <Heading>{t.title}</Heading>
            <Text style={styles.body}>{t.what}</Text>
            <Muted>{t.gate}</Muted>
          </Card>
        );
      })}
      <Card style={{ borderColor: colors.danger }}>
        <Heading>Never shown, at any tier</Heading>
        <Text style={styles.body}>
          A diagnosis, a malignancy probability, a risk score, or a performance number that was not
          measured. The dermatologist recommends; the treating clinician decides.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tier: { fontSize: 13, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  status: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: 12, fontWeight: '700' },
  body: { fontSize: 15, color: colors.text },
});
