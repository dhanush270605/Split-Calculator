import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tone, toneColors, useTheme } from './theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Toast {
  id: string;
  title: string;
  message?: string;
  tone?: Tone;
  duration?: number;
}

interface ToastCtx {
  show: (title: string, message?: string, tone?: Tone, duration?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warn: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastCtx>({
  show: () => {},
  success: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Toast Item ───────────────────────────────────────────────────────────────
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  const TONE_ICONS: Record<string, string> = {
    success: 'checkmark-circle',
    danger: 'alert-circle',
    warn: 'warning',
    info: 'information-circle',
    neutral: 'ellipse',
  };

  React.useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay((toast.duration ?? 3500) - 500),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, []);

  const tone = toast.tone ?? 'neutral';
  const c = toneColors(t, tone);
  const iconName = TONE_ICONS[tone] ?? 'ellipse';

  return (
    <Animated.View style={{ opacity }}>
      <Pressable
        onPress={onDismiss}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          backgroundColor: t.card,
          borderRadius: 14,
          padding: 14,
          paddingRight: 16,
          borderWidth: 1,
          borderColor: c.bg,
          borderLeftWidth: 4,
          borderLeftColor: c.fg,
          marginBottom: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 6,
          maxWidth: 400,
          width: '100%',
        }}
      >
        <Ionicons name={iconName as any} size={22} color={c.fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Animated.Text style={{ color: t.text, fontWeight: '700', fontSize: 15, lineHeight: 20 }}>
            {toast.title}
          </Animated.Text>
          {toast.message ? (
            <Animated.Text style={{ color: t.textSub, fontSize: 13, lineHeight: 18 }}>
              {toast.message}
            </Animated.Text>
          ) : null}
        </View>
        <Ionicons name="close" size={16} color={t.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((title: string, message?: string, tone?: Tone, duration = 3500) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, title, message, tone, duration }]);
    // Auto-dismiss safety fallback
    setTimeout(() => dismiss(id), duration + 600);
  }, [dismiss]);

  const success = useCallback((t: string, m?: string) => show(t, m, 'success'), [show]);
  const error = useCallback((t: string, m?: string) => show(t, m, 'danger', 4500), [show]);
  const warn = useCallback((t: string, m?: string) => show(t, m, 'warn'), [show]);
  const info = useCallback((t: string, m?: string) => show(t, m, 'info'), [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, warn, info }}>
      {children}
      {/* Toast container — top of screen on mobile, bottom-right on web/wide */}
      <View
        style={{
          position: 'absolute',
          ...(Platform.OS === 'web'
            ? { bottom: insets.bottom + 24, right: 24, left: 'auto', width: 380 }
            : { top: insets.top + 8, left: 16, right: 16 }),
          zIndex: 9999,
          pointerEvents: 'box-none',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}
