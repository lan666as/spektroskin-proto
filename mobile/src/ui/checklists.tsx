import { StyleSheet, Text, View } from 'react-native';

import type { BodySite, Capture } from '@/api/client';

import { Card, Heading, Muted, Pill, Row } from './components';
import { isAcral } from './labels';
import { SimulatedBadge } from './SimulatedBadge';
import { colors, radius, spacing } from './theme';

type Checklists = NonNullable<Capture['checklists']>;
type Abcd = NonNullable<Checklists['abcd']>;

export const TDS_LABELS: Record<Abcd['category'], { label: string; tone: 'success' | 'info' | 'danger' }> = {
  benign: { label: 'Benign range (TDS < 4.75)', tone: 'success' },
  suspicious: { label: 'Suspicious (TDS 4.75–5.45)', tone: 'info' },
  highly_suspicious: { label: 'Highly suspicious for melanoma (TDS > 5.45)', tone: 'danger' },
};

const BRAAFF_ITEMS: Record<string, string> = {
  irregular_blotch: 'Irregular blotch',
  ridge_pattern: 'Parallel ridge pattern',
  asymmetry_of_structures: 'Asymmetry of structures',
  asymmetry_of_colours: 'Asymmetry of colours',
  parallel_furrow_pattern: 'Parallel furrow pattern',
  fibrillar_pattern: 'Fibrillar pattern',
};

export function checklistSummary(c: Checklists | null | undefined, site?: BodySite): string | null {
  if (!c) return null;
  if (!c.applicable) return 'Checklists: not applicable (not pigmented)';
  const parts = [c.abcd ? `TDS ${c.abcd.tds.toFixed(2)} ${c.abcd.category.replace('_', ' ')}` : null];
  if (c.braaff && site && isAcral(site)) {
    parts.push(`BRAAFF ${c.braaff.score} ${c.braaff.suspicious ? 'suspicious' : 'not met'}`);
  }
  return `Checklists: ${parts.filter(Boolean).join(' · ')}`;
}

/**
 * Published melanoma checklists (ABCD rule, and BRAAFF on acral sites), scored automatically from
 * the pigment and blood maps. Decision support with published thresholds, never a probability.
 */
export function ChecklistCard({ capture, site }: { capture: Capture; site: BodySite }) {
  const c = capture.checklists;
  if (!c) return null;
  const acral = isAcral(site) && c.braaff;
  return (
    <Card testID="checklists">
      <Heading>Melanoma checklists</Heading>
      <View style={styles.badges}>
        <View style={styles.support}>
          <Text style={styles.supportText}>Automated · decision support · not a diagnosis</Text>
        </View>
        <SimulatedBadge />
      </View>
      {!c.applicable ? (
        <Muted testID="checklists-na">
          Not applicable: {c.reason}. These checklists are for pigmented (melanocytic) lesions.
        </Muted>
      ) : null}
      {c.abcd ? (
        <View style={styles.block} testID="abcd">
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Text style={styles.title}>ABCD rule (Stolz)</Text>
            <Text style={styles.score} testID="tds">
              TDS {c.abcd.tds.toFixed(2)}
            </Text>
          </Row>
          <Pill label={TDS_LABELS[c.abcd.category].label} tone={TDS_LABELS[c.abcd.category].tone} />
          <Item label="A · asymmetric axes (× 1.3)" value={`${c.abcd.asymmetry_axes} of 2`} />
          <Item label="B · abrupt border segments (× 0.1)" value={`${c.abcd.abrupt_border_segments} of 8`} />
          <Item label="C · colours (× 0.5)" value={c.abcd.colours.join(', ') || 'none'} />
          <Item label="D · structures (× 0.5)" value={c.abcd.structures.join(', ')} />
        </View>
      ) : null}
      {acral && c.braaff ? (
        <View style={styles.block} testID="braaff">
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Text style={styles.title}>BRAAFF (acral)</Text>
            <Text style={styles.score} testID="braaff-score">
              Score {c.braaff.score}
            </Text>
          </Row>
          <Pill
            label={c.braaff.suspicious ? 'Meets the criterion for suspected acral melanoma (≥ 1)' : 'Criterion not met (< 1)'}
            tone={c.braaff.suspicious ? 'danger' : 'success'}
          />
          {Object.entries(c.braaff.items).map(([key, points]) => (
            <Item
              key={key}
              label={BRAAFF_ITEMS[key] ?? key}
              value={c.braaff!.not_assessed.includes(key) ? 'not assessed' : points > 0 ? `+${points}` : String(points)}
            />
          ))}
        </View>
      ) : null}
      {c.applicable && ((c.abcd && c.abcd.category !== 'benign') || (acral && c.braaff?.suspicious)) ? (
        <Text style={styles.action} testID="checklist-action">
          A published threshold is met: consider dermatologist review and biopsy.
        </Text>
      ) : null}
      <Muted>
        Weights and thresholds as published (ABCD: Stolz 1994, Nachbar 1994; BRAAFF: Lallas 2015).
        Each item is read automatically from simulated images, so the scores are decision support for
        the dermatologist, not a validated diagnosis and not a probability.
      </Muted>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <Text style={styles.itemLabel}>{label}</Text>
      <Text style={styles.itemValue}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, width: '100%' },
  support: { backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  supportText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  block: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  score: { fontSize: 20, fontWeight: '800', color: colors.text },
  itemLabel: { fontSize: 14, color: colors.textMuted, flex: 1 },
  itemValue: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right', flexShrink: 1 },
  action: { fontSize: 14, fontWeight: '700', color: colors.danger },
});
