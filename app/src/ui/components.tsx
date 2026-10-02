import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ImageStyle, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TextInputProps, useWindowDimensions, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchAttachmentUri } from '@/lib/api';
import { formatINR } from '@/lib/money';
import { label, radius, space, STATUS_TONE, Tone, toneColors, useTheme, useThemeCtx } from './theme';

/** Responsive Shell & Screen Container */
export function Screen({
  children, onRefresh, refreshing, scroll = true, padded = true, maxWidth = 960, style: customStyle,
}: {
  children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean; padded?: boolean; maxWidth?: number; style?: ViewStyle;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const bgStyle = { backgroundColor: t.bg, flex: 1 };
  const contentPadding = padded ? (isWide ? space.xl : space.lg) : 0;

  if (!scroll) {
    return (
      <View style={[bgStyle, { padding: contentPadding }, customStyle]}>
        <View style={{ maxWidth, width: '100%', alignSelf: 'center', flex: 1 }}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={bgStyle}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: contentPadding,
        paddingBottom: insets.bottom + 48,
        gap: space.md,
        maxWidth,
        width: '100%',
        alignSelf: 'center',
      }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.primary} colors={[t.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

/** Header bar with Back button, title, subtitle & action buttons */
export function ScreenHeader({
  title, subtitle, onBack, right, breadcrumbs,
}: {
  title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode; breadcrumbs?: string[];
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: space.sm }}>
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
                width: 38,
                height: 38,
                borderRadius: radius.md,
                backgroundColor: t.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: t.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="arrow-back" size={20} color={t.text} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Txt variant="h2" style={{ fontWeight: '800', color: t.text }}>{title}</Txt>
            {subtitle ? <Txt variant="sub" tone="sub">{subtitle}</Txt> : null}
          </View>
        </Row>
        {right}
      </Row>
    </View>
  );
}

/** Typography Component */
export function Txt({
  children, style, variant = 'body', tone, numberOfLines, selectable, ...rest
}: {
  children?: React.ReactNode; style?: any; variant?: 'title' | 'h1' | 'h2' | 'h3' | 'body' | 'sub' | 'small' | 'caption' | 'big' | 'mono';
  tone?: 'sub' | 'danger' | 'success' | 'primary' | 'accent' | 'action' | 'warn' | 'muted'; numberOfLines?: number; accessibilityLabel?: string; selectable?: boolean;
}) {
  const t = useTheme();
  const fontStyles: Record<string, any> = {
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
    h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    h3: { fontSize: 16, fontWeight: '700' },
    body: { fontSize: 15, lineHeight: 22 },
    sub: { fontSize: 14, lineHeight: 20 },
    small: { fontSize: 12, lineHeight: 16 },
    caption: { fontSize: 12, lineHeight: 16 },
    big: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
    mono: { fontSize: 15, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '700' },
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

/** Surface Card */
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
    ...t.shadow,
    ...(accent ? { borderLeftWidth: 4, borderLeftColor: accent } : {}),
  };

  if (gradient) {
    const GradientWrapper = (
      <LinearGradient
        colors={t.gradientCard as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[cardStyle, style]}
      >
        {children}
      </LinearGradient>
    );
    if (onPress) {
      return (
        <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
          {GradientWrapper}
        </Pressable>
      );
    }
    return GradientWrapper;
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

/** Row container */
export function Row({ children, style, gap = space.sm }: { children: React.ReactNode; style?: ViewStyle; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** User Avatar Component with initials or attachment image */
export function Avatar({
  name, avatarAttachmentId, userId, size = 40, style,
}: {
  name?: string | null; avatarAttachmentId?: number | null; userId?: number | null; size?: number; style?: ViewStyle;
}) {
  const t = useTheme();
  const [imgUri, setImgUri] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarAttachmentId) { setImgUri(null); return; }
    let isMounted = true;
    fetchAttachmentUri(avatarAttachmentId)
      .then((uri) => { if (isMounted) setImgUri(uri); })
      .catch(() => { if (isMounted) setImgUri(null); });
    return () => { isMounted = false; };
  }, [avatarAttachmentId]);

  const displayName = name ?? 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  const colors = ['#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0284C7', '#DB2777'];
  let hash = 0;
  for (let i = 0; i < displayName.length; i++) hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
  const bgColor = colors[Math.abs(hash) % colors.length];

  const avatarImgStyle: ImageStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: t.surfaceAlt,
  };

  if (imgUri) {
    return (
      <Image
        source={{ uri: imgUri }}
        style={[avatarImgStyle, style as ImageStyle]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.4 }}>{initials || '?'}</Text>
    </View>
  );
}

/** Primary / Secondary / Ghost Button */
export function Btn({
  title, onPress, variant = 'primary', loading, disabled, icon, small, fullWidth = false, gradient = false, style,
}: {
  title: string; onPress: () => void | Promise<void>; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  loading?: boolean; disabled?: boolean; icon?: any; small?: boolean; fullWidth?: boolean; gradient?: boolean; style?: ViewStyle;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const off = disabled || loading || busy;

  let bg = t.primary;
  let fg = t.primaryText;

  if (variant === 'secondary') { bg = t.surfaceAlt; fg = t.text; }
  else if (variant === 'danger') { bg = t.danger; fg = '#FFFFFF'; }
  else if (variant === 'ghost') { bg = 'transparent'; fg = t.primary; }
  else if (variant === 'accent') { bg = t.accent; fg = '#FFFFFF'; }

  const minHeight = small ? 38 : 48;
  const paddingHorizontal = small ? space.md : space.lg;

  const btnContent = (
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {loading || busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : icon ? (
        <Ionicons name={icon} size={small ? 16 : 18} color={fg} />
      ) : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 15 }}>{title}</Text>
    </Row>
  );

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try { await onPress(); } finally { setBusy(false); }
  };

  if (variant === 'primary' && gradient && !off) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        disabled={off}
        onPress={handleClick}
        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, width: fullWidth ? '100%' : undefined }, style]}
      >
        <LinearGradient
          colors={t.gradientPrimary as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            minHeight,
            paddingHorizontal,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {btnContent}
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
      onPress={handleClick}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          minHeight,
          paddingHorizontal,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: t.border,
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {btnContent}
    </Pressable>
  );
}

