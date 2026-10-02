import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Image, ImageStyle, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TextInputProps, useWindowDimensions, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchAttachmentUri } from '@/lib/api';
import { formatINR } from '@/lib/money';
import { label, radius, space, STATUS_TONE, Tone, toneColors, useTheme } from './theme';

// ─── Helper ───────────────────────────────────────────────────────────────────
/** Cross-platform shadow — uses boxShadow on web (avoids React Native Web deprecation). */
function shadow(color: string, opacity: number, y: number, blur: number, elevation: number): ViewStyle {
  if (Platform.OS === 'web') {
    return { boxShadow: `0 ${y}px ${blur}px rgba(0,0,0,${opacity})` } as any;
  }
  return { shadowColor: color, shadowOffset: { width: 0, height: y }, shadowOpacity: opacity, shadowRadius: blur / 2, elevation };
}

// ─── Screen Container ─────────────────────────────────────────────────────────
export function Screen({
  children, onRefresh, refreshing, scroll = true, padded = true, maxWidth = 960, style: customStyle,
}: {
  children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean;
  scroll?: boolean; padded?: boolean; maxWidth?: number; style?: ViewStyle;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const bgStyle: ViewStyle = { backgroundColor: t.bg, flex: 1 };
  const hPad = padded ? (isWide ? space.xl : space.lg) : 0;
  const bottomPad = isWide ? insets.bottom + 32 : insets.bottom + 96;

  if (!scroll) {
    return (
      <View style={[bgStyle, { paddingHorizontal: hPad }, customStyle]}>
        <View style={{ maxWidth, width: '100%', alignSelf: 'center', flex: 1 }}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={bgStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: hPad,
        paddingTop: space.md,
        paddingBottom: bottomPad,
        gap: space.md,
        maxWidth,
        width: '100%',
        alignSelf: 'center',
      }}
      refreshControl={
        onRefresh
          ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.primary} colors={[t.primary]} />
          : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

// ─── Screen Header ────────────────────────────────────────────────────────────
export function ScreenHeader({ title, subtitle, onBack, right, breadcrumbs }: {
  title: string; subtitle?: string; onBack?: () => void;
  right?: React.ReactNode; breadcrumbs?: string[];
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, marginBottom: space.sm }}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Row style={{ flexWrap: 'wrap', gap: 4 }}>
          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <Txt variant="small" tone="sub">/</Txt>}
              <Txt variant="small" tone={idx === breadcrumbs.length - 1 ? 'primary' : 'sub'} style={{ fontWeight: '600' }}>{b}</Txt>
            </React.Fragment>
          ))}
        </Row>
      ) : null}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Row style={{ gap: space.md, flex: 1 }}>
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: radius.md,
                backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: t.border, opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="arrow-back" size={20} color={t.text} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Txt variant="h2" style={{ fontWeight: '800' }}>{title}</Txt>
            {subtitle ? <Txt variant="sub" tone="sub">{subtitle}</Txt> : null}
          </View>
        </Row>
        {right}
      </Row>
    </View>
  );
}

