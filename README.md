# AI-Powered Receipt Splitting and PayPal Invoicing

> Turn a photo of a shared receipt into a clear, itemized split—and send
> person-specific PayPal invoices without manually re-entering the receipt or
> doing the tax math.

## The problem

After a group meal, trip, or shared purchase, one person is often left with a
long receipt and the awkward job of figuring out who owes what. Equal splits
can be unfair when people ordered different things; manual item-by-item splits
take time and make it easy to miss quantities, tax, or an item. Even once
everyone's share is calculated, the organizer still has to message people and
request payment.

Most payment flows start after the amount is known. This project addresses the
work before that: turning an unstructured receipt into a transparent,
person-by-person amount that can be acted on.

## The solution

The app combines multimodal AI, receipt-level allocation, and PayPal Invoicing
in one conversational workflow. Upload or photograph a receipt, then describe
the split in everyday language—for example, “Maya had the pasta, Omar had the
drinks, and the rest was mine.” The AI extracts the receipt details and applies
those instructions. Items without a named person are assigned to “self.”

The app presents the recognized items, quantities, prices, tax categories, and
totals for review. It calculates each named person's share and allocates tax
proportionally across taxable items. When the organizer chooses **Send invoices
now**, the backend creates a separate itemized PayPal invoice for each named
person. Items assigned to “self” are not invoiced. Invoice status can also be
looked up from the chat interface.

## How it works

1. **Capture** — Take a receipt photo or import an image.
2. **Describe the split** — Use plain language to say who had which items.
3. **Extract and allocate** — AI reads the receipt and returns structured
   items; the app calculates individual totals and proportional tax shares.
4. **Review** — Check the receipt card, item assignments, and what each person
   owes.
5. **Send and track** — Choose to send PayPal invoices, then look up invoice
   information through chat.

## Why it matters

- **Fairer than an equal split:** People are charged for the items assigned to
  them, rather than an arbitrary share of the whole bill.
- **Clearer requests:** Itemized invoices show how each amount was calculated,
  which can reduce confusion and back-and-forth.
- **Less organizer work:** Receipt extraction and tax allocation replace
  repetitive transcription and calculator steps.
- **A shorter path to payment:** The result is not just a split calculation;
  it can become a PayPal invoice from the same workflow.

The goal is to make settling shared expenses more accurate, transparent, and
less socially awkward. These are intended benefits; the project does not claim
measured time savings or payment outcomes.

## Built with

- **Next.js** for the receipt-upload and conversational interface.
- **Rust and Axum** for receipt processing, allocation, and invoice APIs.
- **PostgreSQL** for persisted receipt and item data.
- **AI model API** for image-based receipt extraction and natural-language
  allocation instructions.
- **PayPal Invoicing API** for creating, sending, and retrieving invoice
  information.
- **Docker Compose** to run the frontend, backend, and database together.

This is a hackathon prototype. PayPal runs in Sandbox by default, and invoice
delivery uses the recipient email configured by the backend; each invoice is
still itemized and named for its allocated person.

## Start the full stack with Docker

Requirements: Docker Desktop (or Docker Engine) with the Compose v2 plugin.

1. Copy `.env.example` to `.env` and set your PostgreSQL, model, and PayPal
   credentials. The example uses PayPal Sandbox.
2. Copy `.z-ai-config.example` to `.z-ai-config` and set the `baseUrl` and
   `apiKey` for the UI's Z.AI SDK. Keep both files private; they are ignored by
   Git.
3. From the repository root, run:

   ```bash
   docker compose up --build
   ```

Compose starts PostgreSQL, waits for its health check, starts the backend
(which applies database migrations before listening), and then starts the UI
once the backend is healthy. Open <http://localhost:3000>. The backend is also
available at <http://localhost:3001>.

The UI container calls the backend over the Compose network at
`http://backend:3001`; this is set automatically. PostgreSQL data is kept in a
named Docker volume when the stack is stopped with `docker compose down`.

To follow application logs, use `docker compose logs -f backend frontend`.
Set `DATABASE_HOST_PORT`, `BACKEND_HOST_PORT`, or `UI_HOST_PORT` in `.env` if
the default host ports are already in use.

## Services

- `postgres`: persistent PostgreSQL database.
- `backend`: Rust API, PayPal invoice integration, and receipt processing.
- `frontend`: Next.js standalone production server.

The PayPal client credentials and `MODEL_API_KEY` are passed only to the
backend. The Z.AI SDK config is mounted read-only into the frontend at runtime
and is not copied into either Docker image.
