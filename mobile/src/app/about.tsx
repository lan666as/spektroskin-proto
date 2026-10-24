import { Stack } from 'expo-router';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Heading, Muted, Screen, Title } from '@/ui/components';
import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, radius, spacing } from '@/ui/theme';

const REAL_VS_SIMULATED: [string, string, boolean][] = [
  ['Optical module (LEDs, sensor, spacer)', 'Simulated virtual module', false],
  ['Skin images', 'Code-generated phantoms with known ground truth', false],
  ['Quality checks (sharpness, glare, reference patches)', 'Real code', true],
  ['Calibration, registration, spectral maps, outline, area', 'Real code', true],
  ['Clinician app (Android and web) and review portal', 'Real', true],
  ['Records, audit log, consent flag', 'Real (demo login only)', true],
  ['AI models (quality, lesion pattern, acral pattern)', 'Real models, trained on simulated data', true],
  ['AI accuracy numbers', 'Measured on held-out simulated data, not patients', false],
];

const PIPELINE = [
  'Quality check: sharpness, glare and the gray reference patches, with retake guidance.',
  'Calibration: dark frame, flat-field and LED drift corrected from the 18 % / 50 % gray patches.',
  'Registration: each band aligned to green to undo hand motion between flashes.',
  'Spectral maps: per-pixel unmixing of 470 / 550 / 660 / 850 nm into melanin and hemoglobin.',
  'Outline and area: threshold on the chromophore maps, area from the fixed spacer scale.',
];

const EVIDENCE = [
  ['Synthetic captures tested', '90 (Fitzpatrick III, IV, V × 3 lesion types × 10)'],
  ['Clean captures passing QC', '90 / 90'],
  ['Blurred and glare captures rejected', '60 / 60 (every skin tone)'],
  ['Lesion outline overlap (Dice)', '≥ 0.96'],
  ['Area error vs truth', '≤ 7.8 %'],
  ['Growth series 18 → 22 → 28 mm²', 'measured 18.4 → 22.6 → 28.7 mm²'],
  ['AI triage, held-out simulated lesions', '98 % (Fitzpatrick V: 96 %)'],
  ['RGB bands only vs + NIR and spectral maps', '95 % vs 98 % (the optics kill test)'],
  ['Same lesion captured 10 times, same AI answer', '100 % (12 phantoms)'],
  ['Heavy sensor noise caught by QC', 'failed at first; fixed tonight (noise check)'],
];

export default function About() {
  return (
    <Screen testID="about-screen">
      <Stack.Screen options={{ title: 'About this prototype' }} />
      <View style={{ gap: spacing.xs }}>
        <Image source={require('@/assets/images/icon.png')} style={{ width: 64, height: 64, borderRadius: 14 }} />
        <Title>SpektroSkin</Title>
        <Text style={styles.lead}>A second look shouldn't require a second hospital.</Text>
        <Muted>
          A research-stage concept for smaller Indonesian hospitals: a clinician captures a suspicious
          lesion with a multispectral module, and a dermatologist gives a remote second look. The
          dermatologist recommends; the treating clinician decides.
        </Muted>
        <SimulatedBadge label="Built during GENOHACK 2026 · optical module simulated" />
      </View>

      <Card>
        <Heading>What is real, what is simulated</Heading>
        {REAL_VS_SIMULATED.map(([part, status, real]) => (
          <View key={part} style={styles.row}>
            <Text style={styles.part}>{part}</Text>
            <View style={[styles.tag, real ? styles.tagReal : styles.tagSim]}>
              <Text style={[styles.tagText, { color: real ? colors.success : colors.simulatedText }]}>{status}</Text>
            </View>
          </View>
        ))}
        <Muted>
          No diagnosis, cancer probability or risk score anywhere. The AI suggests patterns in
          research mode and abstains when unsure; the dermatologist reads, the clinician decides. No
          real patient images.
        </Muted>
      </Card>

      <Card>
        <Heading>How each capture is processed</Heading>
        {PIPELINE.map((step, i) => (
          <View key={step} style={styles.step}>
            <Text style={styles.stepNumber}>{i + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Heading>Evidence (simulated data only)</Heading>
        {EVIDENCE.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.part}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
        <Muted>
          This checks that the processing math and the models behave as intended under noise, LED
          drift and hand motion. The simulator and pipeline share one simplified optical model, so it is not
          clinical validation. Next: bench tests on physical phantoms, then ethics-approved imaging.
        </Muted>
      </Card>

      <Pressable onPress={() => void Linking.openURL('https://github.com/lan666as/spektroskin-proto')}>
        <Muted style={{ color: colors.accent, textAlign: 'center' }}>
          Source code, build log and validation report on GitHub
        </Muted>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 17, color: colors.text, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  part: { flex: 1, fontSize: 14, color: colors.text },
  value: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
  tag: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, maxWidth: '45%' },
  tagReal: { backgroundColor: colors.successSoft },
  tagSim: { backgroundColor: colors.simulatedBg },
  tagText: { fontSize: 12, fontWeight: '700' },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    color: colors.onAccent,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 14, color: colors.text },
});
