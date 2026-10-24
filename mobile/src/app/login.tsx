import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/api/session';
import { Button, Card, ErrorBanner, Field, Muted, Screen, Title } from '@/ui/components';
import { SimulatedBadge } from '@/ui/SimulatedBadge';
import { colors, spacing } from '@/ui/theme';

export default function Login() {
  const router = useRouter();
  const { ready, user, signIn } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (ready && user) return <Redirect href="/" />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signIn(username.trim(), password);
      router.replace(signedIn.role === 'dermatologist' ? '/review' : '/patients');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.brand}>
        <Title>SpektroSkin</Title>
        <Text style={styles.tagline}>A second look shouldn't require a second hospital.</Text>
        <SimulatedBadge label="Research prototype · optical module simulated" />
      </View>
      <Card>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { gap: spacing.sm, paddingTop: spacing.xl },
  tagline: { fontSize: 16, color: colors.textMuted },
});
