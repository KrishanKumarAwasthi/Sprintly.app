# ⚡ Sprintly — Gen Ai :Full-Stack Kanban Board

A production-ready Kanban board application built with **Next.js** (frontend) and **Express + Prisma** (backend). Features drag-and-drop cards, multi-board support, labels, checklists, and a fully responsive design.

Recently upgraded with an **AI/RAG Chatbot** powered by PostgreSQL `pgvector`, Gemini embeddings, and `gemini-2.5-flash`/`gemini-3.6-flash`.

### 🔗 [Live Demo → sprintly-new-gen.vercel.app](https://sprintly-new-gen.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![Express](https://img.shields.io/badge/Express-4.19-000?logo=express)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?logo=tailwind-css&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-AI-orange?logo=google-gemini)

---

## ✨ Features

- **Multi-Board Management** — Create, switch, and manage multiple Kanban boards.
- **Drag & Drop** — Reorder cards within lists and move cards across lists seamlessly.
- **AI Chatbot (RAG)** — Ask questions about your board context (e.g., "What are the overdue security tasks?").
- **Labels & Colors** — Color-coded labels for card categorization.
- **Checklists & Members** — Nested todo items inside cards and user assignments.
- **Search & Filter** — Filter cards by text, label, member, or due date natively.
- **Responsive Design** — Fully optimized for mobile (375px+), tablet (768px+), and desktop (1024px+).

---

## 🧠 AI / RAG Architecture

Sprintly utilizes an intentional, safe Retrieval-Augmented Generation (RAG) architecture where **PostgreSQL remains the absolute source of truth** and the `CardEmbedding` table acts as a derived index.

```text
Frontend Chat UI
       ↓
Express API (/api/v1/ai/chat)
       ↓
Retrieval Router (Gemini) classifies Intent
       ↓
Retrieval Execution Layer
   ├── STRUCTURED INTENT → Pure Prisma/PostgreSQL counts/filters
   ├── SEMANTIC INTENT → Gemini Embedding → pgvector Similarity Search
   └── HYBRID INTENT → Semantic Search Candidates + PostgreSQL Strict Filters
       ↓
Verified Context
       ↓
Answer Generation (Gemini 3.6 Flash)
       ↓
Response to Frontend
```

### Key AI Design Decisions
1. **Board Isolation**: Every AI query explicitly filters by `boardId`. Data from one board can never leak into another.
2. **Synchronous Limits, Async Syncing**: When a card is mutated (e.g. moved, renamed), a fire-and-forget sync process generates a new vector. This prevents API rate limits or Gemini downtime from crashing core CRUD operations.
3. **No Autonomous Database Mutability**: The LLM only receives read-only context. It cannot generate arbitrary SQL or write data to the DB.
4. **Structured Over Semantic**: If a user asks "How many cards are on the board?", the system uses structured database counts instead of unreliable vector similarity matches.

---

## 🏗️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.2.1 | React framework (App Router) |
| **React** | 19.2.4 | UI library |
| **Tailwind CSS** | 3.4.17 | Utility-first CSS styling |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Express.js** | 4.19.2 | REST API server |
| **Prisma ORM** | 5.x | Database ORM & migrations |
| **PostgreSQL** | 15+ | Relational database (requires `pgvector`) |
| **LangChain.js**| 1.2+ | AI tooling abstraction |
| **Zod** | 3.23.8 | Request validation |

---

## 🚀 Running Locally

### Prerequisites
- Node.js ≥ 18.x
- PostgreSQL database with `pgvector` enabled (Neon.tech provides this by default).
- A Gemini API Key from Google AI Studio.

### Step 1 — Setup & Start the Backend

```bash
git clone https://github.com/KrishanKumarAwasthi/Sprintly.app.git
cd Sprintly.app

npm install
```

Create a **`.env`** file in the project root (see `.env.example`):
```env
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@YOUR_HOST:5432/YOUR_DB_NAME?sslmode=require"
PORT=3001
GEMINI_API_KEY="your_google_gemini_key"
```

```bash
# Push the database schema to PostgreSQL
npx prisma db push

# Generate the Prisma client
npx prisma generate

# Start the backend server
npm run dev
```

### Step 2 — Setup & Start the Frontend

Open a **new terminal**:

```bash
cd frontend
npm install
```

Create a **`.env.local`** file inside `frontend/`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

```bash
npm run dev
```

✅ Open `http://localhost:3000`

---

## 🧪 Testing

The repository includes a comprehensive set of regression scripts and tests ensuring the core CRUD features and AI components behave correctly.

- `npm run lint` & `npm run build` inside `frontend/`
- `node test_e2e.js` (Root-level CRUD E2E testing against PostgreSQL)
- `node scripts/validate_embeddings.js` (Audits missing embeddings and orphans)
- AI isolated component tests (e.g. `node scripts/test-vector-search.js`)

> **Note on AI Tests**: AI generation scripts (router, answer generation) are heavily dependent on Google Gemini Free Tier quotas. If running locally, you may encounter `429 Too Many Requests`. The architecture handles these safely without crashing the backend.

---

## 📄 License
This project is for educational and portfolio purposes.