// ─── Typography ───────────────────────────────────────────────────────────────
export function Txt({
  children, style, variant = 'body', tone, numberOfLines, selectable, ...rest
}: {
  children?: React.ReactNode; style?: any;
  variant?: 'title' | 'h1' | 'h2' | 'h3' | 'body' | 'sub' | 'small' | 'caption' | 'big' | 'mono';
  tone?: 'sub' | 'danger' | 'success' | 'primary' | 'accent' | 'action' | 'warn' | 'muted';
  numberOfLines?: number; selectable?: boolean; accessibilityLabel?: string;
}) {
  const t = useTheme();
  const fontStyles: Record<string, any> = {
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    h1:    { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
    h2:    { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    h3:    { fontSize: 16, fontWeight: '700' },
    body:  { fontSize: 15, lineHeight: 22 },
    sub:   { fontSize: 14, lineHeight: 20 },
    small: { fontSize: 12, lineHeight: 17 },
    caption: { fontSize: 12, lineHeight: 17 },
    big:   { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
    mono:  { fontSize: 15, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '700' },
  };

  let color = t.text;
  if (tone === 'sub' || variant === 'sub' || variant === 'small' || variant === 'caption') color = t.textSub;
  if (tone === 'muted') color = t.textMuted;
  if (tone === 'danger') color = t.danger;
  if (tone === 'success') color = t.success;
  if (tone === 'primary') color = t.primary;
  if (tone === 'accent') color = t.accent;
  if (tone === 'action') color = t.action;
  if (tone === 'warn') color = t.warn;

  return (
    <Text numberOfLines={numberOfLines} selectable={selectable} style={[{ color }, fontStyles[variant], style]} {...rest}>
      {children}
    </Text>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  children, style, onPress, tone, gradient = false,
}: {
  children: React.ReactNode; style?: ViewStyle; onPress?: () => void; tone?: Tone; gradient?: boolean;
}) {
  const t = useTheme();
  const accent = tone ? toneColors(t, tone).fg : undefined;

  const cardStyle: ViewStyle = {
    backgroundColor: t.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: t.border,
    gap: space.sm,
    ...shadow('#000', Platform.OS === 'web' ? 0.06 : 0.04, 2, 8, 2),
    ...(accent ? { borderLeftWidth: 4, borderLeftColor: accent } : {}),
  };

  if (gradient) {
    const inner = (
      <LinearGradient
        colors={t.gradientCard as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[cardStyle, style]}
      >
        {children}
      </LinearGradient>
    );
    if (onPress) return (
      <Pressable accessibilityRole="button" onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>{inner}</Pressable>
    );
    return inner;
  }

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }, style]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}

// ─── Row ──────────────────────────────────────────────────────────────────────
export function Row({ children, style, gap = space.sm }: {
  children: React.ReactNode; style?: ViewStyle; gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
export function Avatar({ name, avatarAttachmentId, size = 40, style }: {
  name?: string | null; avatarAttachmentId?: number | null; size?: number; style?: ViewStyle;
}) {
  const t = useTheme();
  const [imgUri, setImgUri] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarAttachmentId) { setImgUri(null); return; }
    let mounted = true;
    fetchAttachmentUri(avatarAttachmentId)
      .then((uri) => { if (mounted) setImgUri(uri); })
      .catch(() => { if (mounted) setImgUri(null); });
    return () => { mounted = false; };
  }, [avatarAttachmentId]);

  const displayName = name ?? 'User';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  const palette = ['#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0284C7', '#DB2777', '#0891B2'];
  let hash = 0;
  for (let i = 0; i < displayName.length; i++) hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
  const bg = palette[Math.abs(hash) % palette.length];

  if (imgUri) {
    return <Image source={{ uri: imgUri }} style={[{ width: size, height: size, borderRadius: size / 2 } as ImageStyle, style as ImageStyle]} />;
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: Math.max(10, size * 0.38) }}>{initials || '?'}</Text>
    </View>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({
  title, onPress, variant = 'primary', loading, disabled, icon, small, fullWidth = false, gradient = false, style,
}: {
  title: string; onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  loading?: boolean; disabled?: boolean; icon?: any; small?: boolean;
  fullWidth?: boolean; gradient?: boolean; style?: ViewStyle;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const off = disabled || loading || busy;

  let bg = t.primary, fg = t.primaryText;
  if (variant === 'secondary') { bg = t.surfaceAlt; fg = t.text; }
  else if (variant === 'danger') { bg = t.danger; fg = '#FFFFFF'; }
  else if (variant === 'ghost') { bg = 'transparent'; fg = t.primary; }
  else if (variant === 'accent') { bg = t.accent; fg = '#FFFFFF'; }

  const h = small ? 38 : 48;
  const ph = small ? space.md : space.lg;

  const content = (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      {loading || busy ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15, letterSpacing: -0.1 }}>{title}</Text>
    </Row>
  );

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try { await onPress(); } finally { setBusy(false); }
  };

  if (variant === 'primary' && gradient && !off) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={off} onPress={handlePress}
        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, width: fullWidth ? '100%' : undefined }, style]}>
        <LinearGradient
          colors={t.gradientPrimary as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ height: h, paddingHorizontal: ph, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={handlePress}
      style={({ pressed }) => [
        {
          backgroundColor: bg, borderRadius: radius.md, height: h, paddingHorizontal: ph,
          alignItems: 'center', justifyContent: 'center',
          opacity: off ? 0.45 : pressed ? 0.75 : 1,
          borderWidth: variant === 'secondary' ? 1 : variant === 'ghost' ? 0 : 0,
          borderColor: t.border,
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

// ─── Icon Button ──────────────────────────────────────────────────────────────
export function IconButton({ icon, onPress, size = 40, iconSize = 20, tone = 'neutral', style }: {
  icon: any; onPress: () => void; size?: number; iconSize?: number; tone?: Tone; style?: ViewStyle;
}) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 },
        style,
      ]}>
      <Ionicons name={icon} size={iconSize} color={c.fg} />
    </Pressable>
  );
}

