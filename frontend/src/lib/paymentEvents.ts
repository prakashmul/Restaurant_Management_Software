import type { Order } from '../types';

// Breaks an order down into the individual moments money actually changed
// hands, each dated by when that specific payment happened — not by the
// order's creation date. A credit order paid 50 yesterday and 150 today is
// two events, not one lump under whichever day it happens to resolve to.
// Mirrors backend/utils/paymentEvents.js — keep the two in sync.
export interface PaymentEvent {
  amount: number;
  date: string;
  type: 'direct' | 'credit';
}

const EPSILON = 0.01;

export function getPaymentEvents(order: Order): PaymentEvent[] {
  const events: PaymentEvent[] = [];
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