/** Circle Icon Button */
export function IconButton({
  icon, onPress, size = 38, iconSize = 20, tone = 'neutral', style,
}: {
  icon: any; onPress: () => void; size?: number; iconSize?: number; tone?: Tone; style?: ViewStyle;
}) {
  const t = useTheme();
  const colors = toneColors(t, tone);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={colors.fg} />
    </Pressable>
  );
}

/** Input Text Field with floating/clean label & prefix */
export function Field({
  label: lbl, error, hint, prefix, suffix, ...rest
}: TextInputProps & { label: string; error?: string | null; hint?: string; prefix?: string; suffix?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Txt variant="sub" style={{ fontWeight: '600', color: focused ? t.primary : t.textSub }}>
        {lbl}
      </Txt>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.input,
          borderWidth: 1,
          borderColor: error ? t.danger : focused ? t.primary : t.border,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          minHeight: 48,
          gap: 8,
        }}
      >
        {prefix ? <Txt style={{ fontWeight: '700', color: t.primary }}>{prefix}</Txt> : null}
        <TextInput
          accessibilityLabel={lbl}
          placeholderTextColor={t.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            color: t.text,
            fontSize: 16,
            paddingVertical: 10,
          }}
          {...rest}
        />
        {suffix ? <Txt tone="sub">{suffix}</Txt> : null}
      </View>
      {hint && !error ? <Txt variant="small" tone="sub">{hint}</Txt> : null}
      {error ? <Txt variant="small" tone="danger">{error}</Txt> : null}
    </View>
  );
}

