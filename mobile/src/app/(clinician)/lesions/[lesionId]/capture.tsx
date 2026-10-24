import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { uploadCapture } from '@/api/uploadCapture';
import type { FrameName } from '@/device/CaptureDevice';
import { PHANTOMS } from '@/device/phantoms.generated';
import { AUTO, captureDevice } from '@/device/VirtualCaptureDevice';
import { useSync } from '@/sync/SyncProvider';
import { Button, Card, Chips, ErrorBanner, Heading, Muted, Row, Screen } from '@/ui/components';
import { patientLabel, siteLabel } from '@/ui/labels';
import { MultispectralCapture } from '@/ui/MultispectralCapture';
import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, radius, spacing } from '@/ui/theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'capturing'; index: number; total: number }
  | { kind: 'processing'; uploaded: number }
  | { kind: 'queued' };

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
  const sync = useSync();
  const [frames, setFrames] = useState<Partial<Record<FrameName, ImageSourcePropType>>>({});
  const [firing, setFiring] = useState<FrameName | null>(null);

  async function capture() {
    setError(null);
    setFrames({});
    let frameSet;
    try {
      captureDevice.aimAt(lesionId);
      frameSet = await captureDevice.capture((progress) => {
        setPhase({ kind: 'capturing', index: progress.index, total: progress.total });
        if (progress.state === 'firing') {
          setFiring(progress.step);
        } else {
          setFiring(null);
          const preview = progress.preview;
          if (preview) setFrames((f) => ({ ...f, [progress.step]: preview }));
        }
      });
      setFiring(null);
      setPhase({ kind: 'processing', uploaded: 0 });
      const result = await uploadCapture(frameSet, lesionId, (uploaded) =>
        setPhase({ kind: 'processing', uploaded }),
      );
      queryClient.invalidateQueries({ queryKey: ['lesion', lesionId] });
      router.replace({ pathname: '/captures/[captureId]', params: { captureId: result.id } });
    } catch (e) {
      const offline = e instanceof ApiError && e.status === 0;
      if (offline && frameSet && (await sync.enqueue(frameSet, lesionId))) {
        setPhase({ kind: 'queued' });
        return;
      }
      setError(e);
      setPhase({ kind: 'idle' });
    }
  }

  const busy = phase.kind === 'capturing' || phase.kind === 'processing';

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
          Device {status.deviceId}. Each capture is a new synthetic frame set of this lesion (fresh
          noise and hand motion), not a real optical module.
        </Muted>
      </Card>

      <Card>
        <MultispectralCapture frames={frames} firing={firing} processing={phase.kind === 'processing'} />
        <Muted testID="capture-status" style={{ textAlign: 'center' }}>
          {phase.kind === 'capturing'
            ? `Capturing frame ${phase.index + 1} of ${phase.total}: four LED bands, then a dark frame`
            : phase.kind === 'processing'
              ? phase.uploaded < 1
                ? `Uploading frames… ${Math.round(phase.uploaded * 100)}%`
                : 'Checking quality and computing spectral views…'
              : phase.kind === 'queued'
                ? 'Could not reach the server, so the capture is saved on this phone. It uploads automatically when the connection is back; results appear after upload.'
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
            options={[
              { value: AUTO, label: 'auto: new simulated capture of this lesion' },
              ...PHANTOMS.map((p) => ({ value: p.id, label: p.id })),
            ]}
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
  devToggle: { alignSelf: 'center', padding: spacing.sm, borderRadius: radius.sm },
});
