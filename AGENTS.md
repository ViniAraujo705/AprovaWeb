# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

APROVA — a Next.js 16 (App Router) frontend for a video-approval workflow between agencies and their clients. It talks to a separate NestJS + Prisma + R2 backend over a REST API; there is no backend code in this repo. Dark theme, `Bebas Neue` display font, Tailwind v4.

## Commands

```bash
npm run dev      # Next dev server (Turbopack), localhost:3000
npm run build    # production build
npm run start    # serve the production build
npx tsc --noEmit # type-check — do this after any change, see caveat below
```

- **No test suite exists in this repo.** Don't assume one when asked to "run the tests."
- **`npm run lint` is currently broken**: there is no `eslint.config.*` in the repo (ESLint 9 requires flat config), so `eslint .` fails immediately with "couldn't find an eslint.config file." Don't rely on it as a verification step until a config is added.
- **`next build` does NOT type-check.** `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so a clean `next build` proves nothing about type safety — always run `npx tsc --noEmit` separately.
- Only one dev server should run at a time; Turbopack refuses a second instance on a port and tells you the PID of the one already running instead of actually binding.
- If a `next dev` server is already running and you edit `lib/demo.ts`, **adding a new export** (not just editing existing ones) confuses Turbopack's HMR ("export doesn't exist" errors client-side) — restart `next dev` to pick it up. Editing existing exports/objects is fine. `next build`/`next start` are unaffected either way.

## Environment

`NEXT_PUBLIC_API_URL` in `.env.local` (copy from `.env.example`) points at the NestJS backend (default `http://localhost:4000`). With no backend running, every authenticated screen correctly shows a connection-error state — that's expected, not a bug. To explore the UI without a backend, use "Entrar como demo" on `/login` (sets an `aprova_demo` localStorage flag), which routes all `lib/services.ts` calls to fixtures in `lib/demo.ts` instead of the network. The public route `/v/demo` also always works, demo flag or not.

## Architecture

**Backend integration is a single funnel through three files:**
- `lib/api.ts` — the only place `fetch` is called. Injects the `Authorization: Bearer` header, prefixes `NEXT_PUBLIC_API_URL`, normalizes NestJS error bodies into `ApiError`, and force-redirects to `/login` on a 401 for authenticated requests.
- `lib/services.ts` — one exported service object per resource (`videoService`, `projectService`, `internalCommentService`, `clientChannelService`, `teamService`, etc.), each function calling `api.*` and passing the raw response through a `mapX` normalizer. **Mappers are defensive by design**: every field is read via `pick(raw, [...possibleKeyNames], fallback)` because the exact backend field casing/naming isn't locked down yet. If the real backend uses different field names than what's guessed, fix it by adding a key to the relevant `pick([...])` call, not by changing the component that consumes the mapped type.
- `lib/types.ts` — the stable, camelCase domain shapes (`Video`, `Comment`, `Project`, `User`, ...) that every component actually works with. Components never see raw API responses.
- Every service function that hits the network has an `isDemo()` branch at the top (from `lib/demo.ts`) returning canned fixtures via `delay(...)` instead of calling `api`. When adding a new service call, add the matching demo branch.

**Two role axes, don't conflate them** (`lib/types.ts`):
- `role: 'admin' | 'user'` — system-level, gates `/admin`.
- `teamRole: 'owner' | 'editor'` — account/agency-level, gates team management, branding, the client channel, and anything owner-only. `RequireAuth` (`components/require-auth.tsx`) takes an optional `teamRole` prop and redirects non-matching users to `/dashboard`. Within a page that renders to both roles, gate individual owner-only affordances with `useAuth().user?.teamRole === 'owner'` rather than a route guard.

**Three distinct comment/viewing surfaces per video, all built on `components/video-stage.tsx`** (the shared `<video>` + timeline player, `forwardRef` exposing `seek()`):
1. `components/client-review.tsx`, mounted at the public route `app/v/[link]/page.tsx` — the client's own screen: watch + comment + star ratings + approve/request-changes. No auth. Anything added here is visible to the client, so never surface agency-internal data (deadlines, internal notes) on this component or in `PublicVideo`/`demoPublicVideo()`.
2. `components/internal-review.tsx`, at `/videos/[id]/revisao` — owner+editor only, threaded internal comments, no approve/reject actions.
3. `components/client-channel-view.tsx`, at `/videos/[id]/canal-cliente` — owner-only authenticated view of the same public comment thread, with the ability to post an agency reply (`clientChannelService.reply`) that then shows up back on the client's public screen.

`Comment.authorRole` (`client|owner|editor|agency`) drives badge/alignment styling across all three (see `components/comment-items.tsx`'s `RoleBadge`, `AgencyReplyItem`).

**Routing**: `app/(app)/*` is the authenticated shell (`RequireAuth` + `AgencyShell` sidebar, in `app/(app)/layout.tsx`) covering dashboard/upload/projects/admin/settings/team/video-review screens. `app/v/[link]` and `app/convite/[token]` are public, outside that shell.

**Data fetching** uses a hand-rolled `useQuery` (`lib/use-query.ts`) — no SWR/React Query. It returns `{ data, loading, error, refetch, setData }`; `setData` (supports a functional updater) is the mechanism for optimistic local updates after a mutation, used instead of refetching (see how new comments or edited fields get spliced into state across the review components).

**Design tokens**: everything styles through Tailwind classes bound to CSS custom properties in `app/globals.css` (`bg-primary`, `text-muted-foreground`, etc.), not hardcoded colors — changing the theme is a `globals.css` edit, not a component sweep. Motion goes through `components/motion.tsx` (wraps framer-motion, respects `prefers-reduced-motion` globally) rather than importing `framer-motion` directly in components.

**Uploads** are a 3-step presigned-URL flow against Cloudflare R2, not a proxy through the Next.js server: `videoService.getUploadUrl()` → direct browser `PUT` to R2 with real progress via XHR (`lib/upload.ts`) → `videoService.create()` to register the row. Branding/logo upload (`userService.getBrandingUploadUrl` / `updateBranding`) follows the same shape.
