/**
 * Modo demo — permite navegar por todas as telas sem backend.
 *
 * Ativado por uma flag em localStorage (botão "Entrar como demo" no login).
 * Quando ativo, os serviços em `lib/services.ts` retornam estes dados de
 * exemplo em vez de chamar a API. A rota pública /v/demo funciona sempre
 * (independente da flag), pois é reconhecida pelo próprio link "demo".
 *
 * Para desativar de vez, basta não usar o botão demo — nada aqui roda quando
 * a flag está desligada.
 */
import { DEMO_FLAG_KEY, DEMO_PLAN_KEY } from '@/lib/config'
import type {
  AdminMetrics,
  AdminUser,
  AppNotification,
  CalendarActivity,
  Client,
  ClientActivity,
  ClientFieldDefinition,
  ClientFile,
  Comment,
  CrewMember,
  DashboardInsights,
  Demand,
  DemandKind,
  EditorPerformance,
  GalleryVideoItem,
  PlanId,
  PlanStatus,
  Portfolio,
  PortfolioCategory,
  PortfolioItem,
  PortfolioItemMediaType,
  PortfolioLink,
  PortfolioProfile,
  PortfolioTemplateId,
  ProductionStage,
  Project,
  ProjectGallery,
  ProjectMember,
  PublicPortfolio,
  PublicPortfolioHub,
  PublicVideo,
  QueueVideoItem,
  RatingQuestion,
  Session,
  TeamMember,
  User,
  Video,
} from '@/lib/types'

export const DEMO_TOKEN = 'demo'
export const DEMO_LINK = 'demo'

// Amostra pública pequena — permite testar player, seek e marcadores nos vídeos de exemplo.
const DEMO_SAMPLE_URL = 'https://www.w3schools.com/html/mov_bbb.mp4'

export function isDemo(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DEMO_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

/** true para o link "demo" e para os links dos demais vídeos de exemplo (fila de swipe). */
export function isDemoVideoLink(link: string): boolean {
  return link === DEMO_LINK || demoVideos.some((v) => v.publicLink === link)
}

/** true para os links de galeria dos projetos de exemplo. */
export function isDemoProjectLink(link: string): boolean {
  return demoProjects.some((p) => p.publicLink === link)
}

export function enableDemoFlag() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_FLAG_KEY, '1')
}

export function clearDemoFlag() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_FLAG_KEY)
  window.localStorage.removeItem(DEMO_PLAN_KEY)
}

export const demoUser: User = {
  id: 'demo-user',
  name: 'Você (demo)',
  email: 'demo@aprova.app',
  role: 'admin',
  teamRole: 'owner',
  photoUrl: null,
}

/** Pequeno atraso para simular latência de rede e exercitar os loaders. */
export function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export const demoClients: Client[] = [
  {
    id: 'c1',
    name: 'Bela Cosméticos',
    email: 'contato@belacosmeticos.com',
    isExample: true,
    description: 'Gostou do resultado?💛',
    photoUrl: null,
    // Marca própria já configurada, pra exercitar de cara a sobreposição na
    // galeria pública do projeto de exemplo (p1) e o hover com logo na
    // vitrine (pf1, abaixo) sem precisar subir nada.
    branding: { logoUrl: '/placeholder-logo.svg', agencyName: 'Bela Cosméticos', accentColor: '#d6336c' },
    customFields: { 'cf-1': '@belacosmeticos', 'cf-2': '12.345.678/0001-90' },
    responsibleId: 'm2',
  },
  { id: 'c2', name: 'Burger House', email: 'contato@burgerhouse.com', isExample: false, description: null, photoUrl: null, branding: null, customFields: { 'cf-1': '@burgerhouseoficial' }, responsibleId: 'm3' },
  { id: 'c3', name: 'Studio Moda', email: 'contato@studiomoda.com', isExample: false, description: null, photoUrl: null, branding: null, customFields: {}, responsibleId: null },
  { id: 'c4', name: 'Café Aurora', email: 'contato@cafeaurora.com', isExample: false, description: null, photoUrl: null, branding: null, customFields: {}, responsibleId: null },
]

/** Campos personalizados de cadastro de cliente (`/configuracoes/campos-cliente`) — schema por conta, mutável igual a `demoCrewRoster`. */
export const demoClientFields: ClientFieldDefinition[] = [
  { id: 'cf-1', label: 'Instagram', order: 0 },
  { id: 'cf-2', label: 'CNPJ', order: 1 },
]

export const demoProjects: Project[] = [
  // p1 é o "projeto de exemplo" do onboarding (is_exemplo).
  {
    id: 'p1',
    name: 'Projeto de exemplo',
    clientId: 'c1',
    client: demoClients[0],
    isExample: true,
    publicLink: 'demo-projeto',
    members: [{ id: 'pm1', userId: 'm2', name: 'Marina Alves', email: 'marina@agencia.com' }],
  },
  {
    id: 'p2',
    name: 'Combo do mês',
    clientId: 'c2',
    client: demoClients[1],
    isExample: false,
    publicLink: 'demo-projeto-combo',
    members: [{ id: 'pm2', userId: 'm3', name: 'Rafael Souza', email: 'rafael@agencia.com' }],
  },
]

/**
 * Atribui/remove um editor de um projeto de exemplo (mutação in-memory, só
 * pra exercitar a UI de `ProjectMembersField` no modo demo — não persiste
 * entre reloads). O demo user é sempre owner, então isso nunca afeta o que
 * `projectService.list()` retorna no modo demo.
 */
export function demoAssignProjectMember(projectId: string, memberId: string): ProjectMember[] {
  const project = demoProjects.find((p) => p.id === projectId)
  if (!project) return []
  if (!project.members) project.members = []
  if (!project.members.some((m) => m.userId === memberId)) {
    const member = demoTeamMembers().find((m) => m.id === memberId)
    project.members.push({
      id: `pm-${memberId}-${projectId}`,
      userId: memberId,
      name: member?.name ?? '',
      email: member?.email ?? '',
    })
  }
  return project.members
}

export function demoRemoveProjectMember(projectId: string, memberId: string): ProjectMember[] {
  const project = demoProjects.find((p) => p.id === projectId)
  if (!project) return []
  project.members = (project.members ?? []).filter((m) => m.userId !== memberId)
  return project.members
}

/** Cards genéricos de exemplo pro Kanban (`/kanban`) — mutação in-memory, não persiste entre reloads. */
export const demoDemands: Demand[] = [
  {
    id: 'd1',
    title: 'Roteiro campanha de verão',
    kind: 'campanha',
    clientId: 'c1',
    responsibleId: 'm2',
    deadline: null,
    productionStage: 'planejado',
    createdAt: new Date(Date.now() - 48 * 3600_000).toISOString(),
  },
  {
    id: 'd2',
    title: 'Gravação institucional',
    kind: 'gravacao',
    clientId: 'c2',
    responsibleId: 'm3',
    deadline: null,
    productionStage: 'producao',
    createdAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
  },
]

