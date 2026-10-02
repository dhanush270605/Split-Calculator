import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Avatar, Badge, Card, ErrorBox, KV, Loading, Money, Row, Screen, SectionTitle, Txt } from '@/ui/components';
import { label } from '@/ui/theme';

export default function EventReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useLoad(() => get(`/admin/reports/event/${id}`), [id]);

  if (r.loading && !r.data) return <Screen><Loading /></Screen>;
  if (r.error || !r.data) return <Screen><ErrorBox message={r.error ?? 'No report data'} onRetry={r.reload} /></Screen>;

  const d = r.data, f = d.financial;

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Txt variant="h1">Financial Report: {d.event.name}</Txt>
      </Row>

      {/* Financial Summary KPI Grid Card */}
      <Card tone="neutral">
        <Txt variant="h2" style={{ marginBottom: 8 }}>Financial Summary</Txt>
        <View style={{ gap: 6 }}>
          <KV k="Total spending" v={formatINR(f.totalPaise)} />
          <KV k="College / Sponsor contributions" v={formatINR(f.sponsoredPaise)} />
          <KV k="Group out-of-pocket" v={formatINR(f.groupPaise)} />
          <KV k="Personal spending" v={formatINR(f.personalPaise)} />
          <KV k="Awaiting approval" v={formatINR(f.pendingPaise)} />
          <KV k="Outstanding debt" v={formatINR(f.outstandingPaise)} />
          <KV k="Settled amount" v={formatINR(f.settledPaise)} />
          <KV k="In-flight settlements" v={formatINR(f.inFlightPaise)} />
        </View>
      </Card>

      {/* User Wise breakdown */}
      <SectionTitle>User-wise Financial Breakdown</SectionTitle>
      <Card>
        <View style={{ gap: 10 }}>
          {d.userWise.map((u: any) => (
            <Row key={u.userId} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Row style={{ flex: 1, gap: 10, alignItems: 'center' }}>
                <Avatar name={u.name} userId={u.userId} size={36} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '600' }}>{u.name}</Txt>
                  <Txt variant="caption" tone="muted">Paid: {formatINR(u.paidPaise)} · Personal: {formatINR(u.personalPaise)}</Txt>
                </View>
              </Row>
              <Money paise={u.netPaise} signed />
            </Row>
          ))}
        </View>
      </Card>

      {/* Debt simplification suggestions */}
      <SectionTitle>Who owes whom (Simplified Debt Ledger)</SectionTitle>
      {d.suggestions.length === 0 ? (
        <Txt variant="sub" tone="muted">No outstanding debt between participants.</Txt>
      ) : (
        d.suggestions.map((t: any, i: number) => (
          <Card key={i}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Row style={{ flex: 1, gap: 8, alignItems: 'center' }}>
                <Avatar name={t.fromName} userId={t.fromUserId} size={32} />
                <Txt variant="caption" tone="muted">→</Txt>
                <Avatar name={t.toName} userId={t.toUserId} size={32} />
                <Txt style={{ fontWeight: '600', marginLeft: 4 }}>{t.fromName} owes {t.toName}</Txt>
              </Row>
              <Money paise={t.amountPaise} />
            </Row>
          </Card>
        ))
      )}

      {/* Category distribution */}
      <SectionTitle>Spending by Category</SectionTitle>
      <Card>
        <View style={{ gap: 6 }}>
          {d.categories.map((c: any) => (
            <KV key={c.category} k={`${label(c.category)} (${c.count} items)`} v={formatINR(c.totalPaise)} />
          ))}
        </View>
      </Card>

      {/* Budget vs Actual */}
      <SectionTitle>Budget vs Actual</SectionTitle>
      <Card>
        <View style={{ gap: 6 }}>
          {d.budgetVsActual.length ? (
            d.budgetVsActual.map((b: any) => (
              <KV key={b.category} k={label(b.category)} v={`${formatINR(b.actualPaise)} / ${formatINR(b.budgetPaise)}`} />
            ))
          ) : (
            <Txt variant="sub" tone="muted">No category budget limits configured for this event.</Txt>
          )}
        </View>
      </Card>

      {/* Event Stats */}
      <SectionTitle>Metadata Counts</SectionTitle>
      <Card style={{ gap: 8 }}>
        <Txt variant="caption" tone="muted">Visibility distribution:</Txt>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {d.visibility.map((v: any) => <Badge key={v.visibility} text={`${label(v.visibility)}: ${v.count}`} tone="neutral" />)}
        </Row>
        <Txt variant="caption" tone="muted" style={{ marginTop: 4 }}>Expense Statuses:</Txt>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {d.expenseStatus.map((v: any) => <Badge key={v.status} text={`${label(v.status)}: ${v.count}`} />)}
        </Row>
        <Txt variant="caption" tone="muted" style={{ marginTop: 4 }}>Share Approvals:</Txt>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {d.approvalStats.map((v: any) => <Badge key={v.status} text={`${label(v.status)}: ${v.count}`} tone={v.status === 'APPROVED' ? 'success' : v.status === 'DECLINED' ? 'danger' : 'warn'} />)}
        </Row>
      </Card>
    </Screen>
  );
}
