import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, touchTarget, type } from './theme';

export function Screen({
  children,
  wide = false,
  testID,
}: {
  children: ReactNode;
  wide?: boolean;
  testID?: string;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, { maxWidth: wide ? 1200 : 640 }]}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </ScrollView>
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
  variant?: 'primary' | 'secondary' | 'danger';
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
        (pressed || inactive) && { opacity: inactive ? 0.5 : 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.accent : colors.onAccent} />
      ) : (
        <Text
          style={[styles.buttonText, variant === 'secondary' && { color: colors.accent }]}
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
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
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
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.accent },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
  field: { gap: spacing.xs },
  label: { ...type.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    maxWidth: '100%',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  chipTextSelected: { color: colors.onAccent, fontWeight: '600' },
  pill: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
});