/** Segmented Control / Chips selector */
export function Chips({
  options, value, onChange, multi, label: lbl,
}: {
  options: { value: any; label: string; icon?: any }[]; value: any; onChange: (v: any) => void; multi?: boolean; label?: string;
}) {
  const t = useTheme();
  const sel = (v: any) => (Array.isArray(value) ? value.includes(v) : value === v);

  return (
    <View style={{ gap: 6 }}>
      {lbl ? <Txt variant="sub" style={{ fontWeight: '600' }}>{lbl}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = sel(o.value);
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.label}
              onPress={() =>
                onChange(
                  multi
                    ? on
                      ? (value as any[]).filter((x) => x !== o.value)
                      : [...((value as any[]) || []), o.value]
                    : o.value
                )
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: on ? t.primary : t.border,
                backgroundColor: on ? t.primaryMuted : t.card,
                minHeight: 38,
              }}
            >
              {o.icon && <Ionicons name={o.icon} size={16} color={on ? t.primary : t.textSub} />}
              <Text style={{ color: on ? t.primary : t.text, fontWeight: on ? '700' : '500', fontSize: 14 }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Status Badge Pill */
export function Badge({ text, tone, icon }: { text: string; tone?: Tone; icon?: any }) {
  const t = useTheme();
  const c = toneColors(t, tone ?? STATUS_TONE[text] ?? 'neutral');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: c.bg,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? (
        <Ionicons name={icon} size={12} color={c.fg} />
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg }} />
      )}
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '700' }}>{label(text)}</Text>
    </View>
  );
}

/** Formatted Currency Component */
export function Money({
  paise, signed, big, style, tone,
}: {
  paise: number; signed?: boolean; big?: boolean; style?: any; tone?: 'success' | 'danger' | 'neutral';
}) {
  const t = useTheme();
  let color = t.text;
  if (tone === 'success' || (signed && paise > 0)) color = t.success;
  if (tone === 'danger' || (signed && paise < 0)) color = t.danger;
  if (tone === 'neutral') color = t.textSub;

  return (
    <Text
      accessibilityLabel={formatINR(paise)}
      style={[
        {
          color,
          fontWeight: '800',
          fontSize: big ? 28 : 16,
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        },
        style,
      ]}
    >
      {signed && paise > 0 ? '+' : ''}
      {formatINR(paise)}
    </Text>
  );
}

/** Stat KPI Card */
export function StatCard({
  title, value, subtitle, icon, tone = 'primary', onPress,
}: {
  title: string; value: string | React.ReactNode; subtitle?: string; icon?: any; tone?: Tone; onPress?: () => void;
}) {
  const t = useTheme();
  const colors = toneColors(t, tone);

  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: 160 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="small" style={{ fontWeight: '700', color: t.textSub, textTransform: 'uppercase' }}>
          {title}
        </Txt>
        {icon && (
          <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={18} color={colors.fg} />
          </View>
        )}
      </Row>
      <View style={{ marginTop: space.xs }}>
        {typeof value === 'string' ? <Txt variant="h2" style={{ fontWeight: '800' }}>{value}</Txt> : value}
      </View>
      {subtitle ? <Txt variant="small" tone="sub" style={{ marginTop: 2 }}>{subtitle}</Txt> : null}
    </Card>
  );
}

/** Shimmering Skeleton Component */
export function Skeleton({ width = '100%', height = 20, borderRadius = radius.md, style }: { width?: any; height?: number; borderRadius?: number; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ width, height, borderRadius, backgroundColor: t.surfaceAlt, opacity: 0.7 }, style]} />;
}

/** Empty State Component */
export function Empty({
  icon = 'file-tray-outline', title, hint, actionLabel, actionTitle, onAction,
}: {
  icon?: any; title: string; hint?: string; actionLabel?: string; actionTitle?: string; onAction?: () => void;
}) {
  const t = useTheme();
  const btnLabel = actionLabel ?? actionTitle;
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: space.lg, gap: space.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.primaryMuted, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs }}>
        <Ionicons name={icon} size={32} color={t.primary} />
      </View>
      <Txt variant="h3" style={{ textAlign: 'center' }}>{title}</Txt>
      {hint ? <Txt variant="sub" tone="sub" style={{ textAlign: 'center', maxWidth: 400 }}>{hint}</Txt> : null}
      {btnLabel && onAction ? (
        <Btn title={btnLabel} variant="primary" small onPress={onAction} style={{ marginTop: space.sm }} />
      ) : null}
    </View>
  );
}


