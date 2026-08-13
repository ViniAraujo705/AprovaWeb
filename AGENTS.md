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

## Handoff — white-label / branding work (2026-08-12)

Started from a product ask: white-label personalization (logo/name/color, visual identity on client-facing screens, custom subdomain, customizable registration fields). Below is the state to pick this back up.

### Implemented this session

- **Fixed `userService.updateBranding`** (`lib/services.ts`, in `userService`): it used to always send `nome: input.agencyName` to `PATCH /users/me/branding`, including explicit `nome: null` when the "Nome da agência" field was left empty. That made the backend respond `400 { "message": "Dados invalidos enviados ao banco de dados" }` — looks like an uncaught Prisma error from writing `null` into a non-nullable column, not a normal class-validator 400. Fix: only include the `nome` key in the request body when `agencyName` is a non-empty string; omit it otherwise instead of sending `null`. `npx tsc --noEmit` verified clean after the change.

### Technical decisions

- **Trust `API.md` over stale code comments for backend contracts.** The removed comment claimed `/users/me/branding` accepts `{ logoUrl?, corDestaque?, nome? }`, but `API.md`'s documented DTO for that route only lists `{ logoUrl?, corDestaque? }` — `nome` was never actually part of the contract. When a comment and `API.md` disagree, `API.md` wins (it's explicitly the source of truth per its own header, generated from backend source).
- **Omit optional fields rather than send explicit `null`** when a PATCH endpoint's accepted body isn't 100% locked down. Don't assume the backend treats `null` as "no-op" — verify or avoid.
- **Backend asks go through `scratchpad/mensagem-backend-*.md` files** (pre-existing project convention, ~10 files already there before this session, one per topic) — there's no live messaging integration in this environment, so these are drafted for the user to copy/send themselves.

### What's still missing / open work

