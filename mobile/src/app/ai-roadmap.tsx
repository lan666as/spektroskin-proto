import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Heading, Muted, Screen, Title } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';

type Status = 'active' | 'researchActive' | 'research' | 'planned';
const STATUS: Record<Status, { label: string; bg: string; fg: string }> = {
  active: { label: 'Active in this prototype', bg: colors.successSoft, fg: colors.success },
  researchActive: { label: 'Research mode · simulated data', bg: colors.accentSoft, fg: colors.accent },
  research: { label: 'Not active · research', bg: colors.simulatedBg, fg: colors.simulatedText },
  planned: { label: 'Planned · not active', bg: colors.surface, fg: colors.textMuted },
};

const TIERS: { tier: string; title: string; status: Status; what: string; gate: string }[] = [
  {
    tier: 'Tier 1',
    title: 'Image quality',
    status: 'active',
    what:
      'Rule-based checks of focus, glare and the reference patches decide whether a capture is accepted, with retake guidance. A small learned classifier (logistic regression on 12 image statistics, trained on simulated captures only) gives an advisory second opinion: 97% accurate on held-out simulated captures, against 90% for the rules on the same set.',
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
    title: 'Triage support: lesion pattern',
    status: 'researchActive',
    what:
      'Running now in research mode: a small model suggests whether a lesion is pigment-dominant, blood-vessel-dominant or mixed, from the pigment and blood maps, and abstains when unsure. Trained on 900 simulated lesions; on 450 held-out simulated lesions it was right 98% of the time (96% on dark skin). It never says benign or malignant.',
    gate: 'Next: retrain on real, consented captures; add a medical image encoder and patient metadata.',
  },
  {
    tier: 'Tier 3',
    title: 'Triage support: acral pattern',
    status: 'researchActive',
    what:
      'Running now in research mode for palms, soles and nails: reads whether pigment follows the skin furrows or the ridges, by comparing the pigment map with the ridges the unmixing finds. A parallel ridge pattern is a guideline reason for prompt review (Saida 2004); acral melanoma is the most common subtype reported in Asian patients. On held-out simulated acral lesions it was right 99% of the time and abstained on half of the faintest patterns.',
    gate: 'Next: real, consented acral captures from Indonesian clinics, read by dermatologists.',
  },
  {
    tier: 'Tier 3b',
    title: 'Triage support: suspicion for biopsy',
    status: 'research',
    what:
      'Helps prioritise which lesions a dermatologist sees first, abstaining when unsure. Needs labels the simulator cannot provide, so it does not exist yet. It would never output a diagnosis.',
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
      'The same model trained with and without the extra bands. If the spectral bands add nothing measurable, we drop them: this is the kill test for the optics. Run tonight on simulated lesions for the pattern model: RGB bands only 95%, RGB + NIR + maps 98% held-out accuracy (dark skin 93% vs 96%). Simulated physics only.',
    gate: 'The real test is on held-out hospital sites, not on the training site.',
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
