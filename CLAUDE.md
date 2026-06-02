# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # tsc -b && vite build (type-check then bundle)
npm run lint       # ESLint 10 check
npm run preview    # Preview production build locally
npm run init-db    # Initialize Supabase schema via Node (bin/init-db.js)
```

Python tests (requires `.venv`):
```bash
python -m pytest tests/
```

RAG scripts (scripts/rag/) run standalone with Python — embed CVE/CWE/OWASP docs into Supabase pgvector.

## Architecture

**CodeEye** — AI-powered code review SaaS. React 19 + TypeScript frontend, Supabase (Postgres + pgvector) backend, Google Gemini API for analysis.

### Two distinct runtimes

1. **Web dashboard** (`src/`) — React SPA on Vite. Users browse and triage issues.
2. **CLI analyzer** (`bin/code-eye.js`) — Node.js script developers run locally against source trees. Results go to Supabase, appear in the dashboard.

### Data flow

```
CLI: bin/code-eye.js analyze [path] [project-uuid]
  → geminiAnalyzer.ts  (7-stage pipeline)
  → Supabase issues table
  ↓
Web: Dashboard.tsx polls / realtime-subscribes to issues
  → CodeViewer.tsx (detail + diff)
```

### 7-stage Gemini pipeline (`src/geminiAnalyzer.ts`)

Agents are system prompts in `src/agents/*.md`, loaded as raw strings:

| Stage | Agent file | Purpose |
|-------|-----------|---------|
| 1 | parser_agent.md | Chunk source into ≤300-line blocks |
| 2 | (router) | Detect language → pick specialist |
| 3 | specialist_{cpp,python_go,jsts,jvm_clr}.md | Language-specific analysis |
| 4 | (RAG) | `match_rag_knowledge()` Supabase RPC — pgvector similarity search |
| 5 | verifier_agent.md | Filter false positives, adjust severity |
| 6 | scorer_agent.md | `priority = min(100, base + I*5 + C_inv*3 + A*4)` |
| 7 | reporter_agent.md | Aggregate → `Issue[]` for DB insert |

Fallback (`analyzeLocally()`) runs 7 regex/AST rule checks when no Gemini API key is present.

### State management

`src/context/AppContext.tsx` is the single React context. It owns: `session`, `projects[]`, `issues[]`, `selectedProject`, `selectedIssue`, `activeTab`, `theme`, and a 100-item circular event log. All cross-component state lives here.

### Supabase client (`src/supabase.ts`)

Reads credentials from `.env` → falls back to sessionStorage (obfuscated base64, not localStorage — intentional XSS mitigation). Exports typed interfaces: `Profile`, `Project`, `Issue`, `AnalysisRun`. Also contains `mockProjects[]` / `mockIssues[]` used in demo/offline mode.

### Auth

GitHub OAuth via Supabase. `Login.tsx` handles the OAuth redirect. Demo mode bypasses auth entirely — `isDemoSession` flag in AppContext gates Supabase writes.

### Key files to understand before touching core logic

- `src/geminiAnalyzer.ts` — full AI pipeline; each stage has its own `callGemini()` call with `responseSchema` enforcement
- `src/context/AppContext.tsx` — all shared state and mutation methods
- `src/supabase.ts` — types, client init, mock data
- `setup.sql` — full DB schema including pgvector extension, RLS policies, RPC functions

### Environment variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
VITE_GITHUB_TOKEN=
```

All are `VITE_` prefixed — exposed to the browser bundle. Never put secrets here.

### Styling conventions

Tailwind CSS 4. Dark glassmorphism theme (base `#080c14`). Three switchable accent themes (indigo / emerald / amber) via CSS custom properties (`--theme-accent`, `--glow-accent-1`). Do not add inline styles; extend via Tailwind utilities or theme variables.
