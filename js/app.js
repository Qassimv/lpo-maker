// Screens: order list, order form (new / edit), order view (receive, cancel, close, PDF).
import { parse3, parsePercent, fmt3, lineAmounts, orderTotals } from './money.js';
import { validate, nextNumber, receive, cancel, close, canEdit } from './orders.js';
import { load, save } from './store.js';
import { fmtDate, pct, isoDate } from './format.js';
import { downloadPdf } from './pdf.js';

const app = document.getElementById('app');
let data = load();
let view = { name: 'list' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const findOrder = (id) => data.orders.find((o) => o.id === id);
const persist = () => save(data);

// ---------- form <-> order conversion ----------

const emptyLine = () => ({ description: '', qty: '1', unit: 'each', price: '0', discount: '', vat: '1000' });
const emptyParty = () => ({ name: '', address: '', vat: '' });

function blankForm() {
  return { buyer: emptyParty(), supplier: emptyParty(), reference: '', orderDate: isoDate(0),
    dueDate: isoDate(30), docDiscount: '0', lines: [emptyLine()] };
}

function sampleForm() {
  return {
    buyer: { name: 'Dilmun Coastal Trading W.L.L.', address: 'Manama, Kingdom of Bahrain', vat: '200000000000001' },
    supplier: { name: 'Gulf Pipe Supplies W.L.L.', address: 'Sitra, Kingdom of Bahrain', vat: '200000000000002' },
    reference: 'DCT-REQ-0417', orderDate: isoDate(0), dueDate: isoDate(30), docDiscount: '50.000',
    lines: [
      { description: 'Chilled water dispenser, installed', qty: '3', unit: 'each', price: '45.500', discount: '5', vat: '1000' },
      { description: 'Annual maintenance contract', qty: '1', unit: 'each', price: '1200.000', discount: '', vat: '1000' },
      { description: 'Filter cartridge', qty: '24', unit: 'each', price: '2.375', discount: '', vat: '1000' },
      { description: 'Copper piping', qty: '12.750', unit: 'metre', price: '3.120', discount: '', vat: '0' },
    ],
  };
}

function formFromOrder(o) {
  return {
    buyer: { ...o.buyer }, supplier: { ...o.supplier }, reference: o.reference,
    orderDate: o.orderDate, dueDate: o.dueDate, docDiscount: fmt3(o.docDiscount).replace(/,/g, ''),
    lines: o.lines.map((l) => ({ description: l.description, qty: fmt3(l.qty).replace(/,/g, ''), unit: l.unit,
      price: fmt3(l.price).replace(/,/g, ''), discount: l.discountBp ? String(l.discountBp / 100) : '', vat: String(l.vatBp) })),
  };
}

// Turns the text fields into integer amounts. Returns { order, errors }.
function readForm(f) {
  const errors = [];
  const num = (text, label) => {
    const v = parse3(text);
    if (v === null) errors.push(`${label}: enter a number with up to 3 decimals.`);
    return v;
  };
  const lines = f.lines.map((l, i) => {
    const discountBp = parsePercent(l.discount);
    if (discountBp === null) errors.push(`Line ${i + 1} discount: enter a percent from 0 to 100.`);
    return { description: l.description.trim(), unit: l.unit.trim() || 'each',
      qty: num(l.qty, `Line ${i + 1} quantity`), price: num(l.price, `Line ${i + 1} price`),
      discountBp: discountBp ?? 0, vatBp: Number(l.vat), received: 0 };
  });
  const order = { buyer: trimParty(f.buyer), supplier: trimParty(f.supplier), reference: f.reference.trim(),
    orderDate: f.orderDate, dueDate: f.dueDate, docDiscount: num(f.docDiscount, 'Document discount'), lines };
  if (!errors.length) errors.push(...validate(order));
  return { order, errors };
}
const trimParty = (p) => ({ name: p.name.trim(), address: p.address.trim(), vat: p.vat.trim() });

// ---------- rendering ----------

function render() {
  if (view.name === 'list') app.innerHTML = listView();
  if (view.name === 'edit') { app.innerHTML = formView(); updateTotals(); }
  if (view.name === 'view') app.innerHTML = orderView(findOrder(view.id));
  window.scrollTo(0, 0);
}

const badge = (status) => `<span class="badge ${status}">${status}</span>`;

function listView() {
  const rows = [...data.orders].reverse().map((o) => {
    const t = orderTotals(o.lines, o.docDiscount);
    return `<tr data-open="${o.id}" tabindex="0">
      <td class="mono">${esc(o.number)}</td><td>${esc(o.supplier.name)}</td>
      <td>${fmtDate(o.orderDate)}</td><td class="num mono">${fmt3(t.total)}</td><td>${badge(o.status)}</td></tr>`;
  }).join('');
  return `
    <div class="bar"><h1>Purchase orders</h1>
      <div class="actions"><button class="ghost" data-act="sample">Load sample order</button>
      <button data-act="new">New order</button></div></div>
    ${data.orders.length ? `<div class="card scroll"><table class="list"><thead><tr><th>Number</th><th>Supplier</th>
      <th>Date</th><th class="num">Total BD</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="card empty">No orders yet. Start a new one, or load the sample order to see how it works.</div>`}`;
}

function partyFields(key, label) {
  const p = view.form[key];
  return `<fieldset class="card"><legend>${label}</legend>
    <label>Name<input data-f="${key}.name" value="${esc(p.name)}"></label>
    <label>Address<input data-f="${key}.address" value="${esc(p.address)}"></label>
    <label>VAT number<input data-f="${key}.vat" value="${esc(p.vat)}" inputmode="numeric"></label></fieldset>`;
}

function formView() {
  const f = view.form;
  const editing = view.id ? findOrder(view.id) : null;
  const lineRows = f.lines.map((l, i) => `
    <tr>
      <td class="no">${i + 1}</td>
      <td><input data-line="${i}" data-k="description" value="${esc(l.description)}" aria-label="Description"></td>
      <td><input class="num" data-line="${i}" data-k="qty" value="${esc(l.qty)}" inputmode="decimal" aria-label="Quantity"></td>
      <td><input data-line="${i}" data-k="unit" value="${esc(l.unit)}" aria-label="Unit"></td>
      <td><input class="num" data-line="${i}" data-k="price" value="${esc(l.price)}" inputmode="decimal" aria-label="Price"></td>
      <td><input class="num" data-line="${i}" data-k="discount" value="${esc(l.discount)}" placeholder="0" inputmode="decimal" aria-label="Discount %"></td>
      <td><select data-line="${i}" data-k="vat" aria-label="VAT">
        <option value="1000" ${l.vat === '1000' ? 'selected' : ''}>10%</option>
        <option value="0" ${l.vat === '0' ? 'selected' : ''}>0%</option></select></td>
      <td class="num mono" data-linenet="${i}"></td>
      <td><button class="icon" data-act="remove-line" data-i="${i}" ${f.lines.length === 1 ? 'disabled' : ''} aria-label="Remove line">&times;</button></td>
    </tr>`).join('');
  return `
    <div class="bar"><h1>${editing ? `Edit ${esc(editing.number)}` : 'New purchase order'}</h1>
      <button class="ghost" data-act="${editing ? 'back-view' : 'back-list'}">Back</button></div>
    <div class="grid2">${partyFields('buyer', 'Buyer')}${partyFields('supplier', 'Supplier')}</div>
    <div class="card grid3">
      <label>Reference<input data-f="reference" value="${esc(f.reference)}"></label>
      <label>Order date<input type="date" data-f="orderDate" value="${esc(f.orderDate)}" ${editing ? 'disabled' : ''}></label>
      <label>Due date<input type="date" data-f="dueDate" value="${esc(f.dueDate)}"></label>
    </div>
    <div class="card scroll"><table class="lines">
      <thead><tr><th>No</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th>
      <th class="num">Disc %</th><th>VAT</th><th class="num">Net</th><th></th></tr></thead>
      <tbody>${lineRows}</tbody></table>
      <div class="under"><button class="ghost small" data-act="add-line">+ Add line</button>
      <label class="inline-label">Document discount BD<input class="num" data-f="docDiscount" value="${esc(f.docDiscount)}" inputmode="decimal"></label></div></div>
    <div class="foot">
      <div class="card totals" id="totals"></div>
      <div class="side"><ul class="errors" id="errors"></ul>
        <button data-act="issue">${editing ? 'Save changes' : 'Issue LPO'}</button></div>
    </div>`;
}

// Live totals: recalculated on every keystroke without re-rendering the inputs.
function updateTotals() {
  const { order, errors } = readForm(view.form);
  view.form.lines.forEach((_, i) => {
    const cell = app.querySelector(`[data-linenet="${i}"]`);
    const l = order.lines[i];
    cell.textContent = l.qty !== null && l.price !== null ? fmt3(lineAmounts(l).net) : '-';
  });
  const box = app.querySelector('#totals');
  if (order.lines.every((l) => l.qty !== null && l.price !== null) && order.docDiscount !== null) {
    const t = orderTotals(order.lines, order.docDiscount);
    box.innerHTML = `<table>
      <tr><td>Net</td><td class="num mono">${fmt3(t.net)}</td></tr>
      <tr><td>Document discount</td><td class="num mono">-${fmt3(t.docDiscount)}</td></tr>
      ${t.groups.map((g) => `<tr class="sub"><td>VAT ${pct(g.rate)} on ${fmt3(g.taxable)} <span class="hint">(discount share ${fmt3(g.discount)})</span></td>
        <td class="num mono">${fmt3(g.vat)}</td></tr>`).join('')}
      <tr class="grand"><td>Total BD</td><td class="num mono">${fmt3(t.total)}</td></tr></table>`;
  } else {
    box.innerHTML = '<p class="hint">Totals appear once every amount is a valid number.</p>';
  }
  app.querySelector('#errors').innerHTML = errors.map((e) => `<li>${esc(e)}</li>`).join('');
}

function orderView(o) {
  const t = orderTotals(o.lines, o.docDiscount);
  const open = o.status === 'open' || o.status === 'partial';
  const rows = o.lines.map((l, i) => {
    const pending = l.qty - l.received;
    return `<tr><td class="no">${i + 1}</td><td>${esc(l.description)}</td><td>${esc(l.unit)}</td>
      <td class="num mono">${fmt3(l.qty)}</td><td class="num mono">${fmt3(l.received)}</td>
      <td class="num mono ${pending ? 'pending' : 'done'}">${fmt3(pending)}</td>
      <td class="num mono">${fmt3(lineAmounts(l).net)}</td>
      <td>${open && pending ? `<div class="recv"><input class="num" data-recv="${i}" placeholder="${fmt3(pending)}" inputmode="decimal" aria-label="Quantity to receive">
        <button class="small" data-act="receive" data-i="${i}">Receive</button></div>` : ''}</td></tr>`;
  }).join('');
  return `
    <div class="bar"><h1><span class="mono">${esc(o.number)}</span> ${badge(o.status)}</h1>
      <button class="ghost" data-act="back-list">All orders</button></div>
    <div class="card meta">
      <div><span class="k">Buyer</span>${esc(o.buyer.name)}</div><div><span class="k">Supplier</span>${esc(o.supplier.name)}</div>
      <div><span class="k">Reference</span>${esc(o.reference || '-')}</div>
      <div><span class="k">Order date</span>${fmtDate(o.orderDate)}</div><div><span class="k">Due date</span>${fmtDate(o.dueDate)}</div>
      <div><span class="k">Total BD</span><b class="mono">${fmt3(t.total)}</b></div></div>
    <div id="msg" class="msg" role="status"></div>
    <div class="card scroll"><table class="lines">
      <thead><tr><th>No</th><th>Description</th><th>Unit</th><th class="num">Ordered</th><th class="num">Received</th>
      <th class="num">Pending</th><th class="num">Net</th><th>Receive</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="actions">
      <button data-act="pdf">Download PDF</button>
      ${canEdit(o) ? '<button class="ghost" data-act="edit">Edit lines</button>' : ''}
      ${o.status === 'open' ? '<button class="ghost danger" data-act="cancel">Cancel order</button>' : ''}
      ${o.status === 'partial' ? '<button class="ghost" data-act="close">Close order</button>' : ''}
    </div>
    <p class="hint">${statusHint(o)}</p>`;
}

function statusHint(o) {
  if (o.status === 'open') return 'Lines can be edited until the first receipt.';
  if (o.status === 'partial') return 'Goods have arrived, so lines are locked. A partial order can be closed, not cancelled.';
  return `This order is ${o.status}. No further changes are possible.`;
}

const showMsg = (text, kind = 'error') => {
  const el = app.querySelector('#msg');
  el.className = `msg ${kind}`;
  el.textContent = text;
};

// ---------- events ----------

app.addEventListener('input', (e) => {
  if (view.name !== 'edit') return;
  const t = e.target;
  if (t.dataset.f) {
    const [a, b] = t.dataset.f.split('.');
    if (b) view.form[a][b] = t.value; else view.form[a] = t.value;
  } else if (t.dataset.line) {
    view.form.lines[Number(t.dataset.line)][t.dataset.k] = t.value;
  } else return;
  updateTotals();
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset.open) e.target.click();
  if (e.key === 'Enter' && e.target.dataset.recv) app.querySelector(`[data-act="receive"][data-i="${e.target.dataset.recv}"]`).click();
});

