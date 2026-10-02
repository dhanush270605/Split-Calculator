import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatINR } from '@/lib/money';
import { label, radius, space, STATUS_TONE, Tone, toneColors, useTheme } from './theme';

export function Screen({ children, onRefresh, refreshing, scroll = true, padded = true }: {
  children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean; padded?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const style = { backgroundColor: t.bg, flex: 1 as const };
  if (!scroll) return <View style={[style, padded && { padding: space.lg }]}>{children}</View>;
  return (
    <ScrollView
      style={style} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: padded ? space.lg : 0, paddingBottom: insets.bottom + 40, gap: space.md, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Txt({ children, style, variant = 'body', tone, numberOfLines, ...rest }: {
  children?: React.ReactNode; style?: any; variant?: 'title' | 'h2' | 'h3' | 'body' | 'sub' | 'small' | 'big'; tone?: 'sub' | 'danger' | 'success' | 'primary'; numberOfLines?: number; accessibilityLabel?: string; selectable?: boolean;
}) {
  const t = useTheme();
  const base = { title: { fontSize: 26, fontWeight: '800' }, h2: { fontSize: 20, fontWeight: '700' }, h3: { fontSize: 16, fontWeight: '700' }, body: { fontSize: 15 }, sub: { fontSize: 14 }, small: { fontSize: 12 }, big: { fontSize: 30, fontWeight: '800' } }[variant] as any;
  const color = tone === 'sub' || variant === 'sub' || variant === 'small' ? t.sub : tone === 'danger' ? t.danger : tone === 'success' ? t.success : tone === 'primary' ? t.primary : t.text;
  return <Text numberOfLines={numberOfLines} style={[{ color }, base, style]} {...rest}>{children}</Text>;
}

export function Card({ children, style, onPress, tone }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; tone?: Tone }) {
  const t = useTheme();
  const accent = tone ? toneColors(t, tone).fg : undefined;
  const s: ViewStyle = { backgroundColor: t.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: t.border, gap: space.sm, ...(accent ? { borderLeftWidth: 4, borderLeftColor: accent } : {}) };
  if (onPress) return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.7 }, style]}>{children}</Pressable>;
  return <View style={[s, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: React.ReactNode; style?: ViewStyle; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Btn({ title, onPress, variant = 'primary', loading, disabled, icon, small }: {
  title: string; onPress: () => void | Promise<void>; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean; icon?: any; small?: boolean;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const off = disabled || loading || busy;
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : variant === 'secondary' ? t.muted : 'transparent';
  const fg = variant === 'primary' ? t.primaryText : variant === 'danger' ? '#fff' : variant === 'secondary' ? t.text : t.primary;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!off }} disabled={off}
      onPress={async () => { if (busy) return; setBusy(true); try { await onPress(); } finally { setBusy(false); } }} // guards against double-taps
      style={({ pressed }) => ({ backgroundColor: bg, borderRadius: radius.md, minHeight: small ? 38 : 48, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: off ? 0.5 : pressed ? 0.8 : 1 })}
    >
      {loading || busy ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label: lbl, error, hint, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Txt variant="sub" style={{ fontWeight: '600' }}>{lbl}</Txt>
      <TextInput
        accessibilityLabel={lbl} placeholderTextColor={t.sub}
        style={{ backgroundColor: t.input, color: t.text, borderWidth: 1, borderColor: error ? t.danger : t.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, minHeight: 48 }}
        {...rest}
      />
      {hint && !error ? <Txt variant="small">{hint}</Txt> : null}
      {error ? <Txt variant="small" tone="danger">{error}</Txt> : null}
    </View>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, multi, label: lbl }: {
  options: { value: T; label: string }[]; value: T | T[] | null; onChange: (v: any) => void; multi?: boolean; label?: string;
}) {
  const t = useTheme();
  const sel = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={{ gap: 6 }}>
      {lbl ? <Txt variant="sub" style={{ fontWeight: '600' }}>{lbl}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = sel(o.value);
          return (
            <Pressable
              key={String(o.value)} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ selected: on }} accessibilityLabel={o.label}
              onPress={() => onChange(multi ? (on ? (value as T[]).filter((x) => x !== o.value) : [...(value as T[]), o.value]) : o.value)}
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : t.card, minHeight: 40, justifyContent: 'center' }}
            >
              <Text style={{ color: on ? t.primaryText : t.text, fontWeight: '600' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone?: Tone }) {
  const t = useTheme();
  const c = toneColors(t, tone ?? STATUS_TONE[text] ?? 'neutral');
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '700' }}>{label(text)}</Text>
    </View>
  );
}

export function Money({ paise, signed, big, style }: { paise: number; signed?: boolean; big?: boolean; style?: any }) {
  const t = useTheme();
  const color = signed ? (paise > 0 ? t.success : paise < 0 ? t.danger : t.sub) : t.text;
  return <Text accessibilityLabel={formatINR(paise)} style={[{ color, fontWeight: '800', fontSize: big ? 28 : 16 }, style]}>{signed && paise > 0 ? '+' : ''}{formatINR(paise)}</Text>;
}

export function Loading() { return <View style={{ padding: 40 }}><ActivityIndicator size="large" /></View>; }

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card tone="danger">
      <Txt tone="danger" style={{ fontWeight: '700' }}>Something went wrong</Txt>
      <Txt variant="sub">{message}</Txt>
      {onRetry ? <Btn title="Try again" variant="secondary" small onPress={onRetry} /> : null}
    </Card>
  );
}

export function Empty({ icon = 'file-tray-outline', title, hint }: { icon?: any; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <Ionicons name={icon} size={40} color={t.sub} />
      <Txt variant="h3">{title}</Txt>
      {hint ? <Txt variant="sub" style={{ textAlign: 'center' }}>{hint}</Txt> : null}
    </View>
  );
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return <View style={{ backgroundColor: c.bg, padding: 12, borderRadius: radius.md }}><Text style={{ color: c.fg, fontWeight: '600' }}>{text}</Text></View>;
}

export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}><Txt variant="h3">{children}</Txt>{action}</Row>;
}

export function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Txt variant="sub" style={{ flex: 1 }}>{k}</Txt>
      <View style={{ flex: 2, alignItems: 'flex-end' }}>{typeof v === 'string' || typeof v === 'number' ? <Txt style={{ textAlign: 'right' }}>{String(v)}</Txt> : v}</View>
    </Row>
  );
}

/** Cross-platform confirm (Alert.alert has no buttons on web). */
export function confirm(title: string, message: string, okLabel = 'Confirm'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  return new Promise((resolve) => Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: okLabel, onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
}
export function notice(title: string, message: string) {
  if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`); return; }
  Alert.alert(title, message);
}

export const shortDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const shortDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
