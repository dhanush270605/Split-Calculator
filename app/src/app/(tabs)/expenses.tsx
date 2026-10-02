import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useDebounced, useLoad } from '@/lib/hooks';
import { Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Loading, Money, Row, Screen, SectionTitle, Txt, confirm, notice, shortDate } from '@/ui/components';
import { formatINR, parseRupees } from '@/lib/money';
import { label } from '@/ui/theme';

const CATS = ['FOOD', 'TRAVEL', 'ACCOMMODATION', 'HACKATHON', 'PERSONAL', 'SHOPPING', 'TICKETS', 'MEDICAL', 'OTHER'];

export default function Expenses() {
  const router = useRouter();
  const { refreshUnread } = useAuth();
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState('');
  const [method, setMethod] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const q = useDebounced(search);
  const qs = [`search=${encodeURIComponent(q)}`, mine ? 'mine=true' : '', status && `status=${status}`, category && `category=${category}`, visibility && `visibility=${visibility}`, method && `paymentMethod=${method}`,
    parseRupees(min) != null && `minAmount=${parseRupees(min)}`, parseRupees(max) != null && `maxAmount=${parseRupees(max)}`, 'limit=50'].filter(Boolean).join('&');
  const list = useLoad(() => get(`/expenses?${qs}`), [qs]);
  const appr = useLoad(() => get('/approvals'));

  const respond = async (id: number, decision: 'APPROVE' | 'DECLINE') => {
    try {
      let note: string | undefined;
      if (decision === 'DECLINE' && !(await confirm('Decline this share?', 'The creator will be asked to correct it. You will not owe anything for it meanwhile.', 'Decline'))) return;
      await post(`/expenses/${id}/respond`, { decision, note });
      await Promise.all([appr.reload(true), list.reload(true), refreshUnread()]);
    } catch (e) { notice('Could not respond', errMsg(e)); }
  };

  return (
    <Screen onRefresh={() => { list.refresh(); appr.refresh(); }} refreshing={list.refreshing}>
      <Btn title="Add expense" icon="add" onPress={() => router.push('/expense/new')} />
      {(appr.data?.approvals ?? []).length > 0 ? (
        <>
          <SectionTitle>Needs your approval</SectionTitle>
          {appr.data.approvals.map((a: any) => (
            <Card key={`${a.kind}-${a.expenseId}`} tone="action">
              <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{a.title}</Txt><Money paise={a.amountPaise} /></Row>
              <Txt variant="sub">{a.eventName} · by {a.creatorName} · paid by {a.payerName ?? '—'}</Txt>
              {a.kind === 'SHARE' ? <Txt>Your share: <Txt style={{ fontWeight: '800' }}>{formatINR(a.sharePaise)}</Txt></Txt> : <Txt>Please confirm you paid this.</Txt>}
              <Row>
                <Btn small title={a.kind === 'SHARE' ? 'Approve' : 'Yes, I paid'} onPress={() => respond(a.expenseId, 'APPROVE')} />
                <Btn small variant="danger" title="Decline" onPress={() => respond(a.expenseId, 'DECLINE')} />
                <Btn small variant="ghost" title="Details" onPress={() => router.push({ pathname: '/expense/[id]', params: { id: a.expenseId } })} />
              </Row>
            </Card>
          ))}
        </>
      ) : null}
      <SectionTitle>History</SectionTitle>
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Title, description…" />
      <Chips value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ value: 'mine', label: 'Involving me' }, { value: 'all', label: 'All visible' }]} />
      <Btn small variant="secondary" title={showFilters ? 'Hide filters' : 'Filters'} icon="options-outline" onPress={() => setShowFilters((s) => !s)} />
      {showFilters ? (
        <Card>
          <Chips label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Any' }, ...['PENDING_APPROVAL', 'APPROVED', 'DECLINED', 'DISPUTED', 'SETTLED', 'CANCELLED'].map((s) => ({ value: s, label: label(s) }))]} />
          <Chips label="Category" value={category} onChange={setCategory} options={[{ value: '', label: 'Any' }, ...CATS.map((s) => ({ value: s, label: label(s) }))]} />
          <Chips label="Visibility" value={visibility} onChange={setVisibility} options={[{ value: '', label: 'Any' }, { value: 'PUBLIC', label: 'Public' }, { value: 'PRIVATE', label: 'Private' }]} />
          <Chips label="Payment" value={method} onChange={setMethod} options={[{ value: '', label: 'Any' }, ...['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((s) => ({ value: s, label: label(s) }))]} />
          <Row><View2><Field label="Min ₹" value={min} onChangeText={setMin} keyboardType="decimal-pad" /></View2><View2><Field label="Max ₹" value={max} onChangeText={setMax} keyboardType="decimal-pad" /></View2></Row>
        </Card>
      ) : null}
      {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : (list.data?.expenses ?? []).length === 0 ? (
        <Empty title="No expenses match" hint="Try clearing filters, or add an expense." />
      ) : list.data.expenses.map((e: any) => (
        <Card key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}>
          <Row style={{ justifyContent: 'space-between' }}><Txt variant="h3" style={{ flex: 1 }}>{e.title}</Txt><Money paise={e.amountPaise} /></Row>
          <Row style={{ flexWrap: 'wrap' }}>
            <Badge text={e.status} />
            {e.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}
            {e.payerType !== 'INDIVIDUAL' && e.payerType !== 'GROUP_MEMBER' ? <Badge text="Sponsored" tone="info" /> : null}
            {e.category === 'PERSONAL' ? <Badge text="Personal" tone="neutral" /> : null}
          </Row>
          <Txt variant="small">{e.eventName} · {label(e.category)} · paid by {e.payerName ?? '—'} · {shortDate(e.spentAt)}</Txt>
          {e.myApproval ? <Txt variant="small">Your share {formatINR(e.mySharePaise)} · {label(e.myApproval)}</Txt> : null}
        </Card>
      ))}
    </Screen>
  );
}
const View2 = ({ children }: { children: React.ReactNode }) => <View style={{ flex: 1 }}>{children}</View>;
