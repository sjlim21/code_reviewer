# 3_test_viewer (CodeEye)

**CodeEye** is a React-based autonomous code review and issue tracking dashboard. It leverages Gemini (AI) to analyze source code for security vulnerabilities, bugs, and performance issues, integrating with Supabase for data persistence.

## Project Overview

-   **Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Lucide React, Recharts.
-   **Core Logic:**
    -   `geminiAnalyzer.ts`: Interacts with Gemini 3.5 Flash API for automated code review.
    -   `supabase.ts`: Manages data models (Projects, AnalysisRuns, Issues) and provides mock data for fallback.
-   **Architecture:**
    -   `src/components/Dashboard.tsx`: Main reporting interface with metrics and charts.
    -   `src/components/CodeViewer.tsx`: Detailed view for inspecting detected issues and AI suggestions.
    -   `src/components/Uploader.tsx`: File upload and analysis trigger.

## Building and Running

-   **Development:** `npm run dev` (Starts the Vite development server)
-   **Build:** `npm run build` (Compiles TypeScript and builds for production)
-   **Linting:** `npm run lint` (Runs ESLint)
-   **Preview:** `npm run preview` (Local preview of the production build)

## Development Conventions

-   **State Management:** Primarily uses React Hooks (`useState`, `useMemo`, `useEffect`).
-   **Styling:** Tailwind CSS with a "glassmorphism" aesthetic.
-   **API Integration:** 
    -   Uses environment variables for sensitive keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`, `VITE_GCP_PROJECT_ID`.
    -   OAuth-based authentication is supported for Google API access.
-   **Coding Standards:**
    -   Strict TypeScript usage is encouraged.
    -   Functional components with explicit type definitions for props and state.
    -   Mock data is available in `supabase.ts` for rapid prototyping without a backend.

## Custom Workflows

### 👁️ CodeEye AI Review (Hybrid)
This workflow performs high-quality AI code review without API costs, optimized for **C/C++** and complex systems.

**Steps:**
1.  **Analyze**: Orchestrator (Gemini) reads source code and identifies issues following `src/agents/code-reviewer-agent.md`.
2.  **Generate**: Results are saved to `issues.json` using a **mathematical priority scoring model**.
3.  **Upload**: Run `node bin/code-eye.js import issues.json --project <ID>`.

**C/C++ Special Focus:**
-   Memory management (Leaks, Buffer overflows).
-   Pointer safety & Pointer arithmetic.
-   Concurrency/Race conditions in low-level code.

**Mathematical Priority Score (α):**
The score is calculated based on:
`Score = (BaseSeverity * W1) + (Impact * W2) + (Reachability * W3)`
*(Exact formula derived from security research papers).*

