# SkillLens Product Requirements Document (PRD)

## 1) Product Vision & Core Idea

**SkillLens** is an AI coaching assistant for physical work. A user points their phone camera at equipment (e.g., espresso machine), and SkillLens identifies where they are in a workflow and gives the next instruction in real time.

### Problem
- Frontline training is often inconsistent, expensive, and hard to scale.
- New workers need in-the-moment support, not just a static manual.

### Core idea we are building
- "Mentor in your pocket" for step-by-step operational guidance.
- Combine camera frames + SOP context + AI reasoning to guide actions live.

---

## 2) Hackathon Context & Success Criteria

### Hackathon framing
This project is a hackathon submission focused on proving product value quickly with a working demo and clear path to production hardening.

### Hackathon criteria this PRD must support
- **Demo clarity:** judges can understand value in under 60 seconds.
- **Functional prototype:** end-to-end flow works on a phone browser.
- **AI relevance:** AI materially improves the training experience (not cosmetic).
- **Practical impact:** solves a real onboarding/training pain point.
- **Execution quality:** usable UX, coherent architecture, clear trade-offs.

### Demo scenario (current)
- Barista onboarding workflow (espresso preparation) as the default demonstration.

---

## 3) Product Requirements (MVP)

### User stories
- As a trainee, I can open the app on my phone and get guided instructions while doing a task.
- As a trainee, I can create a custom SOP from source text/transcript.
- As a trainee, I can manually move to the next step if AI confidence is low.
- As a trainer/manager, I can trust that guidance follows an SOP structure.

### Functional requirements
1. User can enter setup credentials/config and start the app quickly.
2. App can capture camera frames periodically.
3. App can generate SOP steps from pasted source content.
4. App can analyze current frame against SOP context and return next instruction.
5. App displays current/next step overlay with simple controls.
6. App supports a prebuilt demo SOP (barista flow).

### Non-functional requirements
- Mobile-first UX (readable overlay, one-handed use).
- Fast response loop suitable for live guidance.
- Graceful fallback when model uncertainty is high.
- Clear error states for camera/network/API issues.

---

## 4) Goals of This Update (Architecture Restructure)

- Move from a static vanilla JS app to a maintainable TypeScript full-stack setup.
- Keep developer onboarding simple (single package manager, clear scripts, low cognitive overhead).
- Preserve current product behavior while enabling future features (auth, saved SOPs, analytics, role-based experiences).

---

## 5) Recommended Tech Stack (Beginner-Friendly)

### Frontend
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling (default):** CSS Modules + global CSS (plain CSS)
- **Styling (optional):** Tailwind CSS only if team explicitly prefers utility-first workflow
- **State/Data:** React Query for server state; simple local state with React hooks

### Backend
- **Framework:** NestJS (TypeScript-first)
- **API style:** REST (clear and beginner-friendly)
- **Validation:** class-validator + class-transformer
- **Persistence:** PostgreSQL + Prisma ORM

### Shared Tooling
- **Monorepo:** Turborepo (or npm workspaces if team wants less tooling)
- **Lint/Format:** ESLint + Prettier
- **Tests:** Vitest (frontend unit), Jest (backend unit/e2e)
- **Runtime/package manager:** Node 20 LTS + pnpm

### Why this stack
- TypeScript end-to-end reduces context-switching for beginners.
- Next.js has strong docs, easy local dev, and straightforward deployment.
- NestJS provides backend structure out-of-the-box (modules/controllers/services), which helps junior developers avoid ad-hoc architecture.
- Plain CSS keeps the migration close to the current codebase, lowers abstraction overhead for new contributors, and avoids adding another required styling framework.

### Styling decision for this team
- Start with **normal CSS** (CSS Modules + shared global stylesheet) as the default for beginner onboarding.
- Revisit Tailwind in a later ADR if the team starts building a large shared design system and wants utility-class speed.

---

## 6) Proposed Repository Structure

```text
skilllens/
  apps/
    web/                  # Next.js frontend (TypeScript)
    api/                  # NestJS backend (TypeScript)
  packages/
    ui/                   # Shared UI components (optional phase 2)
    types/                # Shared TS types/contracts
    eslint-config/        # Shared linting presets
    tsconfig/             # Shared TS configs
  docs/
    PRD.md
    ADRs/                 # Architecture Decision Records
  .env.example
  package.json
  pnpm-workspace.yaml
  turbo.json
```

---

## 7) High-Level Responsibilities

### Frontend (`apps/web`)
- Camera permissions + preview
- Coaching overlay UI and step controls
- SOP create/edit screens
- Calls backend endpoints for SOP generation and coaching inference

### Backend (`apps/api`)
- Securely manages Gemini interaction (no direct client exposure)
- SOP extraction endpoint
- Live coaching frame analysis endpoint
- Request validation, rate-limiting, audit logs
- Stores SOPs/sessions for future analytics and history

---

## 8) API Design (Initial)

- `POST /api/sop/extract`
  - Input: free-text training content
  - Output: normalized SOP steps

- `POST /api/coach/analyze-frame`
  - Input: image frame + SOP context + current step
  - Output: detected step, confidence, next instruction

- `POST /api/session`
  - Input: workflow metadata
  - Output: session id

- `POST /api/session/:id/events`
  - Input: user actions (next step, retry, completion)
  - Output: ack

---

## 9) Environment & Security Requirements

- Gemini API key must live on the backend only (not in browser local storage).
- Use environment variables:
  - `GEMINI_API_KEY`
  - `DATABASE_URL`
  - `NEXT_PUBLIC_API_BASE_URL`
- Add request size limits for image uploads.
- Add basic rate limiting for public endpoints.

---

## 10) Migration Plan (Incremental)

### Phase 0: Foundation
- Create monorepo scaffold (`apps/web`, `apps/api`).
- Add linting, formatting, shared tsconfig, CI checks.

### Phase 1: Frontend migration
- Recreate existing screens in Next.js:
  - landing
  - SOP extraction
  - coaching view
- Preserve existing UX and copy.

### Phase 2: Backend integration
- Move Gemini calls from browser JS into NestJS services.
- Implement `/sop/extract` and `/coach/analyze-frame`.
- Connect frontend to backend API.

### Phase 3: Persistence & quality
- Add Prisma models for SOPs, sessions, and events.
- Add unit/e2e tests and error monitoring.

### Phase 4: Developer experience hardening
- Add pre-commit hooks (lint + format checks).
- Add seeded sample SOP data for local demos.
- Improve docs for onboarding in under 15 minutes.

---

## 11) Definition of Done (Restructure Epic)

- Repo follows frontend/backend monorepo layout.
- Frontend and backend are both TypeScript.
- No direct Gemini API calls from browser.
- Existing hackathon demo flow works end-to-end through backend APIs.
- New developer can run project locally with:
  - `pnpm install`
  - `pnpm dev`
- Basic tests and lint checks pass in CI.

---

## 12) Beginner Onboarding Checklist

- Keep setup to <= 5 commands.
- Provide copy-paste `.env.example` with comments.
- Include architecture diagram in docs.
- Include “first task” guide:
  - add a field to SOP response
  - display it on coaching screen
  - run tests

---

## 13) Out of Scope (for this restructure step)

- Native mobile apps
- Advanced auth/SSO
- Multi-tenant enterprise controls
- Complex event streaming infrastructure
