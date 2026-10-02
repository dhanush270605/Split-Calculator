import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useDebounced, useLoad } from '@/lib/hooks';
import {
  Avatar, Badge, Btn, Card, Chips, Empty, ErrorBox, Field, Money,
  Row, Screen, SectionTitle, Skeleton, Txt, confirm, notice, shortDate,
} from '@/ui/components';
import { formatINR, parseRupees } from '@/lib/money';
import { label, useTheme } from '@/ui/theme';

const CATS = ['FOOD', 'TRAVEL', 'ACCOMMODATION', 'HACKATHON', 'PERSONAL', 'SHOPPING', 'TICKETS', 'MEDICAL', 'OTHER'];
const CAT_ICONS: Record<string, string> = {
  FOOD: 'restaurant-outline', TRAVEL: 'car-outline', ACCOMMODATION: 'bed-outline',
  HACKATHON: 'code-slash-outline', PERSONAL: 'person-outline', SHOPPING: 'cart-outline',
  TICKETS: 'ticket-outline', MEDICAL: 'medkit-outline', OTHER: 'ellipsis-horizontal-circle-outline',
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

  useEffect(() => { list.reload(false); }, [qs]);

  const respond = async (id: number, decision: 'APPROVE' | 'DECLINE') => {
    try {
      if (decision === 'DECLINE' && !(await confirm('Decline this share?', 'The creator will be asked to correct it.', 'Decline'))) return;
      await post(`/expenses/${id}/respond`, { decision });
      await Promise.all([appr.reload(true), list.reload(true), refreshUnread()]);
    } catch (e) {
      notice('Could not respond', errMsg(e));
    }
  };

  return (
    <Screen onRefresh={() => { list.refresh(); appr.refresh(); }} refreshing={list.refreshing}>

      {/* ─ Header ─ */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="h1">Expenses</Txt>
        <Btn title="+ Add" icon="add-circle-outline" small gradient onPress={() => router.push('/expense/new')} />
      </Row>

      {/* ─ Pending Approvals ─ */}
      {(appr.data?.approvals ?? []).length > 0 ? (
        <>
          <SectionTitle title={`Action Required (${appr.data.approvals.length})`} />
          {appr.data.approvals.map((a: any) => (
            <Card key={`${a.kind}-${a.expenseId}`} tone="action">
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Txt variant="h3" numberOfLines={2}>{a.title}</Txt>
                  <Txt variant="small" tone="muted">{a.eventName} · by {a.creatorName}</Txt>
                </View>
                <Money paise={a.amountPaise} />
              </Row>
              <Txt variant="sub" tone="sub">
                {a.kind === 'SHARE'
                  ? `Your share: ${formatINR(a.sharePaise)}`
                  : 'Please confirm you paid this expense out-of-pocket.'}
              </Txt>
              <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                <Btn small title={a.kind === 'SHARE' ? 'Approve' : 'Yes, I paid'} icon="checkmark-outline"
                  onPress={() => respond(a.expenseId, 'APPROVE')} />
                <Btn small variant="danger" title="Decline" icon="close-outline"
                  onPress={() => respond(a.expenseId, 'DECLINE')} />
                <Btn small variant="ghost" title="Details"
                  onPress={() => router.push({ pathname: '/expense/[id]', params: { id: a.expenseId } })} />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {/* ─ Search & Filters ─ */}
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Search by title, description..." />

      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Chips
          value={mine ? 'mine' : 'all'}
          onChange={(v) => setMine(v === 'mine')}
          options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'All visible' }]}
        />
        <Btn
          small
          variant={showFilters ? 'primary' : 'secondary'}
          title={showFilters ? 'Hide' : 'Filters'}
          icon="options-outline"
          onPress={() => setShowFilters((s) => !s)}
        />
      </Row>

      {showFilters ? (
        <Card style={{ gap: 12 }}>
          <Chips label="Status" value={status} onChange={setStatus}
            options={[{ value: '', label: 'Any' }, ...['PENDING_APPROVAL', 'APPROVED', 'DECLINED', 'DISPUTED', 'SETTLED', 'CANCELLED'].map((s) => ({ value: s, label: label(s) }))]}
          />
          <Chips label="Category" value={category} onChange={setCategory}
            options={[{ value: '', label: 'Any' }, ...CATS.map((s) => ({ value: s, label: label(s) }))]}
          />
          <Chips label="Visibility" value={visibility} onChange={setVisibility}
            options={[{ value: '', label: 'Any' }, { value: 'PUBLIC', label: 'Public' }, { value: 'PRIVATE', label: 'Private' }]}
          />
          <Chips label="Payment Method" value={method} onChange={setMethod}
            options={[{ value: '', label: 'Any' }, ...['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((s) => ({ value: s, label: label(s) }))]}
          />
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Min ₹" value={min} onChangeText={setMin} keyboardType="decimal-pad" placeholder="0" /></View>
            <View style={{ flex: 1 }}><Field label="Max ₹" value={max} onChangeText={setMax} keyboardType="decimal-pad" placeholder="∞" /></View>
          </Row>
        </Card>
      ) : null}

      {/* ─ Expenses List ─ */}
      <SectionTitle title="Expenses" />
      {list.loading && !list.data ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </View>
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : (list.data?.expenses ?? []).length === 0 ? (
        <Empty
          icon="receipt-outline"
          title="No expenses match"
          hint="Try clearing search filters or add a new expense."
          actionLabel="Create expense"
          onAction={() => router.push('/expense/new')}
        />
      ) : (
        list.data.expenses.map((e: any) => (
          <Card
            key={e.id}
            onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
            tone={e.status === 'DECLINED' ? 'danger' : e.status === 'PENDING_APPROVAL' ? 'warn' : undefined}
          >
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Row style={{ flex: 1, gap: 12, alignItems: 'flex-start' }}>
                <Avatar name={e.payerName ?? e.title} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h3" numberOfLines={1}>{e.title}</Txt>
                  <Txt variant="small" tone="muted" numberOfLines={1}>
                    {e.eventName} · {label(e.category)} · {e.payerName ?? '—'}
                  </Txt>
                </View>
              </Row>
              <Money paise={e.amountPaise} />
            </Row>

            <Row style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Badge text={e.status} />
              {e.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : null}
              {e.payerType !== 'INDIVIDUAL' && e.payerType !== 'GROUP_MEMBER' ? <Badge text="Sponsored" tone="info" /> : null}
              <Txt variant="small" tone="muted" style={{ marginLeft: 'auto' }}>{shortDate(e.spentAt)}</Txt>
            </Row>

            {e.myApproval ? (
              <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                <Txt variant="small">
                  Your share: <Txt style={{ fontWeight: '700' }}>{formatINR(e.mySharePaise)}</Txt>
                  {' '}({label(e.myApproval)})
                </Txt>
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
