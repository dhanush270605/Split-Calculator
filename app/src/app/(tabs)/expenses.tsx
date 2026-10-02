import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useDebounced, useLoad } from '@/lib/hooks';
import { Avatar, Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Money, Row, Screen, SectionTitle, Skeleton, Txt, confirm, notice, shortDate } from '@/ui/components';
import { formatINR, parseRupees } from '@/lib/money';
import { label, useTheme } from '@/ui/theme';

const CATS = ['FOOD', 'TRAVEL', 'ACCOMMODATION', 'HACKATHON', 'PERSONAL', 'SHOPPING', 'TICKETS', 'MEDICAL', 'OTHER'];

const CAT_ICONS: Record<string, string> = {
  FOOD: 'restaurant-outline',
  TRAVEL: 'car-outline',
  ACCOMMODATION: 'bed-outline',
  HACKATHON: 'code-slash-outline',
  PERSONAL: 'person-outline',
  SHOPPING: 'cart-outline',
  TICKETS: 'ticket-outline',
  MEDICAL: 'medkit-outline',
  OTHER: 'ellipsis-horizontal-circle-outline',
};

export default function Expenses() {
  const router = useRouter();
  const { me, refreshUnread } = useAuth();
  const t = useTheme();
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
  const qs = [
    `search=${encodeURIComponent(q)}`,
    mine ? 'mine=true' : '',
    status && `status=${status}`,
    category && `category=${category}`,
    visibility && `visibility=${visibility}`,
    method && `paymentMethod=${method}`,
    parseRupees(min) != null && `minAmount=${parseRupees(min)}`,
    parseRupees(max) != null && `maxAmount=${parseRupees(max)}`,
    'limit=50',
  ].filter(Boolean).join('&');

  const list = useLoad(() => get(`/expenses?${qs}`), [qs]);
  const appr = useLoad(() => get('/approvals'));

  // Refetch when filters change (useLoad only refetches on screen focus by default)
  useEffect(() => { list.reload(false); }, [qs]);

  const respond = async (id: number, decision: 'APPROVE' | 'DECLINE') => {
    try {
      if (decision === 'DECLINE' && !(await confirm('Decline this share?', 'The creator will be asked to correct it. You will not owe anything for it meanwhile.', 'Decline'))) return;
      await post(`/expenses/${id}/respond`, { decision });
      await Promise.all([appr.reload(true), list.reload(true), refreshUnread()]);
    } catch (e) {
      notice('Could not respond', errMsg(e));
    }
  };

  return (
    <Screen onRefresh={() => { list.refresh(); appr.refresh(); }} refreshing={list.refreshing}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Txt variant="h1">Expenses</Txt>
        <Btn title="+ Add" icon="add-circle-outline" small onPress={() => router.push('/expense/new')} />
      </Row>

      {/* Pending Approvals Card Stack */}
      {(appr.data?.approvals ?? []).length > 0 ? (
        <>
          <SectionTitle>Action Required ({appr.data.approvals.length})</SectionTitle>
          {appr.data.approvals.map((a: any) => (
            <Card key={`${a.kind}-${a.expenseId}`} tone="action">
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Txt variant="h3">{a.title}</Txt>
                  <Txt variant="caption" tone="muted">{a.eventName} · by {a.creatorName}</Txt>
                </View>
                <Money paise={a.amountPaise} />
              </Row>
              <View style={{ marginVertical: 6 }}>
                {a.kind === 'SHARE' ? (
                  <Txt variant="sub">Your share: <Txt style={{ fontWeight: '800' }}>{formatINR(a.sharePaise)}</Txt></Txt>
                ) : (
                  <Txt variant="sub">Please confirm you paid this expense out-of-pocket.</Txt>
                )}
              </View>
              <Row style={{ gap: 8, marginTop: 4 }}>
                <Btn small title={a.kind === 'SHARE' ? 'Approve' : 'Yes, I paid'} icon="checkmark-outline" onPress={() => respond(a.expenseId, 'APPROVE')} />
                <Btn small variant="danger" title="Decline" icon="close-outline" onPress={() => respond(a.expenseId, 'DECLINE')} />
                <Btn small variant="ghost" title="Details" onPress={() => router.push({ pathname: '/expense/[id]', params: { id: a.expenseId } })} />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {/* Search & Main Controls */}
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Search by title, description or location..." />
      
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 }}>
        <Chips value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ value: 'mine', label: 'Involving me' }, { value: 'all', label: 'All visible' }]} />
        <Btn small variant={showFilters ? 'primary' : 'secondary'} title={showFilters ? 'Hide filters' : 'Filters'} icon="options-outline" onPress={() => setShowFilters((s) => !s)} />
      </Row>

      {showFilters ? (
        <Card style={{ gap: 10 }}>
          <Chips label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Any' }, ...['PENDING_APPROVAL', 'APPROVED', 'DECLINED', 'DISPUTED', 'SETTLED', 'CANCELLED'].map((s) => ({ value: s, label: label(s) }))]} />
          <Chips label="Category" value={category} onChange={setCategory} options={[{ value: '', label: 'Any' }, ...CATS.map((s) => ({ value: s, label: label(s) }))]} />
          <Chips label="Visibility" value={visibility} onChange={setVisibility} options={[{ value: '', label: 'Any' }, { value: 'PUBLIC', label: 'Public' }, { value: 'PRIVATE', label: 'Private' }]} />
          <Chips label="Payment Method" value={method} onChange={setMethod} options={[{ value: '', label: 'Any' }, ...['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((s) => ({ value: s, label: label(s) }))]} />
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Min ₹" value={min} onChangeText={setMin} keyboardType="decimal-pad" placeholder="0" /></View>
            <View style={{ flex: 1 }}><Field label="Max ₹" value={max} onChangeText={setMax} keyboardType="decimal-pad" placeholder="10000" /></View>
          </Row>
        </Card>
      ) : null}

      {/* Expenses List */}
      <SectionTitle>All Expenses</SectionTitle>
      {list.loading && !list.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : (list.data?.expenses ?? []).length === 0 ? (
        <Empty icon="receipt-outline" title="No expenses match" hint="Try clearing search filters or add a new expense." actionLabel="Create expense" onAction={() => router.push('/expense/new')} />
      ) : (
        list.data.expenses.map((e: any) => (
          <Card key={e.id} onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })} tone={e.status === 'DECLINED' ? 'danger' : e.status === 'PENDING_APPROVAL' ? 'warn' : undefined}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <Row style={{ flex: 1, gap: 10, alignItems: 'center' }}>
                <Avatar name={e.payerName ?? e.title} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">{e.title}</Txt>
                  <Txt variant="caption" tone="muted">{e.eventName} · {label(e.category)} · paid by {e.payerName ?? '—'}</Txt>
                </View>
              </Row>
              <Money paise={e.amountPaise} />
            </Row>

            <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <Badge text={e.status} tone={e.status === 'APPROVED' ? 'success' : e.status === 'DECLINED' ? 'danger' : e.status === 'PENDING_APPROVAL' ? 'warn' : 'neutral'} />
              {e.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}
              {e.payerType !== 'INDIVIDUAL' && e.payerType !== 'GROUP_MEMBER' ? <Badge text="Sponsored" tone="info" /> : null}
              {e.category === 'PERSONAL' ? <Badge text="Personal" tone="neutral" /> : null}
              <Txt variant="caption" tone="muted" style={{ marginLeft: 'auto' }}>{shortDate(e.spentAt)}</Txt>
            </Row>

            {e.myApproval ? (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                <Txt variant="caption">Your share: <Txt style={{ fontWeight: '700' }}>{formatINR(e.mySharePaise)}</Txt> ({label(e.myApproval)})</Txt>
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

