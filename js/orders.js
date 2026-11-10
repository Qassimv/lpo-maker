// Order rules: validation, numbering, receiving, status. Pure functions, no DOM.
import { fmt3 } from './money.js';

// Every action returns { ok: true, order } or { ok: false, error }.

const fail = (error) => ({ ok: false, error });
const ok = (order) => ({ ok: true, order });

// Rule 5: quantity above zero, price zero or more, due date not before order date.
export function validate(order) {
  const errors = [];
  if (!order.buyer?.name?.trim()) errors.push('Buyer name is required.');
  if (!order.supplier?.name?.trim()) errors.push('Supplier name is required.');
  if (!order.orderDate) errors.push('Order date is required.');
  if (!order.dueDate) errors.push('Due date is required.');
  if (order.orderDate && order.dueDate && order.dueDate < order.orderDate)
    errors.push('Due date cannot be before the order date.');
  if (!order.lines.length) errors.push('Add at least one line.');
  order.lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.description?.trim()) errors.push(`Line ${n}: description is required.`);
    if (!(l.qty > 0)) errors.push(`Line ${n}: quantity must be above zero.`);
    if (!(l.price >= 0)) errors.push(`Line ${n}: price must be zero or more.`);
  });
  if (!(order.docDiscount >= 0)) errors.push('Document discount must be zero or more.');
  return errors;
}

// Rule 9: LPO-2026-0001, no gaps within a year. The counter only moves when an
// order is actually issued, and issued orders are never deleted, so no gaps.
export function nextNumber(counters, orderDate) {
  const year = orderDate.slice(0, 4);
  const n = (counters[year] ?? 0) + 1;
  return { number: `LPO-${year}-${String(n).padStart(4, '0')}`, counters: { ...counters, [year]: n } };
}

const hasReceipts = (order) => order.lines.some((l) => l.received > 0);

// Rule 7: lines are editable only while open and before the first receipt.
export const canEdit = (order) => order.status === 'open' && !hasReceipts(order);

// Rule 6: never receive past the ordered quantity; refuse and say what is pending.
export function receive(order, lineIndex, qty) {
  if (order.status === 'closed' || order.status === 'cancelled')
    return fail(`This order is ${order.status}. Nothing more can be received.`);
  const line = order.lines[lineIndex];
  if (!line) return fail('No such line.');
  if (!(qty > 0)) return fail('Received quantity must be above zero.');
  const pending = line.qty - line.received;
  if (qty > pending) return fail(`Only ${fmt3(pending)} pending on line ${lineIndex + 1}. Refused.`);

  const lines = order.lines.map((l, i) => (i === lineIndex ? { ...l, received: l.received + qty } : l));
  const allIn = lines.every((l) => l.received === l.qty);
  // Rule 8: open -> partial -> closed when everything is received.
  return ok({ ...order, lines, status: allIn ? 'closed' : 'partial' });
}

// Rule 8: open can cancel. Partial can only close. Closed and cancelled refuse everything.
export function cancel(order) {
  if (order.status !== 'open') return fail(`A ${order.status} order cannot be cancelled.`);
  return ok({ ...order, status: 'cancelled' });
}

export function close(order) {
  if (order.status !== 'partial') return fail(`Only a partially received order can be closed.`);
  return ok({ ...order, status: 'closed' });
}
