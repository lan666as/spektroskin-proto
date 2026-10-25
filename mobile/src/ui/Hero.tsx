import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow, spacing } from './theme';

/** Navy panel in the pitch deck's style, with two soft rings for depth. */
export function Hero({ eyebrow, title, subtitle, children }: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <View style={[styles.ring, styles.ringLarge]} />
      <View style={[styles.ring, styles.ringSmall]} />
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    overflow: 'hidden',
    ...shadow,
  },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 28 },
  ringLarge: { width: 220, height: 220, right: -70, top: -90, borderColor: 'rgba(27, 95, 170, 0.45)' },
  ringSmall: { width: 120, height: 120, right: 40, bottom: -70, borderColor: 'rgba(18, 164, 160, 0.30)' },
  eyebrow: { color: '#7FB2E8', fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: colors.onAccent, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.onNavyMuted, fontSize: 15, lineHeight: 21 },
});