- **`components/client-channel-view.tsx` applies no branding.** Every other client-facing surface (`client-review.tsx`, `project-gallery.tsx`, `public-portfolio-view.tsx`, `public-portfolio-hub-view.tsx`) reads `branding.logoUrl`/`accentColor` and applies it; this one — the owner-authenticated view of the client's comment channel — doesn't. Identified, **not yet fixed**. Small, frontend-only, no backend dependency — good next task.
- **Per-client branding override is backend-blocked.** `Client.branding` (agency reselling white-label under the client's own mark) is fully built on the frontend: `clientService.getBrandingUploadUrl`/`updateBranding` (`lib/services.ts`), the `resolveBranding()` field-by-field merge helper, UI in `components/client-detail-view.tsx` (`ClientBrandingForm`). It's inert until the backend ships `POST /clients/:id/branding/logo-upload-url` + `PATCH /clients/:id/branding` and returns `client.branding` on the relevant endpoints. Full spec already sent: `scratchpad/mensagem-backend-branding-cliente.md` (pre-existing, not from this session). `API.md` marks every piece `[ PENDENTE NO BACKEND ]`.
- **Custom subdomain (`empresa.aprova.com`) — nothing built.** No `middleware.ts` exists anywhere in the repo; no host-based routing; no `Account.slug`/`subdomain` field or resolution endpoint on the backend. This is the biggest lift of the four asks — needs wildcard DNS + SSL, a `middleware.ts` for host-based tenant resolution, and new backend schema/endpoint before any frontend work is worth starting. A scoping-only question (not a work request) was sent: `scratchpad/mensagem-backend-duvida-subdominio.md`. **Do not start `middleware.ts` work until that comes back** — infra ownership (who controls DNS) is still unknown.
- **Custom registration fields** — partially exists. `ClientFieldDefinition` / `Client.customFields` (`lib/types.ts`, `clientFieldService` in `lib/services.ts`) already give the agency owner custom labeled fields per client, full CRUD, in `components/client-detail-view.tsx`. Nothing exposes this on any public-facing form — and there currently is no public self-serve client registration flow in this app at all (clients are always created by the agency), so it's unclear this needs more work unless the product ask changes.

### Known issues

- Whether `/users/me/branding` is meant to support setting the agency display name at all is now an open question with backend (`scratchpad/mensagem-backend-bug-nome-branding.md`). Until answered, "Nome da agência" in `components/settings-view.tsx` silently no-ops when left blank — safe (no more 400), but not resolved at the root.
- `client-channel-view.tsx` branding gap (above) is a known, unfixed inconsistency — not a regression from this session, just newly identified.

### Important files

- `lib/services.ts` — `userService.updateBranding`/`getBrandingUploadUrl` (agency-level, working), `clientService.updateBranding`/`getBrandingUploadUrl` (per-client, backend-pending), `resolveBranding()` (merge logic, ~line 288).
- `components/settings-view.tsx` — agency branding UI (logo/name/color), owner-only, `saveAppearance()`/`handleFile()`/`removeLogo()`.
- `components/client-detail-view.tsx` — per-client branding UI (`ClientBrandingForm`) + custom-fields UI.
- `components/client-channel-view.tsx` — missing branding, candidate for the next fix.
- `lib/types.ts` — `Branding` type (`logoUrl`, `agencyName`, `accentColor`), attached to `User.branding` and `Client.branding`; `ClientFieldDefinition`/`Client.customFields`.
- `lib/theme.ts` — `brandAccentStyle()`, applies the branding accent color to CSS custom properties.
- `API.md` — source of truth for backend contracts (regenerated from backend source, dated 2026-07-06); branding section under "Branding / white label (`/users/me`)"; per-client branding under "Clientes" → "Marca própria do cliente", marked `[ PENDENTE NO BACKEND ]`.
- `scratchpad/mensagem-backend-branding-cliente.md`, `scratchpad/mensagem-backend-bug-nome-branding.md`, `scratchpad/mensagem-backend-duvida-subdominio.md` — outstanding backend asks/questions.

### Suggested next steps

1. Apply branding to `components/client-channel-view.tsx` (frontend-only, unblocked).
2. Wait on backend replies to the two new scratchpad messages; when `/clients/:id/branding*` ships, the frontend should work without further changes — just confirm against the real payload shape.
3. Keep subdomain work parked until the scoping question comes back with DNS ownership + hosting infra answers.

### Commands to verify this work

Same as the general **Commands** section above — `npm run dev` to run it, `npx tsc --noEmit` after any change (already run clean against this session's edit). No test suite, no working `npm run lint`, `next build` does not type-check.

## Handoff — central de gestão por cliente (2026-08-12)

### Implementado e publicado

- A página autenticada de detalhe do cliente (`/clientes/:id`) virou uma central com as abas **Visão geral**, **Projetos**, **Conteúdos**, **Aprovações**, **Calendário** e **Histórico**.
- A **Visão geral** preserva os formulários já existentes de dados do cliente, campos personalizados e branding, e adiciona indicadores de projetos, conteúdos, aprovações por status e gravações agendadas.
- **Projetos** mantém o CRUD/atalho existente de projetos do cliente. **Conteúdos** agrega os vídeos dos projetos daquele cliente; **Aprovações** os separa pelos status atuais; **Calendário** filtra os `RecordingEvent` com `clientId` correspondente; e **Histórico** mostra os envios de vídeo que já podem ser inferidos por `createdAt`.
- A implementação foi publicada em `main` como commit `8720acf` (`feat: centraliza gestão por cliente`), aplicada sobre o `main` mais recente. O deploy de produção deve ser disparado pelo push em `main`.
- `npx tsc --noEmit` passou para a versão publicada. Não há suíte de testes.

### Decisões técnicas

- A central é uma composição no frontend, sem endpoint novo: `projectService.list(clientId)`, `videoService.list()` e `calendarService.list()` são carregados com `useQuery`, e os vídeos são vinculados por `projectId`. Isso permite entregar a estrutura agora, mas pode custar mais requisições/volume para contas grandes.
- O histórico não inventa dados: ele só mostra eventos de upload derivados de `Video.createdAt` e informa claramente que uma auditoria detalhada exige backend.
- Não foram alterados `lib/types.ts` nem contratos da API para esta entrega. Quando o backend expuser novos campos, manter o padrão de mapeadores defensivos em `lib/services.ts` e não propagar payload cru aos componentes.
- Durante a prévia local contra a API Railway, o browser foi bloqueado por CORS porque a API não devolvia `Access-Control-Allow-Origin` para `http://localhost:3000`. Há uma alteração **local, não publicada** em `next.config.mjs` que cria um rewrite opcional via `API_PROXY_TARGET`; ela é um contorno de desenvolvimento, não parte da feature de produção. Preferir o backend liberar CORS para localhost.

### Pendências e problemas conhecidos

- **Histórico completo:** falta backend para uma trilha append-only de atividades do cliente (aprovações, pedidos de ajuste, comentários, novas versões e mudanças operacionais).
- **Arquivos operacionais:** só vídeos fazem parte do fluxo hoje. Briefings, contratos, roteiros e referências precisam de uma entidade/rotas próprias e armazenamento R2, sempre internos — jamais expor em rotas públicas.
- **Calendário real:** a tela filtra `calendarService`, mas as rotas de calendário continuam dependendo do backend; em demo elas usam fixtures. Ver `scratchpad/mensagem-backend-calendario-notificacao-equipe.md`.
- **Performance:** para contas grandes, considerar `GET /clients/:id/overview` no backend para retornar contagens, próximos eventos e atividade recente em uma chamada; não é bloqueador.
- **CORS de desenvolvimento:** backend deve liberar `http://localhost:3000` e `http://127.0.0.1:3000` na allowlist. O preflight da Railway respondia `204`, mas sem a origem permitida.

### Mensagem e arquivos importantes

- `components/client-detail-view.tsx` — toda a central; `ClientWorkspace`, métricas, lista de vídeos, calendário e histórico ficam neste arquivo.
- `lib/services.ts` — fontes de dados usadas (`projectService`, `videoService`, `calendarService`) e lugar para adicionar `clientActivityService`/`clientFileService` quando o backend existir.
- `lib/types.ts` — `Client`, `Project`, `Video`, `RecordingEvent` e `statusLabel` usados pela central.
- `lib/use-query.ts` — padrão de carregamento/cache local e atualizações otimistas.
- `next.config.mjs` — contém rewrite local não publicado para proxy de API quando `API_PROXY_TARGET` estiver definido; revisar antes de incluí-lo em qualquer PR.
- `scratchpad/mensagem-backend-central-cliente.md` — especificação pronta para enviar ao backend: `ClientActivity`, `ClientFile`, endpoint consolidado opcional e CORS local.
- `scratchpad/mensagem-backend-calendario-notificacao-equipe.md` — contrato já existente para `RecordingEvent`, `Crew` e notificações.

### Próximos passos recomendados

1. Enviar `scratchpad/mensagem-backend-central-cliente.md` ao time backend e alinhar prioridade para auditoria, arquivos internos e CORS.
2. Quando `GET /clients/:id/activity` existir, criar `clientActivityService` com branch demo e substituir o histórico derivado em `ClientHistory` por timeline paginada.
3. Quando as rotas de arquivos existirem, criar uma aba **Arquivos** na central, usando o mesmo fluxo presigned URL → PUT R2 → registro que os vídeos usam.
4. Confirmar as rotas reais de calendário e remover quaisquer suposições de fixture; depois avaliar o endpoint consolidado se a central ficar pesada.
5. Separar/commitar apenas as alterações locais pendentes de ambiente e documentação quando fizer sentido; não misturá-las com features de produto sem revisão.
