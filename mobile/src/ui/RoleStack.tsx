import { Redirect, Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { User } from '@/api/client';
import { useSession } from '@/api/session';

import { Loading } from './components';
import { colors, spacing } from './theme';

type Link = { label: string; href: '/cases' | '/patients' | '/review' | '/audit'; testID: string };

// Below this width the header has no room for a title plus links (the demo's phone-sized window),
// so navigation moves to a bottom bar.
const WIDE_LAYOUT = 700;

/** Stack navigator for one role: redirects anyone else, adds navigation links and sign-out. */
export function RoleStack({ role, links }: { role: User['role']; links: Link[] }) {
  const { ready, user, signOut } = useSession();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href="/" />;

  const items = [
    ...links.map((link) => ({ ...link, onPress: () => router.navigate(link.href), muted: false })),
    {
      label: 'Sign out',
      testID: 'sign-out',
      muted: true,
      onPress: async () => {
        await signOut();
        router.replace('/login');
      },
    },
  ];
  const wide = width >= WIDE_LAYOUT;

  const headerRight = () => (
    <View style={styles.headerActions}>
      {items.map((item) => (
        <Pressable key={item.testID} onPress={item.onPress} style={styles.headerAction} testID={item.testID}>
          <Text style={[styles.actionText, item.muted && styles.muted]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.fill}>
      <Stack
        screenOptions={{
          headerRight: wide ? headerRight : undefined,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      {wide ? null : (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom }]}>
          {items.map((item) => (
            <Pressable
              key={item.testID}
              onPress={item.onPress}
              style={styles.bottomItem}
              accessibilityRole="button"
              testID={item.testID}
            >
              <Text style={[styles.actionText, item.muted && styles.muted]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.xs, marginRight: spacing.sm },
  headerAction: { minHeight: 44, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  actionText: { color: colors.accent, fontWeight: '600', fontSize: 15 },
  muted: { color: colors.textMuted },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  bottomItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});
