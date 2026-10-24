import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from './theme';

/** Required on every simulated element (CLAUDE.md §2): device status, spectral views, phantoms. */
export function SimulatedBadge({ label = 'Simulated' }: { label?: string }) {
  return (
    <View style={styles.badge} accessibilityRole="text" testID="simulated-badge">
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.simulatedBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: { color: colors.simulatedText, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
});
