import { useColorScheme } from 'react-native';

const light = {
  bg: '#F5F7FB', card: '#FFFFFF', text: '#0F172A', sub: '#64748B', border: '#E2E8F0', primary: '#4F46E5', primaryText: '#FFFFFF',
  success: '#059669', successBg: '#D1FAE5', warn: '#B45309', warnBg: '#FEF3C7', danger: '#DC2626', dangerBg: '#FEE2E2', info: '#2563EB', infoBg: '#DBEAFE',
  action: '#7C3AED', actionBg: '#EDE9FE', muted: '#F1F5F9', input: '#FFFFFF',
};
const dark: typeof light = {
  bg: '#0B1120', card: '#151D2F', text: '#F1F5F9', sub: '#94A3B8', border: '#26324A', primary: '#818CF8', primaryText: '#0B1120',
  success: '#34D399', successBg: '#064E3B', warn: '#FBBF24', warnBg: '#451A03', danger: '#F87171', dangerBg: '#450A0A', info: '#60A5FA', infoBg: '#172554',
  action: '#A78BFA', actionBg: '#2E1065', muted: '#1E293B', input: '#0F172A',
};
export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export type Tone = 'success' | 'warn' | 'danger' | 'info' | 'action' | 'neutral';
export const toneColors = (t: Theme, tone: Tone) => {
  switch (tone) {
    case 'success': return { fg: t.success, bg: t.successBg };
    case 'warn': return { fg: t.warn, bg: t.warnBg };
    case 'danger': return { fg: t.danger, bg: t.dangerBg };
    case 'info': return { fg: t.info, bg: t.infoBg };
    case 'action': return { fg: t.action, bg: t.actionBg };
    default: return { fg: t.sub, bg: t.muted };
  }
};

export const STATUS_TONE: Record<string, Tone> = {
  APPROVED: 'success', CONFIRMED: 'success', SETTLED: 'success', ACTIVE: 'success', RESOLVED: 'success', COMPLETED: 'success', PAID: 'info',
  PENDING_APPROVAL: 'warn', PENDING: 'warn', UPCOMING: 'info', DRAFT: 'neutral', INVESTIGATING: 'info', OPEN: 'warn', PAYMENT_INITIATED: 'info', UNDER_REVIEW: 'info',
  DECLINED: 'danger', DISPUTED: 'danger', CANCELLED: 'neutral', ARCHIVED: 'neutral', REJECTED: 'danger', CORRECTED: 'success', INACTIVE: 'neutral',
};
export const LEVEL_TONE: Record<string, Tone> = { INFO: 'info', SUCCESS: 'success', WARNING: 'warn', ERROR: 'danger', ACTION_REQUIRED: 'action' };
export const label = (s?: string | null) => (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