app.addEventListener('click', (e) => {
  const row = e.target.closest('[data-open]');
  if (row) { view = { name: 'view', id: row.dataset.open }; return render(); }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const o = view.id ? findOrder(view.id) : null;

  if (act === 'new') { view = { name: 'edit', id: null, form: blankForm() }; return render(); }
  if (act === 'sample') { view = { name: 'edit', id: null, form: sampleForm() }; return render(); }
  if (act === 'back-list') { view = { name: 'list' }; return render(); }
  if (act === 'back-view') { view = { name: 'view', id: view.id }; return render(); }
  if (act === 'add-line') { view.form.lines.push(emptyLine()); return render(); }
  if (act === 'remove-line') { view.form.lines.splice(Number(btn.dataset.i), 1); return render(); }
  if (act === 'edit') { view = { name: 'edit', id: o.id, form: formFromOrder(o) }; return render(); }
  if (act === 'pdf') return downloadPdf(o);

  if (act === 'issue') {
    const { order, errors } = readForm(view.form);
    if (errors.length) return app.querySelector('#errors').scrollIntoView({ block: 'center' });
    if (view.id) {
      // Re-check the lock at save time, in case goods arrived in another tab.
      data = load();
      const current = findOrder(view.id);
      if (!canEdit(current)) { alert('This order has received goods, so its lines are locked.'); view = { name: 'view', id: view.id }; return render(); }
      Object.assign(current, { ...order, number: current.number, orderDate: current.orderDate, status: current.status, id: current.id });
    } else {
      data = load(); // fresh counter, so two tabs cannot issue the same number
      const { number, counters } = nextNumber(data.counters, order.orderDate);
      data.counters = counters;
      data.orders.push({ ...order, id: crypto.randomUUID(), number, status: 'open', createdAt: new Date().toISOString() });
      view.id = data.orders.at(-1).id;
    }
    persist();
    view = { name: 'view', id: view.id };
    return render();
  }

  if (act === 'receive') {
    const i = Number(btn.dataset.i);
    const qty = parse3(app.querySelector(`[data-recv="${i}"]`).value);
    if (qty === null) return showMsg('Enter a quantity with up to 3 decimals.');
    return apply(receive(o, i, qty), `Received ${fmt3(qty)} on line ${i + 1}.`);
  }
  if (act === 'cancel' && confirm(`Cancel ${o.number}? This cannot be undone.`)) return apply(cancel(o), 'Order cancelled.');
  if (act === 'close' && confirm(`Close ${o.number}? Pending goods will no longer be expected.`)) return apply(close(o), 'Order closed.');
});

function apply(result, okText) {
  if (!result.ok) return showMsg(result.error);
  const i = data.orders.findIndex((x) => x.id === result.order.id);
  data.orders[i] = result.order;
  persist();
  render();
  showMsg(okText, 'ok');
}

render();
