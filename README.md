# PayPal AI Hackathon

This repository combines the Rust receipt/PayPal backend and the Next.js UI.
The original projects are under `backend/` and `frontend/`; their Git histories
are preserved in this repository.

## Start the full stack with Docker

Requirements: Docker Desktop (or Docker Engine) with the Compose v2 plugin.

1. Copy `.env.example` to `.env` and set your PostgreSQL, model, and PayPal
   credentials. The example uses PayPal Sandbox.
2. Copy `.z-ai-config.example` to `.z-ai-config` and set the `baseUrl` and
   `apiKey` for the UI's Z.AI SDK. Both files are private and ignored by Git.
3. From this directory, run:

   ```powershell
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
