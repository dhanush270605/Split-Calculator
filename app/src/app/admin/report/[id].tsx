import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { get } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Badge, Card, ErrorBox, KV, Loading, Money, Row, Screen, SectionTitle, Txt } from '@/ui/components';
import { label } from '@/ui/theme';

export default function EventReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useLoad(() => get(`/admin/reports/event/${id}`), [id]);
  if (r.loading && !r.data) return <Screen><Loading /></Screen>;
  if (r.error || !r.data) return <Screen><ErrorBox message={r.error ?? 'No data'} onRetry={r.reload} /></Screen>;
  const d = r.data, f = d.financial;
  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Txt variant="h2">{d.event.name}</Txt>
      <Card>
        <Txt variant="h3">Financial summary</Txt>
        <KV k="Total spending" v={formatINR(f.totalPaise)} /><KV k="College / sponsor" v={formatINR(f.sponsoredPaise)} /><KV k="Group" v={formatINR(f.groupPaise)} /><KV k="Personal" v={formatINR(f.personalPaise)} />
        <KV k="Awaiting approval" v={formatINR(f.pendingPaise)} /><KV k="Outstanding" v={formatINR(f.outstandingPaise)} /><KV k="Settled" v={formatINR(f.settledPaise)} /><KV k="In flight" v={formatINR(f.inFlightPaise)} />
      </Card>
      <SectionTitle>User-wise</SectionTitle>
      <Card>{d.userWise.map((u: any) => (
        <Row key={u.userId} style={{ justifyContent: 'space-between' }}><Txt style={{ flex: 1 }}>{u.name}</Txt><Txt variant="small">paid {formatINR(u.paidPaise)} · personal {formatINR(u.personalPaise)}</Txt><Money paise={u.netPaise} signed /></Row>
      ))}</Card>
      <SectionTitle>Who owes whom</SectionTitle>
      {d.suggestions.length === 0 ? <Txt variant="sub">Nothing outstanding.</Txt> : d.suggestions.map((t: any, i: number) => <Card key={i}><Row style={{ justifyContent: 'space-between' }}><Txt style={{ flex: 1 }}>{t.fromName} → {t.toName}</Txt><Money paise={t.amountPaise} /></Row></Card>)}
      <SectionTitle>By category</SectionTitle>
      <Card>{d.categories.map((c: any) => <KV key={c.category} k={`${label(c.category)} (${c.count})`} v={formatINR(c.totalPaise)} />)}</Card>
      <SectionTitle>Budget vs actual</SectionTitle>
      <Card>{d.budgetVsActual.length ? d.budgetVsActual.map((b: any) => <KV key={b.category} k={label(b.category)} v={`${formatINR(b.actualPaise)} / ${formatINR(b.budgetPaise)}`} />) : <Txt variant="sub">No budget set.</Txt>}</Card>
      <SectionTitle>Counts</SectionTitle>
      <Card>
        <Row style={{ flexWrap: 'wrap' }}>{d.visibility.map((v: any) => <Badge key={v.visibility} text={`${label(v.visibility)}: ${v.count}`} tone="neutral" />)}</Row>
        <Row style={{ flexWrap: 'wrap' }}>{d.expenseStatus.map((v: any) => <Badge key={v.status} text={`${label(v.status)}: ${v.count}`} />)}</Row>
        <Txt variant="sub">Share approvals</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{d.approvalStats.map((v: any) => <Badge key={v.status} text={`${label(v.status)}: ${v.count}`} />)}</Row>
      </Card>
    </Screen>
  );
}
