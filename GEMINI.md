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

## Key Files

-   `src/App.tsx`: Main application entry point managing routing and core state.
-   `src/supabase.ts`: Database types, interface definitions, and mock data.
-   `src/geminiAnalyzer.ts`: AI analysis service using Gemini 3.5 Flash.
-   `src/agents/code-reviewer-agent.md`: The system prompt defining the AI reviewer's behavior.
-   `setup.sql`: SQL script for initializing the Supabase database schema.
