# Agent REST API

Base URL `http://localhost:8796`. Every request needs `Authorization: Bearer $INVOICE_API_TOKEN`
(the value in `.env.local`). JSON in, JSON out. Errors are `{"error": "<message>"}` with a 4xx/5xx status.
Money is integer cents. Dates are `YYYY-MM-DD`.

```bash
export TOKEN=$(grep ^INVOICE_API_TOKEN .env.local | cut -d= -f2)
export BASE=http://localhost:8796
```

Statuses: `draft`, `sent`, `paid`, `void`. `display_status` additionally returns `overdue` for sent invoices past due.

## List

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/invoices"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/invoices?status=overdue"   # draft|sent|paid|void|overdue
```

## Create a draft

Only `bill_to.name` is needed to be useful; missing fields default from Settings (number, currency, due date,
default tax, notes, payment options). `tax: null` forces no tax.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" "$BASE/api/v1/invoices" -d '{
  "bill_to": {"name": "Test Client", "company": "Acme", "email": "test@example.com",
              "cc": ["accounts@example.com"], "address": "123 Example St\nToronto, ON"},
  "currency": "CAD",
  "issue_date": "2026-11-18",
  "due_date": "2026-12-02",
  "items": [
    {"description": "AI workflow audit", "quantity": 2, "unit_price_cents": 15000},
    {"description": "Automation build", "quantity": 1, "unit_price_cents": 45050}
  ],
  "tax": {"name": "HST", "rate_percent": 13},
  "message": "Thanks for the call today.",
  "notes": "Due in 14 days.",
  "payment": {"etransfer": true, "card": false}
}'
```

Returns `201` with the invoice (including `id`, `number`, `subtotal_cents`, `tax_cents`, `total_cents`).
Optional `number` overrides the auto number; duplicates return `409`.

## Get / update (drafts only)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/invoices/$ID"

curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" "$BASE/api/v1/invoices/$ID" \
  -d '{"items":[{"description":"Audit","quantity":1,"unit_price_cents":20000}],"bill_to":{"email":"new@example.com"}}'
```

PATCH merges `bill_to` fields; `items` replaces the whole list. Non-draft invoices return `409` (void + duplicate instead).

## Send / resend

Emails the invoice (status becomes `sent`; calling it again on a sent invoice resends). `to` and `cc` are optional overrides.
Needs Google connected (or `EMAIL_TRANSPORT=file`). If card is on, a Stripe Payment Link is created first.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" "$BASE/api/v1/invoices/$ID/send" \
  -d '{"to":["test@example.com"],"cc":["accounts@example.com"]}'
```

## Mark paid

`method`: `etransfer`, `card`, `eft` or `other`. `date` and `note` optional. Only sent invoices can be marked paid.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" "$BASE/api/v1/invoices/$ID/mark-paid" \
  -d '{"method":"etransfer","date":"2026-11-20","note":"ref 123"}'
```

## Void

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/invoices/$ID/void"
```

Deactivates the Stripe Payment Link. A `warning` field appears if Stripe could not be reached.

## Duplicate

Creates a new draft with the same client, items, tax and notes (new number, today's dates).

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/invoices/$ID/duplicate"
```

## Sync card payment from Stripe

Checks the invoice's Payment Link for a completed, paid Checkout Session and marks it paid (method `card`).
The response includes `sync: {paid, note}`.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/invoices/$ID/sync"
```

## Preview the email HTML

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/invoices/$ID/preview" > preview.html
```

(The logo in the preview points at `/api/logo`; the sent email embeds it inline.)
