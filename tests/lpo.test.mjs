import test from 'node:test';
import assert from 'node:assert/strict';
import { roundDiv, parse3, fmt3, orderTotals } from '../js/money.js';
import { validate, nextNumber, receive, cancel, close, canEdit } from '../js/orders.js';

// The sample order from the brief (DCT-REQ-0417).
const lines = () => [
  { description: 'Chilled water dispenser, installed', qty: 3000, unit: 'each', price: 45500, discountBp: 500, vatBp: 1000, received: 0 },
  { description: 'Annual maintenance contract', qty: 1000, unit: 'each', price: 1200000, discountBp: 0, vatBp: 1000, received: 0 },
  { description: 'Filter cartridge', qty: 24000, unit: 'each', price: 2375, discountBp: 0, vatBp: 1000, received: 0 },
  { description: 'Copper piping', qty: 12750, unit: 'metre', price: 3120, discountBp: 0, vatBp: 0, received: 0 },
];
const order = () => ({ status: 'open', buyer: { name: 'B' }, supplier: { name: 'S' },
  orderDate: '2026-11-10', dueDate: '2026-12-10', docDiscount: 50000, lines: lines() });

test('rounds half away from zero', () => {
  assert.equal(roundDiv(5, 10), 1);
  assert.equal(roundDiv(-5, 10), -1);
  assert.equal(roundDiv(4, 10), 0);
});

test('parses and formats 3 decimals without floats', () => {
  assert.equal(parse3('45.5'), 45500);
  assert.equal(parse3('1.2345'), null);
  assert.equal(fmt3(1510262), '1,510.262');
});

test('sample order totals', () => {
  const t = orderTotals(lines(), 50000);
  assert.equal(t.net, 1426455);
  const [g10, g0] = t.groups;
  assert.deepEqual([g10.rate, g10.discount, g10.taxable, g10.vat], [1000, 48606, 1338069, 133807]);
  assert.deepEqual([g0.rate, g0.discount, g0.taxable, g0.vat], [0, 1394, 38386, 0]);
  assert.equal(g10.discount + g0.discount, 50000); // discount splits exactly
  assert.equal(t.total, 1510262);
});

test('validation', () => {
  const o = order();
  o.lines[0].qty = 0; o.lines[1].price = -1; o.dueDate = '2026-11-01';
  assert.equal(validate(o).length, 3);
  assert.equal(validate(order()).length, 0);
});

test('numbering has no gaps and restarts each year', () => {
  let c = {};
  let r = nextNumber(c, '2026-11-10'); assert.equal(r.number, 'LPO-2026-0001'); c = r.counters;
  r = nextNumber(c, '2026-12-01'); assert.equal(r.number, 'LPO-2026-0002'); c = r.counters;
  r = nextNumber(c, '2027-01-02'); assert.equal(r.number, 'LPO-2027-0001');
});

test('receiving: refuses past ordered and says what is pending', () => {
  let r = receive(order(), 2, 10000);
  assert.ok(r.ok); assert.equal(r.order.status, 'partial');
  const bad = receive(r.order, 2, 15000);
  assert.ok(!bad.ok); assert.match(bad.error, /14\.000 pending/);
});

test('lock after first receipt', () => {
  assert.ok(canEdit(order()));
  assert.ok(!canEdit(receive(order(), 0, 1000).order));
});

test('status rules', () => {
  assert.ok(cancel(order()).ok);
  assert.ok(!close(order()).ok);                  // open cannot close
  let o = receive(order(), 0, 1000).order;
  assert.ok(!cancel(o).ok);                       // partial cannot cancel
  assert.equal(close(o).order.status, 'closed');
  assert.ok(!receive(close(o).order, 0, 1000).ok); // closed refuses everything
  assert.ok(!receive(cancel(order()).order, 0, 1000).ok); // cancelled too
  o = order();
  o.lines.forEach((l, i) => { o = receive(o, i, l.qty).order; });
  assert.equal(o.status, 'closed');               // auto-close when all received
});
