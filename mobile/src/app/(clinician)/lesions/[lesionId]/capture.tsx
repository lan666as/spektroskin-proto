import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { uploadCapture } from '@/api/uploadCapture';
import { type CaptureProgress, FRAME_NAMES } from '@/device/CaptureDevice';
import { PHANTOMS } from '@/device/phantoms.generated';
import { captureDevice } from '@/device/VirtualCaptureDevice';
import { Button, Card, Chips, ErrorBanner, Heading, Muted, Row, Screen } from '@/ui/components';
import { patientLabel, siteLabel } from '@/ui/labels';
import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, radius, spacing } from '@/ui/theme';

const STEP_LABELS: Record<string, string> = {
  blue: 'Blue LED · 470 nm',
  green: 'Green LED · 550 nm',
  red: 'Red LED · 660 nm',
  nir: 'Near-infrared LED · 850 nm',
  dark: 'Dark frame · LEDs off',
};

type Phase = { kind: 'idle' } | { kind: 'capturing'; progress: CaptureProgress } | { kind: 'processing' };

export default function CaptureScreen() {
  const { lesionId } = useLocalSearchParams<{ lesionId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lesion = useQuery({ queryKey: ['lesion', lesionId], queryFn: () => api.lesion(lesionId) });
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<unknown>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [phantom, setPhantom] = useState(captureDevice.selectedPhantom());
  const status = captureDevice.status();

  async function capture() {
    setError(null);
    try {
      const frameSet = await captureDevice.capture((progress) => setPhase({ kind: 'capturing', progress }));
      setPhase({ kind: 'processing' });
      const result = await uploadCapture(frameSet, lesionId);
      queryClient.invalidateQueries({ queryKey: ['lesion', lesionId] });
      router.replace({ pathname: '/captures/[captureId]', params: { captureId: result.id } });
    } catch (e) {
      setError(e);
      setPhase({ kind: 'idle' });
    }
  }

  const busy = phase.kind !== 'idle';
  const stepIndex = phase.kind === 'capturing' ? phase.progress.index : phase.kind === 'processing' ? FRAME_NAMES.length : -1;

  return (
    <Screen testID="capture-screen">
      <Stack.Screen options={{ title: 'Capture' }} />
      {lesion.data ? (
        <Muted>
          {patientLabel(lesion.data.patient)} · {siteLabel(lesion.data)}
        </Muted>
      ) : null}
      <Card testID="device-card">
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <View style={[styles.dot, { backgroundColor: status.connected ? colors.success : colors.danger }]} />
            <Heading>
              {status.label} {status.connected ? 'connected' : 'disconnected'}
            </Heading>
          </Row>
          <SimulatedBadge />
        </Row>
        <Muted>
          Device {status.deviceId}. Frames come from synthetic phantoms, not a real optical module.
        </Muted>
      </Card>

      <Card>
        {FRAME_NAMES.map((name, i) => (
          <Row key={name}>
            <View
              style={[
                styles.step,
                i < stepIndex && styles.stepDone,
                i === stepIndex && phase.kind === 'capturing' && styles.stepActive,
              ]}
            />
            <Text style={[styles.stepText, i === stepIndex && { fontWeight: '700' }]}>{STEP_LABELS[name]}</Text>
          </Row>
        ))}
        <Muted testID="capture-status">
          {phase.kind === 'capturing'
            ? `Capturing ${phase.progress.index + 1} of ${phase.progress.total}…`
            : phase.kind === 'processing'
              ? 'Checking quality and computing spectral views…'
              : 'Place the spacer flat on the lesion, then capture.'}
        </Muted>
      </Card>

      <ErrorBanner error={error} />
      <Button label="Capture" onPress={capture} busy={busy} testID="capture-button" />

      <Pressable onPress={() => setDevOpen((v) => !v)} style={styles.devToggle} testID="dev-toggle">
        <Muted>{devOpen ? 'Hide developer options' : '···'}</Muted>
      </Pressable>
      {devOpen ? (
        <Card>
          <Muted>Developer: phantom returned by the virtual module</Muted>
          <Chips
            options={PHANTOMS.map((p) => ({ value: p.id, label: p.id }))}
            value={phantom}
            onChange={(id) => {
              captureDevice.selectPhantom(id);
              setPhantom(id);
            }}
            testIDPrefix="phantom"
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  step: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border },
  stepDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  stepText: { fontSize: 15, color: colors.text },
  devToggle: { alignSelf: 'center', padding: spacing.sm, borderRadius: radius.sm },
});