// ─── Text Input Field ─────────────────────────────────────────────────────────
export function Field({ label: lbl, error, hint, prefix, suffix, multiline, ...rest }: TextInputProps & {
  label: string; error?: string | null; hint?: string; prefix?: string; suffix?: string; multiline?: boolean;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: focused ? t.primary : t.textSub, letterSpacing: -0.1 }}>{lbl}</Text>
      <View style={{
        flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center',
        backgroundColor: t.input, borderWidth: 1.5,
        borderColor: error ? t.danger : focused ? t.primary : t.border,
        borderRadius: radius.md, paddingHorizontal: 14,
        minHeight: multiline ? 80 : 50, gap: 8,
        paddingTop: multiline ? 12 : 0,
      }}>
        {prefix ? <Text style={{ fontWeight: '700', color: t.primary, fontSize: 15 }}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={lbl}
          placeholderTextColor={t.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          style={{ flex: 1, color: t.text, fontSize: 15, paddingVertical: multiline ? 0 : 12, alignSelf: multiline ? 'flex-start' : 'center', minHeight: multiline ? 56 : undefined }}
          {...rest}
        />
        {suffix ? <Text style={{ color: t.textSub, fontSize: 14 }}>{suffix}</Text> : null}
      </View>
      {hint && !error ? <Text style={{ fontSize: 12, color: t.textSub }}>{hint}</Text> : null}
      {error ? <Text style={{ fontSize: 12, color: t.danger, fontWeight: '600' }}>{error}</Text> : null}
    </View>
  );
}

// ─── Chips / Segmented ────────────────────────────────────────────────────────
export function Chips({ options, value, onChange, multi, label: lbl }: {
  options: { value: any; label: string; icon?: any }[];
  value: any; onChange: (v: any) => void; multi?: boolean; label?: string;
}) {
  const t = useTheme();
  const sel = (v: any) => (Array.isArray(value) ? value.includes(v) : value === v);

  return (
    <View style={{ gap: 6 }}>
      {lbl ? <Text style={{ fontSize: 13, fontWeight: '600', color: t.textSub }}>{lbl}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {options.map((o) => {
          const on = sel(o.value);
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.label}
              onPress={() => onChange(
                multi
                  ? on ? (value as any[]).filter((x) => x !== o.value) : [...((value as any[]) || []), o.value]
                  : o.value
              )}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 14, paddingVertical: 9,
                borderRadius: radius.pill, borderWidth: 1.5,
                borderColor: on ? t.primary : t.border,
                backgroundColor: on ? t.primaryMuted : pressed ? t.surfaceAlt : t.card,
                minHeight: 40,
              })}
            >
              {o.icon && <Ionicons name={o.icon} size={14} color={on ? t.primary : t.textSub} />}
              <Text style={{ color: on ? t.primary : t.text, fontWeight: on ? '700' : '500', fontSize: 13 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ text, tone, icon }: { text: string; tone?: Tone; icon?: any }) {
  const t = useTheme();
  const c = toneColors(t, tone ?? STATUS_TONE[text] ?? 'neutral');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      {icon
        ? <Ionicons name={icon} size={11} color={c.fg} />
        : <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.fg }} />}
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>{label(text)}</Text>
    </View>
  );
}

