import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { absoluteUrl } from '@/api/config';

import { Card, Heading, Muted, Row } from './components';
import { ACTION_LABELS } from './labels';
import { HISTO_LABELS, OUTCOME_LABELS } from './outcome';
import { SimulatedBadge } from './SimulatedBadge';
import { colors, radius, spacing } from './theme';
import { PATTERN_LABELS } from './triage';

/**
 * Reviewed lesions nearest in pigment and blood statistics, with what was recommended and what
 * histopathology found. Retrieval for context, not a prediction.
 */
export function SimilarCases({ caseId }: { caseId: string }) {
  const router = useRouter();
  const query = useQuery({ queryKey: ['similar', caseId], queryFn: () => api.similarCases(caseId) });
  if (!query.data?.length) return null;
  return (
    <Card testID="similar-cases">
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Heading>Similar reviewed lesions</Heading>
        <SimulatedBadge />
      </Row>
      {query.data.map((s) => (
        <Pressable
          key={s.case_id}
          style={styles.row}
          onPress={() => router.push({ pathname: '/review/[caseId]', params: { caseId: s.case_id } })}
          testID={`similar-${s.case_id}`}
        >
          {s.thumbnail_url ? <Image source={{ uri: absoluteUrl(s.thumbnail_url) }} style={styles.thumb} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>
              {s.patient_code} · {s.site.replace('_', ' ')} · Fitzpatrick {s.fitzpatrick}
            </Text>
            <Text style={styles.detail}>
              {s.review_action ? `Recommended: ${ACTION_LABELS[s.review_action]}` : 'Not reviewed'}
              {s.pattern_read && s.pattern_read !== 'unsure' ? ` · read as ${PATTERN_LABELS[s.pattern_read]}` : ''}
            </Text>
            <Text style={[styles.detail, s.histopathology && s.histopathology !== 'pending' ? styles.histo : null]}>
              {s.outcome_action
                ? `${OUTCOME_LABELS[s.outcome_action]}${s.histopathology ? ` · ${HISTO_LABELS[s.histopathology]}` : ''}`
                : 'No outcome recorded yet'}
            </Text>
          </View>
          <Text style={styles.distance}>d = {s.distance.toFixed(2)}</Text>
        </Pressable>
      ))}
      <Muted>
        Nearest by the same pigment and blood statistics the triage model reads, among reviewed cases
        in this system (all simulated). Shown for context; it is not a prediction.
      </Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  detail: { fontSize: 13, color: colors.textMuted },
  histo: { color: colors.text, fontWeight: '700' },
  distance: { fontSize: 12, color: colors.textMuted },
});
