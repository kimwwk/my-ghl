# Kivov Invoices

Local, single-user invoicing. Create an invoice, email it to a client with Interac e-Transfer
instructions and an optional "Pay by card" Stripe Payment Link. Kim uses the web UI; her AI agent
uses the REST API ([AGENT_API.md](AGENT_API.md)).

The email **is** the invoice (GoHighLevel-style notification on top, the invoice document below, plus a PDF attachment): the full invoice is inline HTML, so the client never needs to reach this app.

## Run

```bash
npm install
cp .env.example .env.local        # then set INVOICE_API_TOKEN (openssl rand -hex 32)
export NODE_OPTIONS=--max-old-space-size=4096
npm run build
npm start                         # http://localhost:8796
```

`npm run dev` also serves on 8796. Data lives in `data/` (SQLite DB, `.eml` outbox, uploaded logo) and is gitignored, as are `.env*` files.

Set `EMAIL_TRANSPORT=file` to write full MIME messages to `data/outbox/<invoice>-<timestamp>.eml` instead of sending (dev/test).

## Setup in the UI (Settings)

1. **Business profile**: names, address, email, phone, tax number, logo, invoice prefix and next number, defaults.
2. **e-Transfer**: recipient email and instruction text (`{email}` and `{invoice}` are filled in).
3. **Stripe** (optional): paste a secret key, press Test connection. Without a key the card option is hidden.
4. **Email (Gmail)**: enable the Gmail API, create a Google Cloud OAuth client of type **Desktop app** (nothing else to
   register; Google accepts any loopback redirect), paste client ID and secret, press Connect Google. A Web application
   client also works if you add the redirect URI `http://localhost:8796/api/google/callback`. PKCE is always used.
   A consent screen left in "Testing" issues refresh tokens that expire after 7 days: publish it to "In production" or use an Internal Workspace app.

## Behaviour

- Drafts are editable. Sent invoices are locked: to change one, Void and Duplicate.
- Clients: saving an invoice saves its Bill to details to the Clients list (matched by name, newest non-empty details
  win). A new invoice picks a saved client under Bill to; the Clients page adds, edits and deletes them. The first
  start builds the list from existing invoices.
- Send creates a single-use Stripe Payment Link (when card is on), emails via Gmail `users.messages.send`, logs the send, sets status `sent`.
- Void deactivates the Payment Link. Marking paid by another method also deactivates it.
- `overdue` is derived (sent and past due), not stored. So are `refunded` and `part_refunded` (paid, with a refund recorded).
- Invoices brought over from GoHighLevel keep the PDF the client received at `data/imports/<number>.pdf`; the invoice page links it as "Original PDF (GHL)".
- Stripe paid-status sync: "Sync" button, and an automatic throttled (60 s) sync of sent invoices when the list loads.
  Webhook for later deployment: `POST /api/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`), or
  `stripe listen --forward-to localhost:8796/api/stripe/webhook`.
- Money is integer cents. Currencies: CAD (default), USD. Tax is one optional line (name + rate %).

## Layout

- `app/` pages (`/`, `/invoices/new`, `/invoices/[id]`, `/clients`, `/clients/[id]`, `/settings`), `app/actions.ts` server actions, `app/api/` routes
- `lib/` db, settings, invoices (validation + CRUD), clients (saved Bill to details), service (send / paid / void / sync), email-html (pure renderer, shared with the live preview), email (MIME + transport), google (OAuth + Gmail), stripe
- `components/` editor, settings form, shell, `ui/` shadcn components
- `docs/screenshots/` UI and email screenshots
