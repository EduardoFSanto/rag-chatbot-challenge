# VR Tech RAG API

Enterprise-grade knowledge base API with Retrieval-Augmented Generation (RAG) for VR Tech. Enables document upload (PDF/TXT), intelligent querying via chat with source citations, conversation history, and data isolation by user.

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript (ESM) |
| HTTP | Express |
| Auth | Better Auth (sessions + admin/user roles) |
| Relational DB | PostgreSQL + Drizzle ORM |
| Vector DB | Qdrant |
| Embeddings | Transformers.js (local, 384 dimensions) |
| LLM | Groq |
| Validation | Zod |
| Upload | Multer (in-memory, 10MB, PDF/TXT) |
| Dev/Deploy | Docker Compose + tsx watch |

## Architecture

Feature-based modular pattern (controller → service → repository), with shared infrastructure isolated:

```
src/
├── config/        # Centralized env var validation (Zod)
├── db/
│   ├── schema/    # Drizzle tables (auth, documents, conversations, messages)
│   ├── index.ts   # Drizzle client
│   └── migrate.ts # Migration runner
├── lib/           # Shared infrastructure
│   ├── storage/   # vectorStore (Qdrant) — single vector access point
│   ├── ingestion.ts   # Ingestion pipeline orchestration
│   ├── chunker.ts     # Configurable chunking
│   ├── embeddings.ts  # Local embedding generation
│   ├── llm.ts         # Groq client
│   ├── fileParser.ts  # Text extraction (PDF/TXT)
│   ├── apiResponse.ts # Standard response envelope
│   └── logger.ts
├── middleware/    # Global middlewares (auth, error handler, validation)
├── modules/
│   ├── documents/     # Upload, lifecycle, and document deletion
│   ├── conversations/ # Conversation history
│   └── query/         # RAG: retrieval + generation with citations
├── types/         # Global types (Express declaration merging)
├── app.ts         # Express composition
└── server.ts      # Bootstrap (boot sweep + listen)
```

Each module follows the separation:
- **controller** — HTTP only: validates input, calls service, translates result to status code.
- **service** — business rules and orchestration.
- **repository** — Drizzle queries (persistence).
- **routes** — route registration + auth middlewares.
- **schemas / types** — Zod validation and TypeScript contracts.

## Ingestion Pipeline

```
upload → SHA-256 → duplicate check
        → INSERT (status: processing)
        → parse → chunk → embedding → Qdrant upsert
        → UPDATE (status: processed)
```

### Document Lifecycle

```
processing → processed   (success)
processing → failed      (failure at any step, with compensatory cleanup in Qdrant)
failed     → processing  (automatic retry on next upload of same file)
```

### Idempotency

- SHA-256 hash of file content calculated before any processing.
- Two-layer verification: application check + `UNIQUE(file_hash)` constraint in database (protects against concurrency; violation 23505 is mapped to 409).
- Duplicate upload returns `409 CONFLICT` without reprocessing.
- Document with `failed` status accepts retry: partial chunks are cleaned in Qdrant before reprocessing.

### Crash Recovery (Boot Sweep)

On startup, every document stuck in `processing` is marked as `failed`, enabling retry.

> **Documented premise:** single-instance monolith — restarting the process kills any in-flight ingestion, so `processing` at boot is always stale. If multiple instances or workers are added later, this sweep must move out of boot.

### PostgreSQL ↔ Qdrant Consistency

No distributed transaction between the two systems. Strategy:
1. Qdrant is written **before** `UPDATE processed` — `processed` means "chunks exist in Qdrant".
2. On failure, compensatory execution: best-effort chunk cleanup in Qdrant + `UPDATE failed`.
3. Retry converges to correct state (idempotency by construction).

## Security

- **Authentication:** Better Auth; all business routes require valid session.
- **Role authorization:** upload requires `admin`.
- **Ownership on DELETE:** only document owner can delete (userId filter in query).
- **Retrieval filtering:** vector search is filtered by logged-in user's documents with `processed` status — no chunk from another user is retrieved, even if semantically relevant.
- **Confidence guardrail:** if best similarity score is below configured threshold, system responds "insufficient information found" **without calling LLM** (prevents hallucination). Current value (0.3) is initial guardrail, subject to future calibration with real evaluation.
- **Cascade delete:** deletion removes row in PostgreSQL and chunks in Qdrant.

## API

All responses follow standard envelope:

```json
{ "success": true,  "data": { ... }, "timestamp": "..." }
{ "success": false, "error": { "code": "CONFLICT", "message": "..." }, "timestamp": "..." }
```

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/documents/upload` | admin | PDF/TXT upload (multipart, field `file`) |
| DELETE | `/api/documents/:id` | owner | Deletes document + vectors |
| POST | `/api/ask` | user | RAG query (`{ question, conversationId? }`) |
| GET | `/api/conversations` | user | Lists user's conversations |
| GET | `/api/conversations/:id` | owner | Conversation + messages |
| GET | `/health` | — | Status + chunk count |
| ALL | `/api/auth/*` | — | Better Auth endpoints |

Example `/api/ask` response:

```json
{
  "success": true,
  "data": {
    "conversationId": "06dea507-...",
    "answer": "The standard procedure involves steps 1, 2 and 3...",
    "sources": [{ "file": "teste_maior.txt", "score": 0.4653 }],
    "confidence": 0.4653
  },
  "timestamp": "..."
}
```

## How to Run

```bash
cp .env.example .env   # fill in DATABASE_URL, BETTER_AUTH_SECRET, GROQ_API_KEY, etc.

docker compose -f docker-compose.dev.yml up -d   # postgres + qdrant + api

npm run db:generate    # generate migration when altering schemas
npm run db:migrate     # apply migrations
```

Main variables: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GROQ_API_KEY`, `QDRANT_URL`, `COLLECTION_NAME`, `PORT`.

RAG parameters (chunk size, overlap, retrieval K, similarity threshold, LLM temperature) are centralized in `src/lib/config.ts` — no magic numbers scattered in code.

## Architecture Premises and Decisions

1. Single-instance monolith (boot sweep as crash recovery).
2. No distributed transaction PG ↔ Qdrant; consistency via lifecycle + compensation + retry.
3. Confidence threshold 0.3 is initial; future calibration depends on evaluation with real documents.
4. Prompt instructs LLM to respond only with context, but prompt **is not security** — real barriers are authorization, retrieval filtering, and guardrail.

## Known Limitations and Roadmap

- [ ] Automated tests (unit, integration, API)
- [ ] RAG evaluation with real dataset (recall, citation accuracy, faithfulness)
- [ ] Hybrid search (semantic + keyword) for codes and exact identifiers
- [ ] Structured observability (requestId, durations per pipeline stage)
- [ ] Empirical calibration of chunking and threshold
- [ ] Next.js frontend consuming this API