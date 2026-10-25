import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { ApiError } from '@/api/client';
import { SessionProvider } from '@/api/session';
import { SyncProvider } from '@/sync/SyncProvider';
import { colors } from '@/ui/theme';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry transient failures only; 4xx answers will not change on retry.
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        staleTime: 2_000,
      },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <SyncProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.canvas },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="about" options={{ title: 'About this prototype' }} />
          <Stack.Screen name="ai-roadmap" options={{ title: 'AI roadmap' }} />
          <Stack.Screen name="(clinician)" options={{ headerShown: false }} />
          <Stack.Screen name="(reviewer)" options={{ headerShown: false }} />
        </Stack>
        </SyncProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