// ─── Money ────────────────────────────────────────────────────────────────────
export function Money({ paise, signed, big, style, tone }: {
  paise: number; signed?: boolean; big?: boolean; style?: any; tone?: 'success' | 'danger' | 'neutral';
}) {
  const t = useTheme();
  let color = t.text;
  if (tone === 'success' || (signed && paise > 0)) color = t.success;
  if (tone === 'danger' || (signed && paise < 0)) color = t.danger;
  if (tone === 'neutral') color = t.textSub;
  return (
    <Text accessibilityLabel={formatINR(paise)} style={[{ color, fontWeight: '800', fontSize: big ? 28 : 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, style]}>
      {signed && paise > 0 ? '+' : ''}{formatINR(paise)}
    </Text>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ title, value, subtitle, icon, tone = 'primary', onPress }: {
  title: string; value: string | React.ReactNode; subtitle?: string;
  icon?: any; tone?: Tone; onPress?: () => void;
}) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: 140 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: t.textSub, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }} numberOfLines={2}>
          {title}
        </Text>
        {icon && (
          <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={18} color={c.fg} />
          </View>
        )}
      </Row>
      <View style={{ marginTop: 6 }}>
        {typeof value === 'string' || typeof value === 'number'
          ? <Text style={{ fontSize: 22, fontWeight: '800', color: t.text }}>{value}</Text>
          : value}
      </View>
      {subtitle ? <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>{subtitle}</Text> : null}
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 20, borderRadius: br = radius.md, style }: {
  width?: any; height?: number; borderRadius?: number; style?: ViewStyle;
}) {
  const t = useTheme();
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[{ width, height, borderRadius: br, backgroundColor: t.surfaceAlt, opacity: anim }, style]} />;
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function Empty({ icon = 'file-tray-outline', title, hint, actionLabel, onAction }: {
  icon?: any; title: string; hint?: string; actionLabel?: string; onAction?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 52, paddingHorizontal: space.xl, gap: space.md }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: t.primaryMuted, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={38} color={t.primary} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '700', color: t.text, textAlign: 'center' }}>{title}</Text>
      {hint ? <Text style={{ fontSize: 14, color: t.textSub, textAlign: 'center', maxWidth: 320, lineHeight: 20 }}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <Btn title={actionLabel} variant="primary" small onPress={onAction} style={{ marginTop: 4 }} />
      ) : null}
    </View>
  );
}

