import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { User } from '@/api/client';
import { useSession } from '@/api/session';
import { Button, Card, Chips, ErrorBanner, Field, Muted, Screen } from '@/ui/components';
import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, spacing } from '@/ui/theme';

export default function Login() {
  const router = useRouter();
  const { ready, user, signIn, signInDemo } = useSession();
  // ?as=clinician or ?as=dermatologist: a shareable link that signs straight in (demo only).
  const { as } = useLocalSearchParams<{ as?: string }>();
  const linkRole = as === 'clinician' || as === 'dermatologist' ? as : null;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (ready && !user && linkRole) void enter(() => signInDemo(linkRole));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, linkRole]);

  if (ready && user) return <Redirect href={user.role === 'dermatologist' ? '/review' : '/patients'} />;

  async function enter(attempt: () => Promise<User>) {
    setBusy(true);
    setError(null);
    try {
      const signedIn = await attempt();
      router.replace(signedIn.role === 'dermatologist' ? '/review' : '/patients');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const submit = () => enter(() => signIn(username.trim(), password));

  return (
    <Screen>
      <View style={styles.brand}>
        <Image source={require('@/assets/images/icon.png')} style={styles.icon} accessibilityLabel="SpektroSkin" />
        <Text style={styles.eyebrow}>AFFORDABLE, AI-ASSISTED SKIN CANCER ASSESSMENT</Text>
        <Text style={styles.name}>SpektroSkin</Text>
        <Text style={styles.tagline}>A second look shouldn't require a second visit.</Text>
        <SimulatedBadge label="Research prototype · optical module simulated" />
      </View>
      <Card testID="demo-login">
        <Text style={styles.demoTitle}>Try the demo in one tap</Text>
        <Muted>No password needed. Both roles share the same synthetic demo data.</Muted>
        <Button
          label="Open as clinician (phone app)"
          onPress={() => enter(() => signInDemo('clinician'))}
          busy={busy}
          testID="demo-clinician"
        />
        <Button
          label="Open as dermatologist (review portal)"
          variant="secondary"
          onPress={() => enter(() => signInDemo('dermatologist'))}
          busy={busy}
          testID="demo-dermatologist"
        />
      </Card>
      <Card>
        <Chips
          label="Or sign in with a password as"
          options={[
            { value: 'clinician', label: 'Clinician' },
            { value: 'dermatologist', label: 'Dermatologist' },
          ]}
          value={username === 'clinician' || username === 'dermatologist' ? username : null}
          onChange={setUsername}
          testIDPrefix="role"
        />
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          testID="login-username"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          testID="login-password"
        />
        <ErrorBanner error={error} />
        <Button
          label="Sign in"
          onPress={submit}
          busy={busy}
          disabled={!username || !password}
          testID="login-submit"
        />
        <Muted>Demo auth for the prototype: two demo roles, clinician and dermatologist.</Muted>
      </Card>
      <Button label="About this prototype" variant="secondary" onPress={() => router.push('/about')} testID="open-about" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxl, paddingBottom: spacing.sm },
  icon: { width: 96, height: 96, borderRadius: 24, marginBottom: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' },
  name: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  tagline: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xs },
  demoTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
});
