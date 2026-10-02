import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchAttachmentUri, get, post, uploadAttachment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errMsg, useLoad } from '@/lib/hooks';
import { formatINR } from '@/lib/money';
import { Badge, Banner, Btn, Card, ErrorBox, Field, KV, Loading, Money, Row, Screen, SectionTitle, Txt, confirm, notice, shortDateTime } from '@/ui/components';
import { label } from '@/ui/theme';

function Evidence({ id, name }: { id: number; name: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { fetchAttachmentUri(id).then(setUri).catch(() => setFailed(true)); }, [id]);
  if (failed) return <Txt variant="small">Could not load {name}</Txt>;
  if (!uri) return <Txt variant="small">Loading {name}…</Txt>;
  if (uri.startsWith('data:application/pdf')) return <Txt variant="small">📄 {name} (PDF)</Txt>;
  return <Image source={{ uri }} style={{ width: 220, height: 220, borderRadius: 8 }} resizeMode="contain" accessibilityLabel={`Evidence ${name}`} />;
}

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, isAdmin, refreshUnread } = useAuth();
  const r = useLoad(() => get(`/expenses/${id}`), [id]);
  const [dispute, setDispute] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const x = r.data?.expense;
  if (r.loading && !x) return <Screen><Loading /></Screen>;
  if (r.error || !x) return <Screen><ErrorBox message={r.error ?? 'Expense not found'} onRetry={r.reload} /></Screen>;

  const myAlloc = x.allocations.find((a: any) => a.userId === me?.id);
  const iAmUnconfirmedPayer = x.payerUserId === me?.id && !x.payerConfirmed;
  const isCreator = x.creatorId === me?.id;
  const canRespond =(myAlloc?.approvalStatus === 'PENDING' || iAmUnconfirmedPayer || (myAlloc && !isCreator && ['APPROVED', 'DECLINED'].includes(myAlloc.approvalStatus))) && !['CANCELLED', 'SETTLED'].includes(x.status);
  const involved = isCreator || !!myAlloc || x.payerUserId === me?.id;
  const sponsored = !['INDIVIDUAL', 'GROUP_MEMBER'].includes(x.payerType);
  const run = async (fn: () => Promise<any>, okMsg?: string) => { try { await fn(); await r.reload(true); refreshUnread(); if (okMsg) notice('Done', okMsg); } catch (e) { notice('Could not complete', errMsg(e)); } };

  const addEvidence = async () => {
    const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (p.canceled) return;
    const a = p.assets[0];
    await run(() => uploadAttachment('EXPENSE', x.id, { uri: a.uri, name: a.fileName ?? 'evidence.jpg', mimeType: a.mimeType ?? 'image/jpeg', file: (a as any).file }, 'RECEIPT'));
  };

  return (
    <Screen onRefresh={r.refresh} refreshing={r.refreshing}>
      <Card tone={x.status === 'DECLINED' || x.status === 'DISPUTED' ? 'danger' : x.status === 'PENDING_APPROVAL' ? 'warn' : undefined}>
        <Row style={{ justifyContent: 'space-between' }}><Txt variant="h2" style={{ flex: 1 }}>{x.title}</Txt><Money paise={x.amountPaise} big /></Row>
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge text={x.status} />{x.visibility === 'PRIVATE' ? <Badge text="Private" tone="action" /> : <Badge text="Public" tone="neutral" />}
          {sponsored ? <Badge text="Sponsored" tone="info" /> : null}{x.category === 'PERSONAL' ? <Badge text="Personal" tone="neutral" /> : null}
        </Row>
        {x.status === 'DECLINED' ? <Banner tone="danger" text="A participant declined. The creator should edit and resubmit." /> : null}
        {sponsored ? <Banner tone="info" text="Paid by a sponsor: members owe nothing for this expense." /> : null}
        <KV k="Category" v={`${label(x.category)}${x.subcategory ? ` · ${x.subcategory}` : ''}`} />
        <KV k="Paid by" v={x.payerDisplayName} /><KV k="Created by" v={x.creatorName} />
        <KV k="Payment" v={label(x.paymentMethod)} /><KV k="Split" v={label(x.splitMethod)} /><KV k="When" v={shortDateTime(x.spentAt)} />
        <KV k="Where" v={x.location} /><KV k="Route" v={x.fromLocation || x.toLocation ? `${x.fromLocation ?? ''} → ${x.toLocation ?? ''}` : ''} />
        <KV k="Private reason" v={x.privateReason} /><KV k="Description" v={x.description} /><KV k="Notes" v={x.notes} />
        {!x.payerConfirmed && x.payerUserId ? <Banner tone="warn" text="Waiting for the named payer to confirm they paid." /> : null}
      </Card>

      {canRespond ? (
        <Card tone="action">
          <Txt variant="h3">{iAmUnconfirmedPayer ? 'Did you pay this?' : `Your share: ${formatINR(myAlloc?.sharePaise)}`}</Txt>
          <Row>
            {myAlloc?.approvalStatus !== 'APPROVED' || iAmUnconfirmedPayer ? <Btn title={iAmUnconfirmedPayer ? 'Yes, I paid' : 'Approve'} onPress={() => run(() => post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' }))} /> : null}
            {myAlloc?.approvalStatus !== 'DECLINED' || iAmUnconfirmedPayer ? <Btn variant="danger" title="Decline" onPress={async () => { if (await confirm('Decline?', 'The creator will be asked to correct this expense.', 'Decline')) await run(() => post(`/expenses/${x.id}/respond`, { decision: 'DECLINE' })); }} /> : null}
          </Row>
        </Card>
      ) : null}

      <SectionTitle>Who benefited</SectionTitle>
      <Card>
        {x.allocations.map((a: any) => (
          <Row key={a.userId} style={{ justifyContent: 'space-between' }}>
            <Txt style={{ flex: 1 }}>{a.name}{a.userId === me?.id ? ' (you)' : ''}</Txt>
            <Badge text={a.approvalStatus} /><Txt style={{ fontWeight: '700', minWidth: 90, textAlign: 'right' }}>{formatINR(a.sharePaise)}</Txt>
          </Row>
        ))}
        <Txt variant="small">Only approved shares become settlement debt.</Txt>
      </Card>

      <SectionTitle>Evidence</SectionTitle>
      <Card>
        {x.attachments.length === 0 ? <Txt variant="sub">No evidence attached.</Txt> : x.attachments.map((a: any) => <Evidence key={a.id} id={a.id} name={a.originalName} />)}
        {(isCreator || isAdmin || x.payerUserId === me?.id) ? <Btn small variant="secondary" icon="attach-outline" title="Add evidence" onPress={addEvidence} /> : null}
      </Card>

      {x.disputes.length ? (
        <>
          <SectionTitle>Disputes</SectionTitle>
          {x.disputes.map((d: any) => <Card key={d.id} tone="danger"><Row style={{ justifyContent: 'space-between' }}><Txt variant="h3">{d.reason}</Txt><Badge text={d.status} /></Row><Txt variant="sub">{d.raisedByName} · {shortDateTime(d.createdAt)}</Txt>{d.message ? <Txt>{d.message}</Txt> : null}{d.resolutionNote ? <Txt variant="sub">Resolution: {d.resolutionNote}</Txt> : null}</Card>)}
        </>
      ) : null}

      <Card>
        {(isCreator || isAdmin) && !['CANCELLED'].includes(x.status) && (x.status !== 'SETTLED' || isAdmin) ? (
          <Btn variant="secondary" icon="create-outline" title="Edit expense" onPress={() => router.push({ pathname: '/expense/new', params: { editId: x.id } })} />
        ) : null}
        {(involved || isAdmin) && x.status !== 'CANCELLED' ? <Btn variant="secondary" icon="flag-outline" title="Report / dispute" onPress={() => setDispute((d) => !d)} /> : null}
        {dispute ? (
          <>
            <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Wrong amount" />
            <Field label="Message (optional)" value={msg} onChangeText={setMsg} multiline />
            <Btn title="Submit dispute" onPress={() => run(async () => { await post(`/expenses/${x.id}/dispute`, { reason, message: msg || null }); setDispute(false); setReason(''); setMsg(''); }, 'The admin has been notified.')} />
          </>
        ) : null}
        {(isCreator || isAdmin) && !['CANCELLED', 'SETTLED'].includes(x.status) ? (
          <Btn variant="danger" title="Cancel expense" onPress={async () => { if (await confirm('Cancel this expense?', 'It will no longer count toward balances. History is kept.', 'Cancel expense')) await run(() => post(`/expenses/${x.id}/cancel`, { reason: isAdmin && !isCreator ? 'Cancelled by admin' : undefined })); }} />
        ) : null}
      </Card>

      {x.history.length ? (
        <>
          <SectionTitle>History</SectionTitle>
          <Card>{x.history.map((h: any) => <KV key={h.id} k={shortDateTime(h.createdAt)} v={`${label(h.action)} · ${h.actorName ?? 'System'}`} />)}</Card>
        </>
      ) : null}
    </Screen>
  );
}