function demoDemandId(): string {
  return `d-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export function demoCreateDemand(input: {
  title: string
  kind: DemandKind
  clientId?: string | null
  responsibleId?: string | null
  deadline?: string | null
}): Demand {
  const created: Demand = {
    id: demoDemandId(),
    title: input.title,
    kind: input.kind,
    clientId: input.clientId ?? null,
    responsibleId: input.responsibleId ?? null,
    deadline: input.deadline ?? null,
    productionStage: 'planejado',
    createdAt: new Date().toISOString(),
  }
  demoDemands.push(created)
  return created
}

export function demoUpdateDemand(
  id: string,
  input: {
    title?: string
    kind?: DemandKind
    clientId?: string | null
    responsibleId?: string | null
    deadline?: string | null
  },
): Demand {
  const found = demoDemands.find((d) => d.id === id)
  if (!found) throw new Error('Demanda não encontrada.')
  if (input.title !== undefined) found.title = input.title
  if (input.kind !== undefined) found.kind = input.kind
  if (input.clientId !== undefined) found.clientId = input.clientId
  if (input.responsibleId !== undefined) found.responsibleId = input.responsibleId
  if (input.deadline !== undefined) found.deadline = input.deadline
  return found
}

export function demoUpdateDemandStage(id: string, stage: ProductionStage): Demand {
  const found = demoDemands.find((d) => d.id === id)
  if (!found) throw new Error('Demanda não encontrada.')
  found.productionStage = stage
  return found
}

export function demoRemoveDemand(id: string): null {
  const idx = demoDemands.findIndex((d) => d.id === id)
  if (idx !== -1) demoDemands.splice(idx, 1)
  return null
}

const now = Date.now()
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString()
/** Data futura (prazo de entrega), em horas a partir de agora. */
const futureIso = (hoursAhead: number) => new Date(now + hoursAhead * 3600_000).toISOString()

export const demoVideos: Video[] = [
  {
    id: 'rv-01',
    title: 'Reel lançamento batom matte',
    type: 'Reels',
    status: 'pendente',
    duration: 28,
    url: DEMO_SAMPLE_URL,
    originalUrl: DEMO_SAMPLE_URL,
    posterUrl: '/videos/reel-cosmetics.png',
    publicLink: DEMO_LINK,
    clientName: 'Bela Cosméticos',
    projectId: 'p1',
    commentsCount: 3,
    lastCommentAt: iso(1),
    createdAt: iso(3),
    processingStatus: 'pronto',
    productionStage: 'aguardando_aprovacao',
    isExample: true,
    deadline: futureIso(30), // prazo próximo (< 2 dias)
    editorId: 'm2',
    version: 1,
    videoPaiId: null,
    latestVersionId: 'rv-01',
  },
  {
    id: 'rv-02',
    title: 'Campanha combo duplo',
    type: 'Post',
    status: 'ajuste',
    duration: 15,
    url: DEMO_SAMPLE_URL,
    originalUrl: DEMO_SAMPLE_URL,
    posterUrl: '/videos/reel-food.png',
    publicLink: `${DEMO_LINK}-rv-02`,
    clientName: 'Burger House',
    projectId: 'p2',
    commentsCount: 5,
    lastCommentAt: iso(10),
    createdAt: iso(20),
    processingStatus: 'pronto',
    productionStage: 'ajustes',
    isExample: false,
    deadline: iso(8), // prazo vencido
    editorId: 'm3',
    version: 1,
    videoPaiId: null,
    latestVersionId: 'rv-02',
  },
  {
    id: 'rv-03',
    title: 'Editorial coleção inverno',
    type: 'Reels',
    status: 'aprovado',
    duration: 34,
    url: DEMO_SAMPLE_URL,
    originalUrl: DEMO_SAMPLE_URL,
    posterUrl: '/videos/reel-fashion.png',
    publicLink: `${DEMO_LINK}-rv-03`,
    clientName: 'Studio Moda',
    projectId: null,
    commentsCount: 2,
    lastCommentAt: null,
    createdAt: iso(48),
    processingStatus: 'pronto',
    productionStage: 'aprovado',
    isExample: false,
    deadline: null, // já aprovado, sem prazo definido
    editorId: 'm2',
    version: 1,
    videoPaiId: null,
    latestVersionId: 'rv-03',
  },
  {
    id: 'rv-04',
    title: 'Teaser novo blush',
    type: 'Stories',
    status: 'pendente',
    duration: 9,
    url: null,
    originalUrl: null,
    posterUrl: '/videos/reel-cosmetics.png',
    publicLink: `${DEMO_LINK}-rv-04`,
    clientName: 'Bela Cosméticos',
    projectId: 'p1',
    commentsCount: 0,
    lastCommentAt: null,
    createdAt: iso(60),
    processingStatus: 'processando',
    productionStage: 'edicao',
    isExample: true,
    deadline: futureIso(96), // prazo tranquilo
    editorId: null,
    version: 1,
    videoPaiId: null,
    latestVersionId: 'rv-04',
  },
  {
    id: 'rv-05',
    title: 'Bastidores hambúrguer artesanal',
    type: 'Reels',
    status: 'aprovado',
    duration: 41,
    url: DEMO_SAMPLE_URL,
    originalUrl: DEMO_SAMPLE_URL,
    posterUrl: '/videos/reel-food.png',
    publicLink: `${DEMO_LINK}-rv-05`,
    clientName: 'Burger House',
    projectId: 'p2',
    commentsCount: 4,
    lastCommentAt: iso(40),
    createdAt: iso(72),
    processingStatus: 'pronto',
    productionStage: 'entregue',
    isExample: false,
    deadline: futureIso(240),
    editorId: 'm3',
    version: 1,
    videoPaiId: null,
    latestVersionId: 'rv-05',
  },
]

export function demoVideosForProject(projectId: string): Video[] {
  return demoVideos.filter((v) => v.projectId === projectId)
}

/**
 * Simula `POST /videos/:id/new-version` em modo demo: cria uma versão nova
 * vinculada ao vídeo original (videoPaiId) e a empurra pra dentro de
 * `demoVideos` — não persiste entre reloads, só dura a sessão do navegador
 * (mesmo comportamento efêmero de outras mutações em modo demo).
 */
export function demoNewVersion(videoId: string, nomeArquivo: string): Video {
  const original = demoVideos.find((v) => v.id === videoId) ?? demoVideos[0]
  const id = `${original.id}-v${original.version + 1}`
  const created: Video = {
    ...original,
    id,
    title: nomeArquivo.replace(/\.[^.]+$/, ''),
    status: 'pendente',
    publicLink: `${original.publicLink}-v${original.version + 1}`,
    commentsCount: 0,
    lastCommentAt: null,
    createdAt: new Date().toISOString(),
    version: original.version + 1,
    videoPaiId: original.id,
    latestVersionId: id,
  }
  demoVideos.push(created)
  return created
}

/** Soma horas a um ISO já calculado (fecha o horário de término de um evento). */
function plusHours(isoString: string, hours: number): string {
  return new Date(new Date(isoString).getTime() + hours * 3600_000).toISOString()
}

/**
 * Roster de equipe de gravação (nomes livres, sem conta no Aprova) — array
 * mutável: `crewService` em modo demo faz `push` direto aqui, igual a
 * `demoClients`, então gente adicionada na tela persiste durante a sessão.
 */
export const demoCrewRoster: CrewMember[] = [
  { id: 'crew-1', name: 'Marina Alves', userId: null },
  { id: 'crew-2', name: 'Rafael Souza', userId: null },
  { id: 'crew-3', name: 'Diego (cinegrafista freelancer)', userId: null },
  { id: 'crew-4', name: 'Ana Paula (motorista)', userId: null },
]

/**
 * Calendário operacional (aba Calendário) — array mutável: `calendarService`
 * em modo demo faz `push`/edita/remove direto aqui, igual a `demoClients`,
 * então altura feitas na tela persistem durante a sessão (até recarregar).
 */
export const demoCalendarActivities: CalendarActivity[] = [
  {
    id: 'ev-1',
    title: 'Gravação — Batom matte (novo lançamento)',
    type: 'gravacao',
    startAt: futureIso(26),
    endAt: plusHours(futureIso(26), 2),
    clientId: 'c1',
    clientName: 'Bela Cosméticos',
    crew: [demoCrewRoster[0], demoCrewRoster[2]],
    demandId: null,
    notes: 'Estúdio próprio. Levar o kit de iluminação extra.',
  },
  {
    id: 'ev-2',
    title: 'Captação externa — Bastidores da cozinha',
    type: 'captacao',
    startAt: futureIso(74),
    endAt: plusHours(futureIso(74), 3),
    clientId: 'c2',
    clientName: 'Burger House',
    crew: [demoCrewRoster[1]],
    demandId: null,
    notes: null,
  },
  {
    id: 'ev-3',
    title: 'Reunião de briefing — coleção verão',
    type: 'reuniao',
    startAt: iso(20),
    endAt: plusHours(iso(20), 1),
    clientId: 'c3',
    clientName: 'Studio Moda',
    crew: [{ id: 'demo-user', name: 'Você (demo)', userId: 'demo-user' }],
    demandId: null,
    notes: null,
  },
  {
    id: 'ev-4',
    title: 'Gravação — café especial (Reels)',
    type: 'gravacao',
    startAt: futureIso(170),
    endAt: plusHours(futureIso(170), 2),
    clientId: 'c4',
    clientName: 'Café Aurora',
    crew: [demoCrewRoster[0], demoCrewRoster[3]],
    demandId: null,
    notes: 'Cliente pediu foco no processo de torra.',
  },
  {
    id: 'ev-5',
    title: 'Roteiro campanha de verão',
    type: 'demanda_interna',
    startAt: futureIso(48),
    endAt: null,
    clientId: 'c1',
    clientName: 'Bela Cosméticos',
    crew: [demoCrewRoster[0]],
    demandId: 'd1',
    notes: 'Entrega do roteiro pro cliente aprovar antes da gravação.',
  },
]

/**
 * Trilha de auditoria por cliente (aba Histórico da central de cliente) —
 * array mutável, igual a `demoCalendarActivities`: `clientActivityService` em
 * modo demo faz `push` direto aqui (via `clientFileService`, ao registrar
 * envio/remoção de arquivo), então ações na tela persistem durante a sessão.
 */
export const demoClientActivity: (ClientActivity & { clientId: string })[] = [
  {
    id: 'act-1',
    clientId: 'c1',
    type: 'video_enviado',
    createdAt: iso(3),
    actorType: 'sistema',
    actorName: null,
    videoId: 'rv-01',
    projectId: 'p1',
    fileId: null,
    description: 'Conteúdo enviado: Reel lançamento batom matte',
  },
  {
    id: 'act-2',
    clientId: 'c1',
    type: 'ajuste_solicitado',
    createdAt: iso(2),
    actorType: 'cliente',
    actorName: 'Bela Cosméticos',
    videoId: 'rv-01',
    projectId: 'p1',
    fileId: null,
    description: 'Solicitou ajustes em Reel lançamento batom matte',
  },
  {
    id: 'act-3',
    clientId: 'c1',
    type: 'video_enviado',
    createdAt: iso(60),
    actorType: 'sistema',
    actorName: null,
    videoId: 'rv-04',
    projectId: 'p1',
    fileId: null,
    description: 'Conteúdo enviado: Teaser novo blush',
  },
  {
    id: 'act-4',
    clientId: 'c2',
    type: 'aprovacao_cliente',
    createdAt: iso(30),
    actorType: 'cliente',
    actorName: 'Burger House',
    videoId: 'rv-05',
    projectId: 'p2',
    fileId: null,
    description: 'Aprovou Bastidores hambúrguer artesanal',
  },
]

/** Pagina `demoClientActivity` por `clientId`, mais recente primeiro — cursor é só o índice como string. */
export function demoClientActivityPage(
  clientId: string,
  params: { cursor?: string; limit?: number },
): { items: ClientActivity[]; nextCursor: string | null } {
  const all = demoClientActivity
    .filter((activity) => activity.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const limit = params.limit ?? 30
  const start = params.cursor ? Number(params.cursor) : 0
  const page = all.slice(start, start + limit)
  const nextCursor = start + limit < all.length ? String(start + limit) : null
  return { items: page, nextCursor }
}

/**
 * Arquivos operacionais por cliente (aba Arquivos) — array mutável, igual a
 * `demoClients`: `clientFileService` em modo demo faz push/edita/remove
 * direto aqui, então ações na tela persistem durante a sessão.
 */
export const demoClientFiles: (ClientFile & { clientId: string })[] = [
  {
    id: 'file-1',
    clientId: 'c1',
    fileName: 'briefing-lancamento-batom.pdf',
    fileUrl: '#',
    mimeType: 'application/pdf',
    sizeBytes: 482_000,
    category: 'briefing',
    description: 'Briefing do lançamento de batom matte',
    uploadedByName: 'Você (demo)',
    createdAt: iso(72),
  },
]

/** Notificações de exemplo (sininho no topo do app) a partir dos vídeos de exemplo. */
function buildDemoNotification(
  id: string,
  type: AppNotification['type'],
  videoId: string,
  hoursAgo: number,
  read: boolean,
): AppNotification {
  const video = demoVideos.find((v) => v.id === videoId)!
  const project = demoProjects.find((p) => p.id === video.projectId)
  return {
    id,
    type,
    read,
    createdAt: iso(hoursAgo),
    video: {
      id: video.id,
      title: video.title,
      posterUrl: video.posterUrl,
      publicLink: video.publicLink,
      projectName: project?.name ?? '',
      clientName: video.clientName,
    },
    event: null,
  }
}

/** Lembrete de gravação próxima (aba Calendário) — só pro owner, sem vídeo associado. */
function buildDemoRecordingReminder(id: string, eventId: string, hoursAgo: number, read: boolean): AppNotification {
  const event = demoCalendarActivities.find((e) => e.id === eventId)!
  return {
    id,
    type: 'lembrete_gravacao',
    read,
    createdAt: iso(hoursAgo),
    video: null,
    event: {
      id: event.id,
      title: event.title,
      startAt: event.startAt,
      clientName: event.clientName,
    },
  }
}

export const demoNotifications: AppNotification[] = [
  buildDemoRecordingReminder('n0', 'ev-1', 0.5, false),
  buildDemoNotification('n1', 'comentario_cliente', 'rv-01', 1, false),
  buildDemoNotification('n2', 'ajuste_solicitado', 'rv-02', 6, false),
  buildDemoNotification('n3', 'avaliacao_cliente', 'rv-01', 20, false),
  buildDemoNotification('n4', 'aprovacao_cliente', 'rv-05', 40, true),
  buildDemoNotification('n5', 'aprovacao_cliente', 'rv-03', 50, true),
]

let demoNotifyIdSeq = 0

/**
 * Notifica os integrantes vinculados a uma conta real (`CrewMember.userId`)
 * de uma gravação — os sem `userId` (freelancer, motorista) são ignorados,
 * já que não têm conta pra receber notificação. Cria um `lembrete_gravacao`
 * pra simular o alerta que a pessoa veria no sino (`NotificationBell`).
 */
export function demoNotifyCrew(activityId: string, memberIds: string[]): { notified: number } {
  const event = demoCalendarActivities.find((e) => e.id === activityId)
  if (!event) throw new Error('Evento não encontrado.')
  const linked = memberIds.filter((id) => demoCrewRoster.find((c) => c.id === id)?.userId)
  if (linked.length > 0) {
    demoNotifications.unshift(
      buildDemoRecordingReminder(`n-notify-${++demoNotifyIdSeq}-${Date.now()}`, activityId, 0, false),
    )
  }
  return { notified: linked.length }
}

/** Perguntas de avaliação da conta (para /configuracoes/perguntas e a tela do cliente). */
export function demoRatingQuestions(): RatingQuestion[] {
  return [
    { id: 'q1', text: 'Iluminação', order: 0, active: true },
    { id: 'q2', text: 'Áudio', order: 1, active: true },
    { id: 'q3', text: 'Enquadramento', order: 2, active: true },
    { id: 'q4', text: 'Ritmo da edição', order: 3, active: false },
  ]
}

/** Comentários de exemplo por vídeo (id). Vídeos sem entrada aqui entram sem comentários. */
function demoCommentsFor(videoId: string): Comment[] {
  switch (videoId) {
    case 'rv-01':
      return [
        { id: 'c1', author: 'Cliente', timestamp: 2, text: 'A abertura ficou ótima! Só deixa a logo aparecer 1s a mais.', audioUrl: null, createdAt: iso(2), authorRole: 'client', parentId: null },
        { id: 'c2', author: 'Cliente', timestamp: 5, text: 'Esse corte está muito rápido, dá pra segurar mais nesse plano?', audioUrl: null, createdAt: iso(2), authorRole: 'client', parentId: null },
        { id: 'c3', author: 'Cliente', timestamp: 8, text: 'Adorei a trilha entrando aqui.', audioUrl: null, createdAt: iso(1), authorRole: 'client', parentId: null },
      ]
    case 'rv-02':
      return [
        { id: 'c4', author: 'Cliente', timestamp: 3, text: 'Dá pra trocar o preço exibido? Mudamos a promoção.', audioUrl: null, createdAt: iso(10), authorRole: 'client', parentId: null },
      ]
    case 'rv-05':
      return [
        { id: 'c5', author: 'Cliente', timestamp: 6, text: 'Ficou show, aprovado!', audioUrl: null, createdAt: iso(40), authorRole: 'client', parentId: null },
      ]
    default:
      return []
  }
}

/** Outros vídeos do mesmo cliente (o atual incluso), para a fila de swipe estilo Reels. */
function demoQueueFor(clientName: string): QueueVideoItem[] {
  return demoVideos
    .filter((v) => v.clientName === clientName)
    .map((v) => ({
      link: v.publicLink ?? '',
      title: v.title,
      posterUrl: v.posterUrl,
      status: v.status,
    }))
}

/**
 * Tela pública de exemplo, com vídeo real reproduzível, comentários e notas.
 * `link` seleciona qual vídeo de exemplo mostrar (default: o primeiro, /v/demo);
 * os demais vídeos do mesmo cliente formam a fila de swipe da aba Reels.
 */
export function demoPublicVideo(link: string = DEMO_LINK): PublicVideo {
  const match = demoVideos.find((v) => v.publicLink === link) ?? demoVideos[0]
  const video: Video = {
    ...match,
    duration: 10,
    url: DEMO_SAMPLE_URL,
    originalUrl: DEMO_SAMPLE_URL,
    deadline: null, // prazo é interno à agência — nunca exposto na tela pública
  }
  const project = demoProjects.find((p) => p.id === match.projectId)
  // Vídeo demo só guarda `clientName` (string livre) — casa com `demoClients`
  // pelo nome pra alimentar a foto/legenda configuradas pelo owner no modo Reels.
  const client = demoClients.find((c) => c.name === match.clientName) ?? null
  return {
    video,
    comments: demoCommentsFor(match.id),
    ratings: [],
    ratingQuestions: demoRatingQuestions().filter((q) => q.active),
    overallRating: null,
    projectName: project?.name ?? null,
    // branding null → tela pública usa o logo padrão do sistema (fallback).
    branding: null,
    queue: demoQueueFor(match.clientName),
    clientPhotoUrl: client?.photoUrl ?? null,
    clientDescription: client?.description ?? null,
  }
}

/** Galeria pública de exemplo (um link só listando todos os vídeos do projeto). */
export function demoProjectGallery(link: string): ProjectGallery {
  const project = demoProjects.find((p) => p.publicLink === link) ?? demoProjects[0]
  const allVideos: GalleryVideoItem[] = demoVideosForProject(project.id).map((v) => ({
    id: v.id,
    videoPaiId: v.videoPaiId,
    link: v.publicLink ?? '',
    title: v.title,
    posterUrl: v.posterUrl,
    status: v.status,
    processingStatus: v.processingStatus,
    version: v.version,
    createdAt: v.createdAt,
  }))
  // Mesma regra da galeria pública real: um vídeo substituído por uma nova
  // versão (videoPaiId de outro item aponta pra ele) não deve aparecer.
  const supersededIds = new Set<string>()
  for (const v of allVideos) if (v.videoPaiId) supersededIds.add(v.videoPaiId)
  const videos = allVideos.filter((v) => !supersededIds.has(v.id))
  return {
    projectName: project.name,
    clientName: project.client?.name ?? '',
    // A agência demo nunca tem branding configurado nestes fixtures; se o
    // cliente do projeto tiver marca própria (ex: c1/Bela Cosméticos), ela
    // aparece aqui — mesma regra de sobreposição de `resolveBranding`.
    branding: project.client?.branding ?? null,
    videos,
  }
}

/* ------------------------------ portfólios -------------------------------- */

let portfolioIdSeq = 0
let portfolioVideoIdSeq = 0

export const demoPortfolioCategories: PortfolioCategory[] = [
  { id: 'pfc-foto', name: 'Fotos', order: 0 },
  { id: 'pfc-video', name: 'Vídeo', order: 1 },
]

export const demoPortfolioProfile: PortfolioProfile = {
  photoUrl: null,
  coverUrl: '/videos/reel-fashion.png',
  bio: 'Produzimos vídeos e fotos para marcas que querem se destacar nas redes — do roteiro à entrega, sem dor de cabeça.',
  links: [
    { id: 'pfl1', label: 'Site', url: 'https://exemplo.com' },
    { id: 'pfl2', label: 'Instagram', url: 'https://instagram.com/exemplo' },
    { id: 'pfl3', label: 'WhatsApp', url: 'https://wa.me/5511999999999' },
  ],
  hubLink: 'demo-agencia',
  templateId: null,
}

export const demoPortfolios: Portfolio[] = [
  {
    id: 'pf1',
    name: 'Reels para redes sociais',
    description: 'Seleção de reels de curta duração feitos para clientes de e-commerce e beleza.',
    link: 'demo-reels',
    categoryId: 'pfc-video',
    coverUrl: '/videos/reel-cosmetics.png',
    // Álbum personalizado pra Bela Cosméticos — exercita o logo no hover
    // do card na vitrine (demoPublicPortfolioHub, abaixo).
    clientId: 'c1',
    videos: [
      {
        id: 'pfv1',
        mediaType: 'video',
        title: 'Reel lançamento batom matte',
        description: 'Case para Bela Cosméticos — lançamento de produto.',
        videoUrl: DEMO_SAMPLE_URL,
        posterUrl: '/videos/reel-cosmetics.png',
        processingStatus: 'pronto',
        order: 0,
        highlighted: true,
        createdAt: iso(200),
      },
      {
        id: 'pfv2',
        mediaType: 'video',
        title: 'Reel promoção de verão',
        description: 'Case para Moda Rara — campanha sazonal.',
        videoUrl: DEMO_SAMPLE_URL,
        posterUrl: '/videos/reel-fashion.png',
        processingStatus: 'pronto',
        order: 1,
        highlighted: false,
        createdAt: iso(150),
      },
      {
        id: 'pfv4',
        mediaType: 'foto',
        title: 'Still campanha batom matte',
        description: 'Foto still usada nos stories da campanha.',
        videoUrl: null,
        posterUrl: '/videos/reel-cosmetics.png',
        processingStatus: 'pronto',
        order: 2,
        highlighted: false,
        createdAt: iso(140),
      },
      {
        id: 'pfv5',
        mediaType: 'design',
        title: 'Arte para carrossel de lançamento',
        description: 'Peça gráfica usada no post de anúncio do produto.',
        videoUrl: null,
        posterUrl: '/videos/reel-cosmetics.png',
        processingStatus: 'pronto',
        order: 3,
        highlighted: false,
        createdAt: iso(130),
      },
    ],
    createdAt: iso(300),
    updatedAt: iso(150),
  },
  {
    id: 'pf2',
    name: 'Institucionais',
    description: null,
    link: 'demo-institucional',
    categoryId: 'pfc-video',
    coverUrl: '/videos/reel-food.png',
    clientId: null,
    videos: [
      {
        id: 'pfv3',
        mediaType: 'video',
        title: 'Institucional restaurante',
        description: null,
        videoUrl: DEMO_SAMPLE_URL,
        posterUrl: '/videos/reel-food.png',
        processingStatus: 'pronto',
        order: 0,
        highlighted: true,
        createdAt: iso(80),
      },
    ],
    createdAt: iso(100),
    updatedAt: iso(80),
  },
]

export function isDemoPortfolioLink(link: string): boolean {
  return demoPortfolios.some((p) => p.link === link)
}

/** Portfólio público de exemplo (rota /p/:link). */
export function demoPublicPortfolio(link: string): PublicPortfolio {
  const portfolio = demoPortfolios.find((p) => p.link === link) ?? demoPortfolios[0]
  const client = portfolio.clientId ? demoClients.find((c) => c.id === portfolio.clientId) : null
  return {
    name: portfolio.name,
    description: portfolio.description,
    // Sem cliente associado (o caso comum), usa o logo padrão do sistema.
    // Associado a um cliente com marca própria, a marca dele sobrepõe.
    branding: client?.branding ?? null,
    videos: [...portfolio.videos].sort((a, b) => a.order - b.order),
  }
}

export function demoCreatePortfolio(input: {
  name: string
  description?: string
  categoryId?: string | null
}): Portfolio {
  const created: Portfolio = {
    id: `pf-${++portfolioIdSeq}-${Date.now()}`,
    name: input.name,
    description: input.description ?? null,
    link: `demo-portfolio-${portfolioIdSeq}`,
    categoryId: input.categoryId ?? null,
    coverUrl: null,
    clientId: null,
    videos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  demoPortfolios.push(created)
  return created
}

export function demoUpdatePortfolio(
  id: string,
  input: {
    name?: string
    description?: string | null
    categoryId?: string | null
    coverUrl?: string | null
    clientId?: string | null
  },
): Portfolio {
  const found = demoPortfolios.find((p) => p.id === id)
  if (!found) throw new Error('Portfólio não encontrado.')
  if (input.name !== undefined) found.name = input.name
  if (input.description !== undefined) found.description = input.description
  if (input.categoryId !== undefined) found.categoryId = input.categoryId
  if (input.coverUrl !== undefined) found.coverUrl = input.coverUrl
  if (input.clientId !== undefined) found.clientId = input.clientId
  found.updatedAt = new Date().toISOString()
  return found
}

export function demoDeletePortfolio(id: string): void {
  const idx = demoPortfolios.findIndex((p) => p.id === id)
  if (idx !== -1) demoPortfolios.splice(idx, 1)
}

export function demoUpdatePortfolioProfilePhoto(photoUrl: string | null): PortfolioProfile {
  demoPortfolioProfile.photoUrl = photoUrl
  return demoPortfolioProfile
}

export function demoUpdatePortfolioProfileCover(coverUrl: string | null): PortfolioProfile {
  demoPortfolioProfile.coverUrl = coverUrl
  return demoPortfolioProfile
}

let portfolioLinkIdSeq = 0

export function demoUpdatePortfolioProfile(input: {
  bio?: string | null
  links?: { label: string; url: string }[]
  templateId?: PortfolioTemplateId | null
}): PortfolioProfile {
  if (input.bio !== undefined) demoPortfolioProfile.bio = input.bio
  if (input.links !== undefined) {
    demoPortfolioProfile.links = input.links.map(
      (l): PortfolioLink => ({ id: `pfl-${++portfolioLinkIdSeq}-${Date.now()}`, label: l.label, url: l.url }),
    )
  }
  if (input.templateId !== undefined) demoPortfolioProfile.templateId = input.templateId
  return demoPortfolioProfile
}

let portfolioCategoryIdSeq = 0

export function demoCreateCategory(input: { name: string }): PortfolioCategory {
  const created: PortfolioCategory = {
    id: `pfc-${++portfolioCategoryIdSeq}-${Date.now()}`,
    name: input.name,
    order: demoPortfolioCategories.length,
  }
  demoPortfolioCategories.push(created)
  return created
}

export function demoUpdateCategory(id: string, input: { name: string }): PortfolioCategory {
  const found = demoPortfolioCategories.find((c) => c.id === id)
  if (!found) throw new Error('Categoria não encontrada.')
  found.name = input.name
  return found
}

/** Exclui a categoria — os álbuns associados ficam "Sem categoria" (categoryId: null), não são apagados. */
export function demoRemoveCategory(id: string): void {
  const idx = demoPortfolioCategories.findIndex((c) => c.id === id)
  if (idx !== -1) demoPortfolioCategories.splice(idx, 1)
  for (const p of demoPortfolios) if (p.categoryId === id) p.categoryId = null
}

export function demoReorderCategories(orderedIds: string[]): PortfolioCategory[] {
  const byId = new Map(demoPortfolioCategories.map((c) => [c.id, c]))
  const reordered = orderedIds.map((id, i) => {
    const c = byId.get(id)
    if (!c) throw new Error('Categoria não encontrada.')
    return { ...c, order: i }
  })
  demoPortfolioCategories.splice(0, demoPortfolioCategories.length, ...reordered)
  return demoPortfolioCategories
}

export function isDemoHubLink(link: string): boolean {
  return link === demoPortfolioProfile.hubLink
}

/** Tipo de mídia predominante (maioria simples) entre os itens de um álbum. */
function dominantMediaType(videos: PortfolioItem[]): PortfolioItemMediaType {
  const counts: Record<PortfolioItemMediaType, number> = { video: 0, foto: 0, design: 0 }
  for (const v of videos) counts[v.mediaType]++
  return (Object.keys(counts) as PortfolioItemMediaType[]).reduce((best, type) =>
    counts[type] > counts[best] ? type : best,
  )
}

/** Hub público de exemplo (rota /portfolio/:hubLink): agrupa os portfólios demo pelas categorias demo. */
export function demoPublicPortfolioHub(): PublicPortfolioHub {
  const sortedCategories = [...demoPortfolioCategories].sort((a, b) => a.order - b.order)
  return {
    agencyName: null,
    photoUrl: demoPortfolioProfile.photoUrl,
    coverUrl: demoPortfolioProfile.coverUrl,
    bio: demoPortfolioProfile.bio,
    links: demoPortfolioProfile.links,
    // branding null → sem logo próprio, a sidebar não mostra nenhuma marca
    // (nem o fallback "CHECK" — essa vitrine é do cliente, não da CHECK).
    branding: null,
    templateId: demoPortfolioProfile.templateId,
    categories: sortedCategories
      .map((c) => ({
        id: c.id,
        name: c.name,
        portfolios: demoPortfolios
          .filter((p) => p.categoryId === c.id && p.videos.length > 0)
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            link: p.link,
            coverUrl: p.coverUrl,
            mediaType: dominantMediaType(p.videos),
            logoUrl: (p.clientId ? demoClients.find((c) => c.id === p.clientId) : null)?.branding?.logoUrl ?? null,
          })),
      }))
      .filter((c) => c.portfolios.length > 0),
  }
}

function touchPortfolioCover(portfolio: Portfolio) {
  if (portfolio.coverUrl) return
  const sorted = [...portfolio.videos].sort((a, b) => a.order - b.order)
  portfolio.coverUrl = sorted[0]?.posterUrl ?? null
  portfolio.updatedAt = new Date().toISOString()
}

export function demoAddExistingPortfolioVideo(
  portfolioId: string,
  videoId: string,
  input: { title?: string; description?: string },
): Portfolio {
  const portfolio = demoPortfolios.find((p) => p.id === portfolioId)
  if (!portfolio) throw new Error('Portfólio não encontrado.')
  const source = demoVideos.find((v) => v.id === videoId)
  const item: PortfolioItem = {
    id: `pfv-${++portfolioVideoIdSeq}-${Date.now()}`,
    mediaType: 'video',
    title: input.title || source?.title || 'Sem título',
    description: input.description ?? null,
    videoUrl: DEMO_SAMPLE_URL,
    posterUrl: source?.posterUrl ?? null,
    processingStatus: 'pronto',
    order: portfolio.videos.length,
    highlighted: false,
    createdAt: new Date().toISOString(),
  }
  portfolio.videos.push(item)
  touchPortfolioCover(portfolio)
  return portfolio
}

export function demoAddUploadedPortfolioVideo(
  portfolioId: string,
  input: {
    mediaType: PortfolioItemMediaType
    title: string
    description: string | null
    videoUrl: string | null
    posterUrl: string | null
  },
): Portfolio {
  const portfolio = demoPortfolios.find((p) => p.id === portfolioId)
  if (!portfolio) throw new Error('Portfólio não encontrado.')
  const item: PortfolioItem = {
    id: `pfv-${++portfolioVideoIdSeq}-${Date.now()}`,
    mediaType: input.mediaType,
    title: input.title,
    description: input.description,
    videoUrl: input.videoUrl,
    posterUrl: input.posterUrl,
    processingStatus: 'pronto',
    order: portfolio.videos.length,
    highlighted: false,
    createdAt: new Date().toISOString(),
  }
  portfolio.videos.push(item)
  touchPortfolioCover(portfolio)
  return portfolio
}

export function demoUpdatePortfolioVideo(
  portfolioId: string,
  videoId: string,
  input: { title?: string; description?: string | null; highlighted?: boolean },
): Portfolio {
  const portfolio = demoPortfolios.find((p) => p.id === portfolioId)
  if (!portfolio) throw new Error('Portfólio não encontrado.')
  const item = portfolio.videos.find((v) => v.id === videoId)
  if (item) {
    if (input.title !== undefined) item.title = input.title
    if (input.description !== undefined) item.description = input.description
    if (input.highlighted !== undefined) item.highlighted = input.highlighted
  }
  portfolio.updatedAt = new Date().toISOString()
  return portfolio
}

export function demoRemovePortfolioVideo(portfolioId: string, videoId: string): Portfolio {
  const portfolio = demoPortfolios.find((p) => p.id === portfolioId)
  if (!portfolio) throw new Error('Portfólio não encontrado.')
  portfolio.videos = portfolio.videos.filter((v) => v.id !== videoId)
  portfolio.videos.forEach((v, i) => (v.order = i))
  touchPortfolioCover(portfolio)
  return portfolio
}

export function demoReorderPortfolioVideos(portfolioId: string, orderedVideoIds: string[]): Portfolio {
  const portfolio = demoPortfolios.find((p) => p.id === portfolioId)
  if (!portfolio) throw new Error('Portfólio não encontrado.')
  const byId = new Map(portfolio.videos.map((v) => [v.id, v]))
  portfolio.videos = orderedVideoIds.map((id, i) => {
    const v = byId.get(id)
    if (!v) throw new Error('Vídeo do portfólio não encontrado.')
    return { ...v, order: i }
  })
  touchPortfolioCover(portfolio)
  return portfolio
}

export const demoAdminUsers: AdminUser[] = [
  { id: 'demo-user', name: 'Você (demo)', email: 'demo@aprova.app', role: 'admin', teamRole: 'owner', photoUrl: null, status: 'active', createdAt: iso(240), plan: 'agencia' },
  { id: 'u2', name: 'Marina Alves', email: 'marina@agencia.com', role: 'user', teamRole: 'editor', photoUrl: null, status: 'active', createdAt: iso(200) },
  { id: 'u3', name: 'Rafael Souza', email: 'rafael@agencia.com', role: 'user', teamRole: 'editor', photoUrl: null, status: 'suspended', createdAt: iso(120) },
  { id: 'u4', name: 'Bruno Lima', email: 'bruno@agencia.com', role: 'user', teamRole: 'editor', photoUrl: null, status: 'inactive', createdAt: iso(60) },
]

export const demoMetrics: AdminMetrics = {
  totalUsers: demoAdminUsers.length,
  totalVideos: demoVideos.length,
  pendingVideos: demoVideos.filter((v) => v.status === 'pendente').length,
  approvedVideos: demoVideos.filter((v) => v.status === 'aprovado').length,
}

/** Usuário demo + branding (para /configuracoes). Sem logo por padrão. */
export function demoMe(): User {
  return { ...demoUser, branding: null }
}

/**
 * Plano "comprado" no modo demo, persistido em localStorage (não em memória)
 * — o checkout de verdade faz um hard navigate (`window.location.href`) pra
 * tela de retorno, o que recarrega a página e zeraria qualquer estado só em
 * memória. Isso permite testar o checkout/cancelamento sem backend:
 * `billingService.checkout`/`cancel` chamam `demoSetPlan` e a tela de "Meu
 * Plano" reage exatamente como reagiria a um `GET /plans/me` de verdade.
 * Ausente = ainda não mexeu em nada, cai no padrão (Agência plenamente
 * liberado, pra não deixar o tour quebrado com os fixtures existentes de
 * 4 clientes/vários vídeos).
 */
function readDemoPlan(): PlanId | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DEMO_PLAN_KEY)
    return raw === 'portfolio' || raw === 'free' || raw === 'pro' || raw === 'agencia' ? raw : null
  } catch {
    return null
  }
}

export function demoSetPlan(plan: PlanId): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_PLAN_KEY, plan)
}

const DEMO_PLAN_LIMITS: Record<PlanId, PlanStatus['limits']> = {
  portfolio: {
    maxClients: 0,
    maxVideosPerMonth: 0,
    maxRatingQuestions: 0,
    maxExtraEditors: 0,
    whiteLabel: false,
    pdfReports: false,
    priorityQueue: false,
    teamPerformance: false,
    storageGb: 10,
  },
  free: {
    maxClients: 1,
    maxVideosPerMonth: 10,
    maxRatingQuestions: 3,
    maxExtraEditors: 0,
    whiteLabel: false,
    pdfReports: false,
    priorityQueue: false,
    teamPerformance: false,
    storageGb: 5,
  },
  pro: {
    maxClients: null,
    maxVideosPerMonth: null,
    maxRatingQuestions: null,
    maxExtraEditors: 1,
    whiteLabel: true,
    pdfReports: true,
    priorityQueue: false,
    teamPerformance: false,
    storageGb: 50,
  },
  agencia: {
    maxClients: null,
    maxVideosPerMonth: null,
    maxRatingQuestions: null,
    maxExtraEditors: 5,
    whiteLabel: true,
    pdfReports: true,
    priorityQueue: true,
    teamPerformance: true,
    storageGb: 300,
  },
}

/**
 * Uso calculado a partir dos arrays de demo só por realismo nas barras de
 * "Meu Plano" — não há enforcement de limite simulado nos `create()` de
 * demo, então usar um plano baixo (ex: Free) pode legitimamente mostrar
 * eixos "estourados" se os fixtures já tiverem mais do que o teto.
 */
export function demoPlanStatus(): PlanStatus {
  const plan = readDemoPlan() ?? 'agencia'
  return {
    plan,
    limits: DEMO_PLAN_LIMITS[plan],
    usage: {
      clients: demoClients.length,
      extraEditors: demoTeamMembers().filter(
        (m) => m.teamRole === 'editor' && m.status === 'active',
      ).length,
      videosThisMonth: demoVideos.length,
      ratingQuestions: demoRatingQuestions().filter((q) => q.active).length,
    },
  }
}

/* ----------------------- canais interno / cliente ------------------------ */

/**
 * Comentários do canal interno (só agência), com thread: o comentário do editor
 * tem uma resposta do owner (parentId aponta pro comentário-pai).
 */
export function demoInternalComments(_videoId: string): Comment[] {
  return [
    {
      id: 'ic1',
      author: 'Marina Alves',
      timestamp: 3,
      text: 'Renderizei numa qualidade menor pra aprovar rápido — subo a final depois. Ok?',
      audioUrl: null,
      createdAt: iso(5),
      authorRole: 'editor',
      parentId: null,
    },
    {
      id: 'ic1-r1',
      author: 'Você (demo)',
      timestamp: 3,
      text: 'Pode subir a final. Só confirma o LUT antes de mandar pro cliente.',
      audioUrl: null,
      createdAt: iso(4),
      authorRole: 'owner',
      parentId: 'ic1',
    },
    {
      id: 'ic2',
      author: 'Você (demo)',
      timestamp: 9,
      text: 'Aqui o corte ficou seco. Vamos adicionar um crossfade de 4 frames.',
      audioUrl: null,
      createdAt: iso(2),
      authorRole: 'owner',
      parentId: null,
    },
  ]
}

/**
 * Canal do cliente na visão da agência (por id de vídeo). Reaproveita a tela
 * pública de exemplo e injeta uma resposta da agência já publicada, para
 * mostrar a diferenciação visual ("Resposta da agência").
 */
export function demoClientChannel(_videoId: string): PublicVideo {
  const base = demoPublicVideo()
  const agencyReply: Comment = {
    id: 'ag1',
    author: 'Você (demo)',
    timestamp: 5,
    text: 'Boa! Já seguramos esse plano por mais 1s na nova versão. 🙌',
    audioUrl: null,
    createdAt: iso(1),
    authorRole: 'agency',
    parentId: null,
  }
  return { ...base, comments: [...base.comments, agencyReply] }
}

/** Sessões ativas para /configuracoes — a sessão atual (este navegador) + duas outras. */
export function demoSessions(): Session[] {
  return [
    {
      id: 'demo-session-current',
      device: 'Chrome · macOS',
      deviceType: 'desktop',
      location: 'São Paulo, BR',
      ip: '187.54.12.201',
      createdAt: iso(240),
      lastActiveAt: iso(0),
      current: true,
    },
    {
      id: 'demo-session-2',
      device: 'Safari · iPhone',
      deviceType: 'mobile',
      location: 'São Paulo, BR',
      ip: '191.32.88.4',
      createdAt: iso(72),
      lastActiveAt: iso(5),
      current: false,
    },
    {
      id: 'demo-session-3',
      device: 'Chrome · Windows',
      deviceType: 'desktop',
      location: 'Rio de Janeiro, BR',
      ip: '201.9.44.170',
      createdAt: iso(500),
      lastActiveAt: iso(96),
      current: false,
    },
  ]
}

/**
 * Sessões de UM MEMBRO da equipe, na visão do owner (/configuracoes/equipe).
 * Nunca marca `current: true` — é sempre a sessão de outra pessoa.
 */
export function demoMemberSessions(memberId: string): Session[] {
  // Rafael Souza está suspenso — acesso já revogado, sem sessão ativa.
  if (memberId === 'm3') return []
  const isMarina = memberId === 'm2'
  return [
    {
      id: `${memberId}-session-1`,
      device: isMarina ? 'Chrome · Windows' : 'Safari · macOS',
      deviceType: 'desktop',
      location: isMarina ? 'Belo Horizonte, BR' : 'São Paulo, BR',
      ip: isMarina ? '189.45.6.23' : '177.20.14.90',
      createdAt: iso(300),
      lastActiveAt: iso(3),
      current: false,
    },
  ]
}

/** Membros da conta/agência para /configuracoes/equipe. */
export function demoTeamMembers(): TeamMember[] {
  return [
    { id: 'demo-user', name: 'Você (demo)', email: 'demo@aprova.app', teamRole: 'owner', status: 'active', createdAt: iso(240), expiresAt: null },
    { id: 'm2', name: 'Marina Alves', email: 'marina@agencia.com', teamRole: 'editor', status: 'active', createdAt: iso(200), expiresAt: null },
    { id: 'm3', name: 'Rafael Souza', email: 'rafael@agencia.com', teamRole: 'editor', status: 'suspended', createdAt: iso(120), expiresAt: null },
    { id: 'm4', name: '', email: 'novo.editor@agencia.com', teamRole: 'editor', status: 'invited', createdAt: iso(6), expiresAt: iso(-66) },
    // Convite enviado há mais de 3 dias e não aceito — ilustra o estado "expirado".
    { id: 'm5', name: '', email: 'convite.antigo@agencia.com', teamRole: 'editor', status: 'invited', createdAt: iso(90), expiresAt: iso(18) },
  ]
}

/** Desempenho dos editores para /equipe/desempenho, calculado a partir dos vídeos de exemplo. */
export function demoTeamPerformance(): EditorPerformance[] {
  return [
    {
      editorId: 'm2',
      name: 'Marina Alves',
      avatarUrl: null,
      averageScore: 8.6,
      approvedVideosCount: 12,
      tier: 'verde',
    },
    {
      editorId: 'm3',
      name: 'Rafael Souza',
      avatarUrl: null,
      averageScore: 7.2,
      approvedVideosCount: 8,
      tier: 'amarelo',
    },
    {
      editorId: 'm5',
      name: 'Bruno Lima',
      avatarUrl: null,
      averageScore: 6.3,
      approvedVideosCount: 5,
      tier: 'laranja',
    },
    {
      editorId: 'm6',
      name: 'Carla Nunes',
      avatarUrl: null,
      averageScore: 4.8,
      approvedVideosCount: 3,
      tier: 'vermelho',
    },
    {
      editorId: 'm4',
      name: 'Novo editor',
      avatarUrl: null,
      averageScore: null,
      approvedVideosCount: 0,
      tier: 'sem_dados',
    },
  ]
}

/** Insights do dashboard calculados a partir dos vídeos de exemplo. */
export function demoInsights(): DashboardInsights {
  const pendingOver48h = demoVideos.filter(
    (v) =>
      v.status === 'pendente' &&
      v.createdAt !== null &&
      now - new Date(v.createdAt).getTime() > 48 * 3600_000,
  ).length
  return {
    pendingOver48h,
    fastestClient: { name: 'Studio Moda', avgHours: 4 },
    approvedThisMonth: demoVideos.filter((v) => v.status === 'aprovado').length,
  }
}

/**
 * Gera um "relatório" textual de exemplo (Blob URL) para o modo demo, já que
 * não há backend para produzir o PDF real. Serve só para exercitar o download.
 */
export function buildDemoReport(projectId: string): string {
  const project = demoProjects.find((p) => p.id === projectId)
  const videos = demoVideosForProject(projectId)
  const lines = [
    'CHECK — Relatório do projeto (exemplo)',
    '======================================',
    `Projeto: ${project?.name ?? projectId}`,
    `Cliente: ${project?.client?.name ?? '-'}`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    'Vídeos:',
    ...videos.map(
      (v) => `- ${v.title} · ${v.type} · ${v.status} · ${v.commentsCount} comentários`,
    ),
    '',
    '(Modo demo: relatório fictício. Com backend, um PDF real é gerado.)',
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  return URL.createObjectURL(blob)
}

