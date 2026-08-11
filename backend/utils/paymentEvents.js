// Breaks an order down into the individual moments money actually changed
// hands, each dated by when that specific payment happened — not by the
// order's creation date. A credit order paid 50 yesterday and 150 today is
// two events, not one lump under whichever day it happens to resolve to.
// This is what "sales" figures (Today's Sale, Gross Sales, etc.) must be
// built from; Order History's own row-level date/filter stays keyed off
// order.createdAt (when the order itself happened), a separate concern.
//
// A direct (non-credit) sale is one event: the full total, dated paidAt.
// A credit sale is one event per paymentHistory entry (partial or full
// settlements), each dated its own createdAt — paymentHistory is only ever
// populated by the credit-settlement flows (partialCreditPay/
// fullSettleCredit), never by payOrder, so presence of paymentHistory
// entries is what distinguishes "this was a credit sale" here.
//
// Refunds are netted against the most recent events first (LIFO) — the
// simplest defensible attribution for the rare case of a refund landing on
// an order that was paid across more than one day.
const EPSILON = 0.01;

export function getPaymentEvents(order) {
  const events = [];
  const creditPayments = order.paymentHistory || [];

  if (order.paidAt && creditPayments.length === 0) {
    events.push({ amount: order.total || 0, date: order.paidAt, type: 'direct' });
  }
  for (const payment of creditPayments) {
    if (!payment.createdAt) continue;
    events.push({ amount: payment.amount || 0, date: payment.createdAt, type: 'credit' });
  }

  let refundRemaining = (order.refundHistory || []).reduce((sum, r) => sum + (r.amount || 0), 0);
  for (let i = events.length - 1; i >= 0 && refundRemaining > EPSILON; i--) {
    const deduct = Math.min(events[i].amount, refundRemaining);
    events[i].amount -= deduct;
    refundRemaining -= deduct;
  }

  return events.filter((e) => e.amount > EPSILON);
}