// ─── Banner / Alert ───────────────────────────────────────────────────────────
export function Banner({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  const icons: Record<string, string> = { success: 'checkmark-circle', danger: 'alert-circle', warn: 'warning', info: 'information-circle' };
  const iconName = icons[tone] ?? 'information-circle';
  return (
    <View style={{ backgroundColor: c.bg, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: c.fg + '40', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Ionicons name={iconName as any} size={18} color={c.fg} style={{ marginTop: 1 }} />
      <Text style={{ color: c.fg, fontWeight: '600', fontSize: 14, flex: 1, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

// ─── Error Box ────────────────────────────────────────────────────────────────
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card tone="danger">
      <Row style={{ gap: space.sm }}>
        <Ionicons name="alert-circle" size={22} color="#DC2626" />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontWeight: '700', color: '#DC2626', fontSize: 15 }}>Something went wrong</Text>
          <Text style={{ fontSize: 13, color: '#EF4444', lineHeight: 18 }}>{message}</Text>
        </View>
      </Row>
      {onRetry ? <Btn title="Try again" variant="secondary" small onPress={onRetry} style={{ alignSelf: 'flex-start', marginTop: 4 }} /> : null}
    </Card>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ progress, tone = 'primary', height = 6 }: {
  progress: number; tone?: Tone; height?: number;
}) {
  const t = useTheme();
  const c = toneColors(t, tone);
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View style={{ height, backgroundColor: t.surfaceAlt, borderRadius: height / 2, overflow: 'hidden', width: '100%' }}>
      <LinearGradient
        colors={t.gradientPrimary as [string, string]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: '100%', width: `${clamped * 100}%`, borderRadius: height / 2 }}
      />
    </View>
  );
}

// ─── Modal Dialog ─────────────────────────────────────────────────────────────
export function ModalDialog({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: space.xl, gap: space.md, borderWidth: 1, borderColor: t.border,
            ...shadow('#000', 0.25, -8, 32, 12),
          }}
        >
          <View style={{ width: 40, height: 4, backgroundColor: t.border, borderRadius: 2, alignSelf: 'center', marginBottom: 4 }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="h2">{title}</Txt>
            <IconButton icon="close" onPress={onClose} size={32} iconSize={16} />
          </Row>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Spending Chart ───────────────────────────────────────────────────────────
export function SpendingChart({ items, height = 120 }: {
  items: { label: string; amountPaise: number; color?: string }[]; height?: number;
}) {
  const t = useTheme();
  const max = Math.max(...items.map((i) => i.amountPaise), 1);
  const palette = [t.primary, t.accent, t.success, t.info, t.warn, '#EC4899', '#14B8A6'];

  return (
    <View style={{ gap: 10, marginTop: 4 }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 4 }}>
        {items.map((item, idx) => {
          const pct = Math.max(0.05, item.amountPaise / max);
          const barColor = item.color ?? palette[idx % palette.length];
          return (
            <View key={idx} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 }}>
              <Text style={{ color: t.textSub, fontSize: 9, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>
                {formatINR(item.amountPaise)}
              </Text>
              <View style={{ width: '85%', height: `${pct * 100}%`, backgroundColor: barColor, borderRadius: 6, minHeight: 8, opacity: 0.88 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
        {items.map((item, idx) => (
          <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: t.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 13 }} numberOfLines={2}>
              {label(item.label)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, paddingVertical: 64, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={t.primary} />
    </View>
  );
}

// ─── Section Title ────────────────────────────────────────────────────────────
/**
 * Always wraps children in Txt to prevent "Unexpected text node" errors.
 * Mixed JSX children like <SectionTitle>Foo ({count})</SectionTitle>
 * are valid inside Text but error as direct View children.
 */
export function SectionTitle({ title, children, action }: {
  title?: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  const t = useTheme();
  const content = title
    ? <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{title}</Text>
    : <Txt variant="h3">{children}</Txt>;

  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 }}>
      {content}
      {action}
    </Row>
  );
}

// ─── KV Row ───────────────────────────────────────────────────────────────────
export function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 14, color: '#64748B', flex: 1 }}>{k}</Text>
      <View style={{ flex: 2, alignItems: 'flex-end' }}>
        {typeof v === 'string' || typeof v === 'number'
          ? <Text style={{ fontSize: 14, fontWeight: '600', textAlign: 'right', color: '#0F172A' }}>{String(v)}</Text>
          : v}
      </View>
    </Row>
  );
}

// ─── Confirm Helper ───────────────────────────────────────────────────────────
export function confirm(title: string, message: string, okLabel = 'Confirm'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  );
}

// ─── Notice Helper ────────────────────────────────────────────────────────────
export function notice(title: string, message: string) {
  if (Platform.OS === 'web') {
    console.info(`[notice] ${title}: ${message}`);
    return;
  }
  Alert.alert(title, message);
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────
export const shortDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const shortDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
