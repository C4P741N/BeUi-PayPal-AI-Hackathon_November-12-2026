"# PayPal-AI-Hackathon_November-12-2026"
run project using the command

cargo run

a sample request can be found in requests.http

`GET /invoices` lists invoices from the configured PayPal environment. The
frontend uses this endpoint to answer invoice status questions and show the
matching invoices in chat.

`POST /invoice` creates and sends a separate PayPal invoice for each named
debtor allocated on the receipt. Each invoice contains that person's items and
their proportional share of tax, uses the allocated name, and still sends to
the configured PayPal recipient email. It does not invoice items assigned to
`self`. Before sending, the endpoint checks for a legacy invoice using the
receipt transaction number and stops if one exists, to avoid duplicate charges.

Invoice-list requests and response summaries are logged by default. To log the
full PayPal response body for local debugging, run with
`PAYPAL_HTTP_DEBUG=1 cargo run`. Full responses contain recipient information;
do not share those logs publicly. Authorization headers and access tokens are
never logged.

## PayPal invoice credentials

The invoice endpoint obtains a short-lived access token through PayPal OAuth.
Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env` using credentials
for the same environment as `PAYPAL_ROUTE` (sandbox by default). The OAuth URL
is derived from `PAYPAL_ROUTE`; set `PAYPAL_OAUTH_ROUTE` only if you need to
override it. Keep credentials private and out of version control.
