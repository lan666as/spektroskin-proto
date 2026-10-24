import { Redirect, Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { User } from '@/api/client';
import { useSession } from '@/api/session';

import { Loading } from './components';
import { colors, spacing } from './theme';

type Link = { label: string; href: '/cases' | '/patients' | '/review'; testID: string };

/** Stack navigator for one role: redirects anyone else, adds header links and sign-out. */
export function RoleStack({ role, links }: { role: User['role']; links: Link[] }) {
  const { ready, user, signOut } = useSession();
  const router = useRouter();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href="/" />;

  const headerRight = () => (
    <View style={styles.actions}>
      {links.map((link) => (
        <Pressable
          key={link.href}
          onPress={() => router.navigate(link.href)}
          style={styles.action}
          testID={link.testID}
        >
          <Text style={styles.actionText}>{link.label}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
        style={styles.action}
        testID="sign-out"
      >
        <Text style={[styles.actionText, { color: colors.textMuted }]}>Sign out</Text>
      </Pressable>
    </View>
  );

  return (
    <Stack
      screenOptions={{
        headerRight,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.xs, marginRight: spacing.sm },
  action: { minHeight: 44, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  actionText: { color: colors.accent, fontWeight: '600', fontSize: 15 },
});
