# LPO Maker

A small web app that turns a purchase request into a Local Purchase Order PDF, then tracks the goods as they arrive.

- No login, no server, no database. Everything is saved in your browser (localStorage).
- Plain HTML, CSS and JavaScript modules. No build step.
- PDF made in the browser with jsPDF (bundled in `vendor/`).

**Sample order PDF:** [`sample/sample-order.pdf`](sample/sample-order.pdf), made by the app from the sample order (total BD 1,510.262).

## What it does

- Enter an order and see line nets, VAT and totals update live as you type.
- Issue it. It gets a number like `LPO-2026-0001`.
- Record goods received line by line. Over-receiving is refused and the message says how much is pending.
- Cancel an open order, or close a partially received one.
- Download the LPO as a PDF with ordered, received and pending per line.
- "Load sample order" fills the form with the brief's sample order.

## Files

| File | What's in it |
|---|---|
| `js/money.js` | All money math. Pure functions, tested. |
| `js/orders.js` | Validation, numbering, receiving, status rules. Pure functions, tested. |
| `js/app.js` | The screens and button handling. |
| `js/pdf.js` | Builds the PDF. |
| `js/store.js` | Load and save to localStorage. |
| `tests/lpo.test.mjs` | Tests, including the sample order's exact totals. |

## Decisions worth knowing

**Money is never a float.** Amounts are stored as integer fils (BD 45.500 is `45500`), quantities as thousandths (12.750 m is `12750`), percents as basis points (5% is `500`). Input text is parsed straight to integers, never through `parseFloat`. `0.1 + 0.2` problems cannot happen.

**Rounding is half away from zero**, done in one function (`roundDiv`) using integer division.

**Discount and VAT follow the rules in order:**
1. Line net = qty x price, less the line discount (rounded to the fils).
2. Line nets are grouped by VAT rate.
3. The document discount is split across the groups by their net. The last group takes the leftover fraction, so the shares always add up to exactly the discount. Groups run from the highest rate to the lowest, so the lowest rate group is "last".
4. VAT is computed once per group, after its discount share. Never per line.

Sample order: 10% group net 1,386.675 takes 48.606 of the discount, the 0% group takes the leftover 1.394. VAT 133.807. Total 1,510.262.

**Numbering has no gaps.** A number is only taken when an order is issued, not when a form is opened. Issued orders cannot be deleted, only cancelled, so every number stays in the sequence. The counter restarts each year (`LPO-2027-0001`).

**Status:** open, then partial after the first receipt, then closed automatically when everything is received. Open can cancel. Partial can only close. Closed and cancelled refuse everything.

**Lock:** lines can be edited only while the order is open with nothing received. The check runs again at save time.

## Limits (on purpose)

- Data lives in one browser. Clearing site data deletes it, and another device will not see it. A real version would need a server and database, and then the totals and numbering would move to the server.
- If two tabs issue an order at the same moment, they reload the counter right before issuing, but localStorage has no true lock. With one user that is acceptable.

## Run it

Open with any static server, for example:

```
python3 -m http.server
```

Then go to http://localhost:8000. Opening `index.html` directly from disk will not work, because browsers block JS modules on `file://`.

Tests (Node 18+): `npm test`
