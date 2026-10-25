import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, shadow, spacing, touchTarget, type } from './theme';

export function Screen({
  children,
  wide = false,
  testID,
  onRefresh,
  footer,
}: {
  children: ReactNode;
  wide?: boolean;
  testID?: string;
  /** Enables pull-to-refresh. */
  onRefresh?: () => Promise<unknown>;
  /** Pinned below the scrolling content, e.g. the screen's main action. */
  footer?: ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  const scroll = (
    <ScrollView
      refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, { maxWidth: wide ? 1200 : 640 }]}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </ScrollView>
  );
  if (!footer) return scroll;
  return (
    <View style={{ flex: 1 }}>
      {scroll}
      <View style={styles.footer}>
        <View style={{ width: '100%', maxWidth: wide ? 1200 : 640, alignSelf: 'center' }}>{footer}</View>
      </View>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Muted({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: object;
  testID?: string;
}) {
  return (
    <Text style={[styles.muted, style]} testID={testID}>
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'onDark';
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'onDark' && styles.buttonOnDark,
        (pressed || inactive) && { opacity: inactive ? 0.5 : 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'onDark' ? colors.accent : colors.onAccent} />
      ) : (
        <Text
          style={[styles.buttonText, (variant === 'secondary' || variant === 'onDark') && { color: colors.accent }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        style={[styles.input, input.multiline && { minHeight: 96, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  label?: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }) {
  const palette = {
    neutral: [colors.surface, colors.textMuted],
    info: [colors.accentSoft, colors.accent],
    success: [colors.successSoft, colors.success],
    danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette[0] }]}>
      <Text style={[styles.pillText, { color: palette[1] }]}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <View style={styles.error} accessibilityRole="alert" testID="error-banner">
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Muted>{label}</Muted>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Muted>{children}</Muted>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  right,
  left,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Shown before the title, e.g. an Avatar. */
  left?: ReactNode;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.listItem, pressed && { backgroundColor: colors.surface }]}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {right}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/** Initials in a tinted circle, as in the Figma patient list. */
export function Avatar({ label, tone = 'info' }: { label: string; tone?: 'info' | 'danger' | 'success' | 'neutral' }) {
  const [bg, fg] = {
    info: [colors.accentSoft, colors.accent],
    danger: [colors.dangerSoft, colors.danger],
    success: [colors.successSoft, colors.success],
    neutral: [colors.surface, colors.textMuted],
  }[tone];
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Small uppercase label above a group, as in the Figma mocks ("RECENT RESULTS"). */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  footer: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  screenContent: {
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  title: { ...type.title, color: colors.text },
  heading: { ...type.heading, color: colors.text },
  muted: { ...type.small, color: colors.textMuted },
  card: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 0,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonSecondary: { backgroundColor: colors.accentSoft },
  buttonOnDark: { backgroundColor: colors.background },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '700', letterSpacing: 0.1 },
  field: { gap: spacing.xs },
  label: { ...type.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    minHeight: touchTarget,
    borderWidth: 0,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: '#E8EDF4',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    maxWidth: '100%',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  chipTextSelected: { color: colors.onAccent, fontWeight: '600' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: 14 },
  loading: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  kvLabel: { ...type.small, color: colors.textMuted },
  kvValue: { fontSize: 14, color: colors.text, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  listItem: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 0,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  chevron: { fontSize: 22, color: '#A9B4C4', marginLeft: -4 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
});
