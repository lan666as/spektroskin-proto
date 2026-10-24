import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, spacing, type } from '@/ui/theme';

export default function Index() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'SpektroSkin' }} />
      <Text style={styles.title}>SpektroSkin</Text>
      <Text style={styles.subtitle}>Research prototype · optical module simulated</Text>
      <SimulatedBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, gap: spacing.md, backgroundColor: colors.background },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted },
});
