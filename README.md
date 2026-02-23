# RAG Chatbot API

A production-ready Retrieval-Augmented Generation system that enables document upload, intelligent chunking, semantic search, and context-aware question answering with automatic citations.

## Technical Overview

**Core Technologies:**
- Node.js + TypeScript + Express
- Transformers.js (local embeddings)
- Groq (LLM inference)
- In-memory vector store with cosine similarity

**Key Features:**
- PDF and text file upload with automatic processing
- Configurable chunking with overlap (2000/500 chars)
- Local embedding generation (384-dimensional vectors)
- Semantic search with similarity threshold filtering
- LLM-powered answers with source attribution
- Retrieval statistics and transparency metrics

## Architecture

```
Upload Flow:
File → Parse → Chunk → Embed (local) → Store

Query Flow:
Question → Embed → Vector Search → Retrieve Top-K → LLM → Response + Citations
```

**Components:**
- `fileParser`: Handles PDF and TXT extraction
- `chunker`: Splits documents with configurable overlap
- `embeddingService`: Generates embeddings using Transformers.js
- `vectorStore`: In-memory storage with cosine similarity search
- `llmService`: Groq integration for response generation
- `promptService`: Context-aware prompt construction

## Installation

```bash
npm install
```

## Configuration

Create `.env` file:

```env
GROQ_API_KEY=your_groq_api_key
PORT=3000
NODE_ENV=development
```

Get your Groq API key at: https://console.groq.com/keys

## Usage

**Start server:**
```bash
npm run dev
```

**API Endpoints:**

```bash
# Upload document
POST /api/upload
Content-Type: multipart/form-data
Body: file (PDF or TXT)

# Ask question
POST /api/ask
Content-Type: application/json
Body: { "question": "Your question here" }

# Health check
GET /health
```

**Web Interface:**
Navigate to `http://localhost:3000` for the web UI.

## Design Decisions

**Local Embeddings:**
Chose Transformers.js over API-based solutions to eliminate rate limits, reduce operational costs, and improve latency (50-100ms vs 200-500ms). Trade-off: 90MB model download on first run.

**Groq for LLM:**
Selected for superior inference speed, generous free tier, and stable performance during development. Architecture remains provider-agnostic for easy migration.

**In-Memory Vector Store:**
Optimal for prototype and demonstration. Production deployment would migrate to Pinecone or Weaviate for persistence and scalability.

## Production Considerations

For production deployment:
- Migrate vector store to Pinecone/Weaviate
- Implement Redis caching for frequent queries
- Add JWT authentication
- Configure rate limiting per user
- Set up monitoring and logging
- Consider hybrid search (semantic + keyword)

## Configuration Options

All parameters are configurable in `src/utils/config.ts`:

```typescript
rag: {
  chunkSize: 2000,           // Characters per chunk
  chunkOverlap: 500,         // Overlap between chunks
  retrievalK: 5,             // Number of chunks to retrieve
  similarityThreshold: 0.3,  // Minimum similarity score
  llmTemperature: 0.1        // LLM creativity (lower = more factual)
}
```

## Project Structure

```
src/
├── api/
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Error handling
│   └── routes/         # Route definitions
├── core/
│   ├── chunker.ts      # Text chunking logic
│   ├── embeddings.ts   # Local embedding generation
│   ├── fileParser.ts   # PDF/TXT parsing
│   ├── llm.ts          # Groq integration
│   └── prompt.ts       # Prompt construction
├── storage/
│   └── vectorStore.ts  # In-memory vector storage
├── types/
│   └── index.ts        # TypeScript interfaces
└── utils/
    ├── config.ts       # Configuration management
    └── logger.ts       # Logging utilities
```

## Testing

The system has been tested with:
- Multiple document types (PDF, TXT)
- Various question formats (factual, conceptual)
- Edge cases (no documents, irrelevant questions)
- Multi-document retrieval scenarios

## Performance

Typical query latency:
- Embedding generation: ~50-100ms
- Vector search: ~5-10ms
- LLM inference: ~500-1500ms
- Total: ~1-2 seconds

## License

MIT
