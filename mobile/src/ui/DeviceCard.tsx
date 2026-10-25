import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { captureDevice } from '@/device/VirtualCaptureDevice';

import { Card, Muted, Row } from './components';
import { SimulatedBadge } from './SimulatedBadge';
import { colors, spacing } from './theme';

/** The SK-2 module as the pitch deck shows it; tonight it is the virtual module. */
export function DeviceCard({ children }: { children?: ReactNode }) {
  const status = captureDevice.status();
  return (
    <Card testID="device-card">
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Row>
          <View style={[styles.dot, { backgroundColor: status.connected ? colors.success : colors.danger }]} />
          <Text style={styles.name}>{status.label}</Text>
        </Row>
        <SimulatedBadge />
      </Row>
      <Muted>
        {status.connected ? 'Connected' : 'Disconnected'} · White light (polarized) · NIR 850 nm · pigment
        contrast · 50–100× · device {status.deviceId}
      </Muted>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: 17, fontWeight: '700', color: colors.text, marginLeft: spacing.xs },
});
