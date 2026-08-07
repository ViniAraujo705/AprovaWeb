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
  Client,
  Comment,
  CrewMember,
  DashboardInsights,
  EditorPerformance,
  GalleryVideoItem,
  PlanId,
  PlanStatus,
  Project,
  ProjectGallery,
  ProjectMember,
  PublicVideo,
  QueueVideoItem,
  RatingQuestion,
  RecordingEvent,
  Session,
  TeamMember,
  User,
  Video,
} from '@/lib/types'

export const DEMO_TOKEN = 'demo'
export const DEMO_LINK = 'demo'

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
  },
  { id: 'c2', name: 'Burger House', email: 'contato@burgerhouse.com', isExample: false, description: null, photoUrl: null },
  { id: 'c3', name: 'Studio Moda', email: 'contato@studiomoda.com', isExample: false, description: null, photoUrl: null },
  { id: 'c4', name: 'Café Aurora', email: 'contato@cafeaurora.com', isExample: false, description: null, photoUrl: null },
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
    url: null,
    originalUrl: null,
    posterUrl: '/videos/reel-cosmetics.png',
    publicLink: DEMO_LINK,
    clientName: 'Bela Cosméticos',
    projectId: 'p1',
    commentsCount: 3,
    lastCommentAt: iso(1),
    createdAt: iso(3),
    processingStatus: 'pronto',
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
    url: null,
    originalUrl: null,
    posterUrl: '/videos/reel-food.png',
    publicLink: `${DEMO_LINK}-rv-02`,
    clientName: 'Burger House',
    projectId: 'p2',
    commentsCount: 5,
    lastCommentAt: iso(10),
    createdAt: iso(20),
    processingStatus: 'pronto',
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
    url: null,
    originalUrl: null,
    posterUrl: '/videos/reel-fashion.png',
    publicLink: `${DEMO_LINK}-rv-03`,
    clientName: 'Studio Moda',
    projectId: null,
    commentsCount: 2,
    lastCommentAt: null,
    createdAt: iso(48),
    processingStatus: 'pronto',
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
    url: null,
    originalUrl: null,
    posterUrl: '/videos/reel-food.png',
    publicLink: `${DEMO_LINK}-rv-05`,
    clientName: 'Burger House',
    projectId: 'p2',
    commentsCount: 4,
    lastCommentAt: iso(40),
    createdAt: iso(72),
    processingStatus: 'pronto',
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
  { id: 'crew-1', name: 'Marina Alves' },
  { id: 'crew-2', name: 'Rafael Souza' },
  { id: 'crew-3', name: 'Diego (cinegrafista freelancer)' },
  { id: 'crew-4', name: 'Ana Paula (motorista)' },
]

/**
 * Escala de gravações (aba Calendário) — array mutável: `calendarService`
 * em modo demo faz `push`/edita/remove direto aqui, igual a `demoClients`,
 * então altura feitas na tela persistem durante a sessão (até recarregar).
 */
export const demoRecordingEvents: RecordingEvent[] = [
  {
    id: 'ev-1',
    title: 'Gravação — Batom matte (novo lançamento)',
    startAt: futureIso(26),
    endAt: plusHours(futureIso(26), 2),
    clientId: 'c1',
    clientName: 'Bela Cosméticos',
    crew: [demoCrewRoster[0], demoCrewRoster[2]],
    notes: 'Estúdio próprio. Levar o kit de iluminação extra.',
  },
  {
    id: 'ev-2',
    title: 'Gravação externa — Bastidores da cozinha',
    startAt: futureIso(74),
    endAt: plusHours(futureIso(74), 3),
    clientId: 'c2',
    clientName: 'Burger House',
    crew: [demoCrewRoster[1]],
    notes: null,
  },
  {
    id: 'ev-3',
    title: 'Reunião de briefing — coleção verão',
    startAt: iso(20),
    endAt: plusHours(iso(20), 1),
    clientId: 'c3',
    clientName: 'Studio Moda',
    crew: [{ id: 'demo-user', name: 'Você (demo)' }],
    notes: null,
  },
  {
    id: 'ev-4',
    title: 'Gravação — café especial (Reels)',
    startAt: futureIso(170),
    endAt: plusHours(futureIso(170), 2),
    clientId: 'c4',
    clientName: 'Café Aurora',
    crew: [demoCrewRoster[0], demoCrewRoster[3]],
    notes: 'Cliente pediu foco no processo de torra.',
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
  const event = demoRecordingEvents.find((e) => e.id === eventId)!
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

/** Perguntas de avaliação da conta (para /configuracoes/perguntas e a tela do cliente). */
export function demoRatingQuestions(): RatingQuestion[] {
  return [
    { id: 'q1', text: 'Iluminação', order: 0, active: true },
    { id: 'q2', text: 'Áudio', order: 1, active: true },
    { id: 'q3', text: 'Enquadramento', order: 2, active: true },
    { id: 'q4', text: 'Ritmo da edição', order: 3, active: false },
  ]
}

// Amostra pública pequena — permite testar player, seek e marcadores nos vídeos de exemplo.
const DEMO_SAMPLE_URL = 'https://www.w3schools.com/html/mov_bbb.mp4'

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
    // branding null → a galeria usa o logo padrão do sistema (fallback).
    branding: null,
    videos,
  }
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
    return raw === 'free' || raw === 'pro' || raw === 'agencia' ? raw : null
  } catch {
    return null
  }
}

export function demoSetPlan(plan: PlanId): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_PLAN_KEY, plan)
}

const DEMO_PLAN_LIMITS: Record<PlanId, PlanStatus['limits']> = {
  free: {
    maxClients: 3,
    maxVideosPerMonth: 8,
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
    'APROVA — Relatório do projeto (exemplo)',
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

