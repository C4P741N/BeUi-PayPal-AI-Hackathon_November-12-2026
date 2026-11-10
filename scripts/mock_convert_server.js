// Mock receipt-processing backend: captures the exact request the app sends
// to /convert and replies with a valid receipt payload. Run: bun scripts/mock_convert_server.js
Bun.serve({
  port: 4545,
  async fetch(req) {
    const url = new URL(req.url)
    const body = await req.text()
    let parsed = {}
    try { parsed = JSON.parse(body) } catch {}
    const img = parsed.image ?? ""
    const record = {
      method: req.method,
      path: url.pathname,
      contentType: req.headers.get("content-type"),
      bodyKeys: Object.keys(parsed),
      hasTextField: "text" in parsed,
      imageStartsWith: img.slice(0, 16),
      imageIsRawBase64: /^[A-Za-z0-9+/=]+$/.test(img.slice(0, 200)) && !img.startsWith("data:"),
      imageLength: img.length,
    }
    await Bun.write("/tmp/mock-convert-capture.json", JSON.stringify(record, null, 2))
    console.log("[mock] captured:", JSON.stringify(record))
    return Response.json({
      date_time: "2020-10-18T20:24:00Z",
      items: [{ id: "0cd95972-5e2c-4f99-a12e-047bf9d07a5e", description: "Shampoo", purchased_for: "john", quantity: 1.0, tax_type: "T", total_price: 4.65, unit_price: 4.65 }],
      subtotal: 4.65, tax: 0.4, total: 5.05, transaction_number: "TEST12345",
    })
  },
})
console.log("[mock] listening on http://localhost:4545")