/** Banner Alert Component */
export function Banner({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ backgroundColor: c.bg, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: t.border }}>
      <Text style={{ color: c.fg, fontWeight: '600', fontSize: 14 }}>{text}</Text>
    </View>
  );
}

/** Error Box Component */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card tone="danger">
      <Row style={{ gap: space.sm }}>
        <Ionicons name="alert-circle" size={24} color="#DC2626" />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt tone="danger" style={{ fontWeight: '700' }}>Something went wrong</Txt>
          <Txt variant="sub">{message}</Txt>
        </View>
      </Row>
      {onRetry ? <Btn title="Try again" variant="secondary" small onPress={onRetry} style={{ alignSelf: 'flex-start', marginTop: space.xs }} /> : null}
    </Card>
  );
}

/** Linear Progress Bar */
export function ProgressBar({ progress, tone = 'primary', height = 8 }: { progress: number; tone?: Tone; height?: number }) {
  const t = useTheme();
  const colors = toneColors(t, tone);
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <View style={{ height, backgroundColor: t.surfaceAlt, borderRadius: height / 2, overflow: 'hidden', width: '100%' }}>
      <View style={{ height: '100%', width: `${clamped * 100}%`, backgroundColor: colors.fg, borderRadius: height / 2 }} />
    </View>
  );
}

/** Accessible Modal Dialog */
export function ModalDialog({
  visible, onClose, title, children,
}: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const t = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: space.lg }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, backgroundColor: t.card, borderRadius: radius.xl, padding: space.xl, gap: space.md, borderWidth: 1, borderColor: t.border, ...t.shadowLg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="h2">{title}</Txt>
            <IconButton icon="close" onPress={onClose} size={32} iconSize={18} />
          </Row>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Simple Bar Spending Chart */
export function SpendingChart({
  items, height = 140,
}: {
  items: { label: string; amountPaise: number; color?: string }[]; height?: number;
}) {
  const t = useTheme();
  const max = Math.max(...items.map((i) => i.amountPaise), 1);

  return (
    <View style={{ gap: space.sm, marginTop: space.xs }}>
      <Row style={{ height, alignItems: 'flex-end', gap: space.md, paddingHorizontal: space.sm }}>
        {items.map((item, idx) => {
          const pct = Math.max(0.08, item.amountPaise / max);
          const barColor = item.color ?? (idx % 2 === 0 ? t.primary : t.accent);
          return (
            <View key={idx} style={{ flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
              <View style={{ width: '100%', height: `${pct * 100}%`, backgroundColor: barColor, borderRadius: radius.xs, minHeight: 8 }} />
            </View>
          );
        })}
      </Row>
      <Row style={{ gap: space.md, paddingHorizontal: space.sm }}>
        {items.map((item, idx) => (
          <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="small" numberOfLines={1} style={{ textAlign: 'center', color: t.textSub, fontSize: 11 }}>
              {item.label}
            </Txt>
          </View>
        ))}
      </Row>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ padding: 48, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={t.primary} />
    </View>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      {typeof children === 'string' ? <Txt variant="h3">{children}</Txt> : children}
      {action}
    </Row>
  );
}

export function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === '') return null;
  return (
    <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Txt variant="sub" tone="sub" style={{ flex: 1 }}>{k}</Txt>
      <View style={{ flex: 2, alignItems: 'flex-end' }}>
        {typeof v === 'string' || typeof v === 'number' ? <Txt style={{ textAlign: 'right' }}>{String(v)}</Txt> : v}
      </View>
    </Row>
  );
}

/** Confirm Helper */
export function confirm(title: string, message: string, okLabel = 'Confirm'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  );
}

export function notice(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export const shortDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const shortDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
