import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { Button, Empty, ErrorBanner, Loading, Muted, Screen } from '@/ui/components';
import { formatDateTime } from '@/ui/labels';
import { colors, spacing } from '@/ui/theme';

export default function AuditLog() {
  const audit = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) => api.audit(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1].at : undefined),
  });
  const events = audit.data?.pages.flat() ?? [];

  return (
    <Screen wide testID="audit-screen">
      <Stack.Screen options={{ title: 'Audit log' }} />
      <Muted>Every read and write of patient data, newest first.</Muted>
      <ErrorBanner error={audit.error} />
      {audit.isPending ? <Loading /> : null}
      {!audit.isPending && events.length === 0 ? <Empty>No events yet.</Empty> : null}
      {events.map((e) => (
        <View key={e.id} style={styles.row} testID="audit-row">
          <Text style={styles.time}>{formatDateTime(e.at)}</Text>
          <Text style={styles.text}>
            <Text style={{ fontWeight: '600' }}>{e.actor}</Text> ({e.actor_role}) · {e.action}{' '}
            {e.entity_type} <Text style={styles.id}>{e.entity_id}</Text>
          </Text>
        </View>
      ))}
      {audit.hasNextPage ? (
        <Button
          label="Load older"
          variant="secondary"
          onPress={() => void audit.fetchNextPage()}
          busy={audit.isFetchingNextPage}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  time: { fontSize: 12, color: colors.textMuted },
  text: { fontSize: 14, color: colors.text },
  id: { fontSize: 12, color: colors.textMuted },
});
