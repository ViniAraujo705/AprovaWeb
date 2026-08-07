/**
 * Camada de serviços: uma função por endpoint do backend.
 *
 * Cada resposta crua é normalizada para os tipos de `lib/types.ts` através dos
 * mappers abaixo. Os mappers são defensivos (aceitam variações de nome de
 * campo) para reduzir o acoplamento com detalhes exatos do backend. Os nomes
 * de campo "canônicos" enviados/lidos seguem `API.md` (raiz do repo).
 */
import { api, ApiError } from '@/lib/api'
import { API_URL } from '@/lib/config'
import { getToken } from '@/lib/auth'
import {
  buildDemoReport,
  delay,
  demoAdminUsers,
  demoAddExistingPortfolioVideo,
  demoAddUploadedPortfolioVideo,
  demoAssignProjectMember,
  demoClientChannel,
  demoClients,
  demoCreatePortfolio,
  demoCrewRoster,
  demoDeletePortfolio,
  demoInsights,
  demoInternalComments,
  demoMe,
  demoMemberSessions,
  demoMetrics,
  demoNewVersion,
  demoNotifications,
  demoPlanStatus,
  demoSetPlan,
  demoPortfolios,
  demoProjectGallery,
  demoProjects,
  demoPublicPortfolio,
  demoPublicVideo,
  demoRatingQuestions,
  demoRecordingEvents,
  demoRemovePortfolioVideo,
  demoRemoveProjectMember,
  demoReorderPortfolioVideos,
  demoSessions,
  demoTeamMembers,
  demoTeamPerformance,
  demoUpdatePortfolio,
  demoUpdatePortfolioVideo,
  demoVideos,
  demoVideosForProject,
  isDemo,
  isDemoPortfolioLink,
  isDemoProjectLink,
  isDemoVideoLink,
} from '@/lib/demo'
import type {
  AdminMetrics,
  AdminUser,
  AppNotification,
  AuthResponse,
  Branding,
  Client,
  Comment,
  CommentAuthorRole,
  CrewMember,
  DashboardInsights,
  EditorPerformance,
  GalleryVideoItem,
  MemberStatus,
  NotificationType,
  PerformanceTier,
  BillingCycle,
  PlanId,
  PlanStatus,
  Portfolio,
  PortfolioVideoItem,
  Project,
  ProjectGallery,
  ProjectMember,
  PublicPortfolio,
  PublicVideo,
  QueueVideoItem,
  Rating,
  RatingQuestion,
  RecordingEvent,
  Session,
  SessionDeviceType,
  TeamMember,
  TeamRole,
  User,
  UserStatus,
  Video,
  VideoProcessingStatus,
  VideoStatus,
} from '@/lib/types'

/* --------------------------------- utils --------------------------------- */

type Raw = Record<string, any>

function pick<T>(obj: Raw | undefined | null, keys: string[], fallback: T): T {
  if (!obj) return fallback
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T
  }
  return fallback
}

/** Extrai um array de uma resposta que pode vir como [] ou { data: [] }. */
function asArray<T = Raw>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  if (res && typeof res === 'object') {
    const obj = res as Raw
    if (Array.isArray(obj.data)) return obj.data as T[]
    if (Array.isArray(obj.items)) return obj.items as T[]
    if (Array.isArray(obj.results)) return obj.results as T[]
  }
  return []
}

export function normalizeStatus(raw: unknown): VideoStatus {
  const s = String(raw ?? '').toLowerCase()
  if (['aprovado', 'approved', 'approve'].includes(s)) return 'aprovado'
  if (
    ['ajuste', 'changes', 'changes_requested', 'request_changes', 'rejected', 'revisao'].includes(s)
  )
    return 'ajuste'
  if (['erro', 'error', 'failed'].includes(s)) return 'erro'
  return 'pendente'
}

/* -------------------------------- mappers -------------------------------- */

function normalizeTeamRole(raw: unknown): TeamRole {
  const s = String(raw ?? '').toLowerCase()
  if (['editor', 'member', 'editors', 'colaborador'].includes(s)) return 'editor'
  // owner/admin/dono e ausência de valor caem no dono da conta.
  return 'owner'
}

/** Estados de conta/membro do backend (ativo/suspenso) → MemberStatus do front. */
function normalizeMemberStatus(raw: unknown): MemberStatus {
  const s = String(raw ?? '').toLowerCase()
  if (['invited', 'pending', 'convidado', 'pendente'].includes(s)) return 'invited'
  if (['suspended', 'inactive', 'suspenso', 'blocked'].includes(s)) return 'suspended'
  return 'active'
}

/** MemberStatus do front → status que o backend espera (ativo/suspenso, em português). */
function toBackendMemberStatus(status: MemberStatus): string {
  return status === 'suspended' ? 'suspenso' : 'ativo'
}

function mapUser(raw: Raw): User {
  // O backend expõe um único campo `teamRole` que pode valer 'owner' | 'editor' | 'admin'
  // (admin = administrador da plataforma, sem conta/agência). O front separa isso em dois
  // eixos: `role` (admin/user, gate de sistema) e `teamRole` (owner/editor, gate de agência).
  const roleSource = String(
    pick(raw, ['teamRole', 'team_role', 'role'], ''),
  ).toLowerCase()
  return {
    id: String(pick(raw, ['id', '_id', 'userId'], '')),
    name: pick(raw, ['nome', 'name', 'fullName'], ''),
    email: pick(raw, ['email'], ''),
    role: roleSource === 'admin' ? 'admin' : 'user',
    teamRole: normalizeTeamRole(roleSource),
    photoUrl: pick<string | null>(raw, ['fotoUrl', 'foto_url', 'photoUrl', 'avatarUrl'], null),
    branding: mapBranding(pick<Raw | null>(raw, ['branding'], null)),
  }
}

function mapClient(raw: Raw): Client {
  return {
    id: String(pick(raw, ['id', '_id', 'clientId'], '')),
    name: pick(raw, ['nome', 'name'], ''),
    email: pick(raw, ['email'], ''),
    isExample: Boolean(pick(raw, ['isExemplo', 'is_exemplo', 'isExample'], false)),
    description: pick<string | null>(raw, ['descricao', 'description', 'bio'], null),
    photoUrl: pick<string | null>(raw, ['fotoUrl', 'foto_url', 'foto', 'photoUrl', 'avatarUrl'], null),
  }
}

function mapProjectMember(raw: Raw): ProjectMember {
  const userRaw = pick<Raw | null>(raw, ['user', 'usuario'], null)
  return {
    id: String(pick(raw, ['id', '_id'], '')),
    userId: String(pick(raw, ['userId', 'user_id'], userRaw?.id ?? '')),
    name: pick(userRaw ?? raw, ['nome', 'name', 'fullName'], ''),
    email: pick(userRaw ?? raw, ['email'], ''),
  }
}

function mapProject(raw: Raw): Project {
  const clientRaw = pick<Raw | null>(raw, ['client'], null)
  const membersRaw = pick<Raw[] | null>(raw, ['members'], null)
  return {
    id: String(pick(raw, ['id', '_id', 'projectId'], '')),
    name: pick(raw, ['nome', 'name', 'title'], ''),
    clientId: String(pick(raw, ['clientId', 'client_id'], clientRaw?.id ?? '')),
    client: clientRaw ? mapClient(clientRaw) : undefined,
    isExample: Boolean(pick(raw, ['isExemplo', 'is_exemplo', 'isExample'], false)),
    publicLink: pick<string | null>(raw, ['linkPublico', 'link_publico', 'publicLink'], null),
    members: membersRaw ? membersRaw.map(mapProjectMember) : undefined,
  }
}

function normalizeProcessing(raw: unknown): VideoProcessingStatus {
  const s = String(raw ?? '').toLowerCase()
  if (['processando', 'processing', 'pending', 'queued', 'transcoding'].includes(s))
    return 'processando'
  return 'pronto'
}

function mapBranding(raw: Raw | null | undefined): Branding | null {
  if (!raw) return null
  const logoUrl = pick<string | null>(raw, ['logoUrl', 'logo_url', 'logo'], null)
  // `nomeAgencia` só aparece na resposta de PATCH /users/me/branding (onde `nome`
  // é o nome da PESSOA, não da agência). No vídeo público, só existe `nome` mesmo
  // (o `agencia.nome` já É o nome da agência) — por isso a ordem de fallback.
  const agencyName = pick<string | null>(
    raw,
    ['nomeAgencia', 'nome', 'agencyName', 'agency_name', 'name'],
    null,
  )
  const accentColor = pick<string | null>(
    raw,
    ['corDestaque', 'cor_destaque', 'accentColor', 'accent_color', 'color'],
    null,
  )
  if (!logoUrl && !agencyName && !accentColor) return null
  return { logoUrl, agencyName, accentColor }
}

/**
 * Mapeia um `Video` cru. `extra.clientName` é usado quando o próprio endpoint
 * não devolve o cliente do vídeo (ex.: `GET /videos?project_id=`) — quem
 * chama busca o projeto/cliente separadamente e repassa aqui.
 */
function mapVideo(raw: Raw, extra?: { clientName?: string | null }): Video {
  const projectRaw = pick<Raw | null>(raw, ['project', 'projeto'], null)
  const clientRaw = pick<Raw | null>(raw, ['client', 'cliente'], projectRaw?.client ?? null)
  const countRaw = pick<Raw | null>(raw, ['_count'], null)
  const videoPaiRaw = pick<Raw | null>(raw, ['videoPai', 'video_pai'], null)
  const originalUrl = pick<string | null>(raw, ['urlStorage', 'url_storage'], null)
  return {
    id: String(pick(raw, ['id', '_id', 'videoId'], '')),
    title: pick(raw, ['nomeArquivo', 'nome_arquivo', 'title', 'name'], 'Sem título'),
    type: pick(raw, ['type', 'format', 'tipo'], 'Vídeo'),
    status: normalizeStatus(pick(raw, ['status'], 'pendente')),
    duration:
      Number(pick(raw, ['duracaoSegundos', 'duracao_segundos', 'duration', 'duracao', 'durationSeconds'], 0)) ||
      0,
    url: pick<string | null>(raw, ['urlOtimizada', 'url_otimizada'], null) ?? originalUrl,
    originalUrl,
    posterUrl: pick<string | null>(raw, ['thumbnailUrl', 'thumbnail_url', 'posterUrl', 'poster'], null),
    publicLink: pick<string | null>(
      raw,
      ['linkPublico', 'link_publico', 'publicLink', 'link'],
      null,
    ),
    clientName: extra?.clientName ?? pick(clientRaw, ['nome', 'name'], '') ?? '',
    projectId: pick<string | null>(raw, ['projectId', 'project_id'], projectRaw?.id ?? null),
    commentsCount:
      Number(pick(raw, ['commentsCount', 'comments_count'], countRaw?.comments ?? 0)) || 0,
    lastCommentAt: pick<string | null>(
      raw,
      ['ultimoComentarioEm', 'ultimo_comentario_em', 'lastCommentAt', 'last_comment_at'],
      null,
    ),
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    processingStatus: normalizeProcessing(
      pick(raw, ['statusProcessamento', 'status_processamento'], 'pronto'),
    ),
    isExample: Boolean(pick(raw, ['isExemplo', 'is_exemplo', 'isExample'], false)),
    deadline: pick<string | null>(raw, ['deadline', 'prazo'], null),
    editorId: pick<string | null>(
      raw,
      ['editorResponsavelId', 'editor_responsavel_id', 'editorId', 'editor_id'],
      null,
    ),
    version: Number(pick(raw, ['versao', 'version'], 1)) || 1,
    videoPaiId: pick<string | null>(raw, ['videoPaiId', 'video_pai_id'], videoPaiRaw?.id ?? null),
    // Preenchido depois pelo `resolveLatestVersions`, ao id do próprio vídeo
    // até ser recalculado com a lista completa (não dá pra saber sozinho).
    latestVersionId: String(pick(raw, ['id', '_id', 'videoId'], '')),
  }
}

/**
 * Recebe uma lista de vídeos já mapeados e resolve, pra cada um, o id da
 * versão mais recente da sua cadeia (percorrendo filho→filho via videoPaiId,
 * não só um passo — cobre reenvios em sequência v1 → v2 → v3...). O backend
 * só expõe filho→pai, então isso precisa ser calculado no frontend com a
 * lista inteira em mãos.
 */
export function resolveLatestVersions(videos: Video[]): Video[] {
  const childByParent = new Map<string, string>()
  for (const v of videos) if (v.videoPaiId) childByParent.set(v.videoPaiId, v.id)
  return videos.map((v) => {
    let latest = v.id
    while (childByParent.has(latest)) latest = childByParent.get(latest)!
    return latest === v.id ? v : { ...v, latestVersionId: latest }
  })
}

function normalizeCommentAuthorRole(raw: Raw): CommentAuthorRole | null {
  // O canal cliente marca a resposta da agência com um booleano, não um papel.
  if (pick<boolean>(raw, ['isAgencyReply', 'is_agency_reply'], false)) return 'agency'
  const authorUser = pick<Raw | null>(raw, ['autorUser', 'author'], null)
  const roleSource = pick<unknown>(
    raw,
    ['autorType', 'autor_type', 'authorRole', 'author_role', 'role'],
    typeof authorUser === 'object' && authorUser ? authorUser.teamRole ?? authorUser.role : undefined,
  )
  const s = String(roleSource ?? '').toLowerCase()
  if (['owner', 'dono', 'admin'].includes(s)) return 'owner'
  if (['editor', 'member', 'colaborador'].includes(s)) return 'editor'
  if (['agency', 'agencia', 'agência'].includes(s)) return 'agency'
  if (['client', 'cliente'].includes(s)) return 'client'
  return null
}

function mapComment(raw: Raw): Comment {
  const authorUser = pick<Raw | null>(raw, ['autorUser', 'author'], null)
  const author =
    pick<string | null>(raw, ['autorNome', 'autor_nome'], null) ??
    (typeof authorUser === 'object' && authorUser ? authorUser.nome ?? authorUser.name : null) ??
    pick(raw, ['authorName', 'name'], 'Cliente')
  return {
    id: String(pick(raw, ['id', '_id'], cryptoId())),
    author: author || 'Cliente',
    timestamp: Number(pick(raw, ['timestampVideo', 'timestamp_video', 'timestamp'], 0)) || 0,
    text: pick(raw, ['texto', 'text', 'body', 'content'], ''),
    audioUrl: pick<string | null>(raw, ['audioUrl', 'audio_url', 'urlAudio', 'url_audio'], null),
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    authorRole: normalizeCommentAuthorRole(raw),
    parentId: pick<string | null>(raw, ['parentId', 'parent_id'], null),
  }
}

function mapTeamMember(raw: Raw): TeamMember {
  return {
    id: String(pick(raw, ['id', '_id', 'userId', 'memberId'], '')),
    name: pick(raw, ['nome', 'name', 'fullName'], ''),
    email: pick(raw, ['email'], ''),
    teamRole: normalizeTeamRole(pick(raw, ['teamRole', 'team_role', 'role'], 'editor')),
    status: normalizeMemberStatus(pick(raw, ['status'], 'active')),
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    expiresAt: pick<string | null>(
      raw,
      ['expiresAt', 'expires_at', 'expiraEm', 'expira_em', 'conviteExpiraEm'],
      null,
    ),
  }
}


function normalizeSessionDeviceType(raw: unknown): SessionDeviceType {
  const s = String(raw ?? '').toLowerCase()
  if (['mobile', 'celular', 'phone', 'smartphone'].includes(s)) return 'mobile'
  if (['tablet'].includes(s)) return 'tablet'
  if (['desktop', 'computer', 'pc', 'notebook'].includes(s)) return 'desktop'
  return 'unknown'
}

function mapSession(raw: Raw): Session {
  return {
    id: String(pick(raw, ['id', '_id', 'sessionId'], '')),
    device: pick(
      raw,
      ['dispositivo', 'device', 'userAgent', 'user_agent'],
      'Dispositivo desconhecido',
    ),
    deviceType: normalizeSessionDeviceType(
      pick(raw, ['tipoDispositivo', 'tipo_dispositivo', 'deviceType', 'device_type'], null),
    ),
    location: pick<string | null>(raw, ['localizacao', 'localizacao_aproximada', 'location'], null),
    ip: pick<string | null>(raw, ['ip', 'ipAddress', 'ip_address'], null),
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    lastActiveAt: pick<string | null>(
      raw,
      ['ultimoAcessoEm', 'ultimo_acesso_em', 'lastActiveAt', 'last_active_at'],
      null,
    ),
    current: Boolean(pick(raw, ['atual', 'current', 'isCurrent', 'is_current'], false)),
  }
}

function mapRating(raw: Raw): Rating {
  return {
    id: String(pick(raw, ['id', '_id'], cryptoId())),
    questionId: pick<string | null>(
      raw,
      ['ratingQuestionId', 'rating_question_id', 'questionId', 'question_id'],
      null,
    ),
    category: pick(raw, ['categoria', 'category', 'name', 'text'], ''),
    value: Number(pick(raw, ['nota', 'value', 'score', 'stars', 'rating'], 0)) || 0,
  }
}

function mapRatingQuestion(raw: Raw): RatingQuestion {
  return {
    id: String(pick(raw, ['id', '_id'], cryptoId())),
    text: pick(raw, ['texto', 'text'], ''),
    order: Number(pick(raw, ['ordem', 'order'], 0)) || 0,
    active: Boolean(pick<boolean>(raw, ['ativo', 'active'], true)),
  }
}

/** Faixa de desempenho — o backend já devolve os mesmos valores do `PerformanceTier`. */
function normalizePerformanceTier(raw: unknown): PerformanceTier {
  const s = String(raw ?? '').toLowerCase()
  if (['verde', 'amarelo', 'laranja', 'vermelho'].includes(s)) return s as PerformanceTier
  return 'sem_dados'
}

function mapEditorPerformance(raw: Raw): EditorPerformance {
  const scoreRaw = pick<number | string | null>(raw, ['notaMedia', 'nota_media'], null)
  return {
    editorId: String(pick(raw, ['editorId', 'editor_id'], '')),
    name: pick(raw, ['nome', 'name'], ''),
    avatarUrl: pick<string | null>(raw, ['avatarUrl', 'avatar_url'], null),
    averageScore: scoreRaw === null || scoreRaw === '' ? null : Number(scoreRaw),
    approvedVideosCount:
      Number(pick(raw, ['videosAprovadosCount', 'videos_aprovados_count'], 0)) || 0,
    tier: normalizePerformanceTier(pick(raw, ['faixa'], 'sem_dados')),
  }
}

function mapQueueItem(raw: Raw): QueueVideoItem {
  return {
    link: String(pick(raw, ['link', 'publicLink', 'public_link', 'slug'], '')),
    title: pick(raw, ['title', 'name', 'titulo'], 'Sem título'),
    posterUrl: pick<string | null>(raw, ['posterUrl', 'poster', 'thumbnailUrl', 'thumbnail'], null),
    status: normalizeStatus(pick(raw, ['status'], 'pendente')),
  }
}

function mapGalleryVideoItem(raw: Raw): GalleryVideoItem {
  const videoPaiRaw = pick<Raw | null>(raw, ['videoPai', 'video_pai'], null)
  return {
    id: String(pick(raw, ['id', '_id', 'videoId'], '')),
    videoPaiId: pick<string | null>(raw, ['videoPaiId', 'video_pai_id'], videoPaiRaw?.id ?? null),
    link: String(pick(raw, ['link', 'publicLink', 'public_link', 'slug'], '')),
    title: pick(raw, ['nomeArquivo', 'nome_arquivo', 'title', 'name', 'titulo'], 'Sem título'),
    posterUrl: pick<string | null>(raw, ['posterUrl', 'poster', 'thumbnailUrl', 'thumbnail'], null),
    status: normalizeStatus(pick(raw, ['status'], 'pendente')),
    processingStatus: normalizeProcessing(
      pick(raw, ['statusProcessamento', 'status_processamento'], 'pronto'),
    ),
    version: Number(pick(raw, ['versao', 'version'], 1)) || 1,
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
  }
}

/**
 * Some da galeria pública os vídeos que já foram substituídos por uma nova
 * versão — mesmo problema que dashboard/projeto resolvem com `resolveLatestVersions`
 * (lib/services.ts:281), mas a galeria não tem a cadeia completa de ids, só
 * precisa saber "alguém aponta pra mim como pai?" pra se esconder.
 */
function hideSupersededGalleryVideos(videos: GalleryVideoItem[]): GalleryVideoItem[] {
  const supersededIds = new Set<string>()
  for (const v of videos) if (v.videoPaiId) supersededIds.add(v.videoPaiId)
  return videos.filter((v) => !supersededIds.has(v.id))
}

function mapPortfolioVideoItem(raw: Raw): PortfolioVideoItem {
  return {
    id: String(pick(raw, ['id', '_id'], '')),
    title: pick(raw, ['titulo', 'title', 'nomeArquivo', 'nome_arquivo', 'name'], 'Sem título'),
    description: pick<string | null>(raw, ['descricao', 'description'], null),
    videoUrl: pick<string | null>(raw, ['videoUrl', 'video_url', 'url', 'urlStorage'], null),
    posterUrl: pick<string | null>(raw, ['posterUrl', 'poster', 'thumbnailUrl', 'thumbnail'], null),
    processingStatus: normalizeProcessing(
      pick(raw, ['statusProcessamento', 'status_processamento'], 'pronto'),
    ),
    order: Number(pick(raw, ['ordem', 'order'], 0)) || 0,
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
  }
}

function mapPortfolio(raw: Raw): Portfolio {
  const videos = asArray(pick(raw, ['videos'], []))
    .map(mapPortfolioVideoItem)
    .sort((a, b) => a.order - b.order)
  return {
    id: String(pick(raw, ['id', '_id'], '')),
    name: pick(raw, ['nome', 'name', 'titulo'], 'Sem título'),
    description: pick<string | null>(raw, ['descricao', 'description'], null),
    link: String(pick(raw, ['link', 'linkPublico', 'link_publico', 'slug'], '')),
    coverUrl: pick<string | null>(
      raw,
      ['capaUrl', 'coverUrl', 'cover_url'],
      videos[0]?.posterUrl ?? null,
    ),
    videos,
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    updatedAt: pick<string | null>(raw, ['atualizadoEm', 'atualizado_em', 'updatedAt'], null),
  }
}

function mapAdminUser(raw: Raw): AdminUser {
  const base = mapUser(raw)
  const s = String(pick(raw, ['status'], 'ativo')).toLowerCase()
  const status: UserStatus = ['suspenso', 'suspended'].includes(s) ? 'suspended' : 'active'
  return {
    ...base,
    status,
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    plan: pick<PlanId | null>(raw, ['plan', 'plano'], null),
  }
}

function normalizeNotificationType(raw: unknown): NotificationType {
  const s = String(raw ?? '')
  if (
    s === 'comentario_cliente' ||
    s === 'aprovacao_cliente' ||
    s === 'ajuste_solicitado' ||
    s === 'avaliacao_cliente' ||
    s === 'lembrete_gravacao'
  )
    return s
  return 'comentario_cliente'
}

function mapNotification(raw: Raw): AppNotification {
  const videoRaw = pick<Raw | null>(raw, ['video'], null)
  const projectRaw = pick<Raw | null>(videoRaw, ['project', 'projeto'], null)
  // O cliente pode vir aninhado direto no vídeo OU dentro do projeto,
  // dependendo do endpoint (mesma ambiguidade já resolvida em `mapVideo`) —
  // tenta os dois antes de cair pro nome do projeto por engano (era o que
  // acontecia antes: sem essa checagem, `clientRaw` ficava `null` sempre que
  // o backend não aninhava `cliente` dentro de `projeto`, e a badge do
  // cliente na notificação acabava mostrando o nome do projeto).
  const clientRaw = pick<Raw | null>(
    videoRaw,
    ['client', 'cliente'],
    pick<Raw | null>(projectRaw, ['client', 'cliente'], null),
  )
  const clientName =
    pick<string>(clientRaw, ['nome', 'name'], '') ||
    // Alguns retornos já vêm com o nome do cliente "achatado" direto no
    // vídeo (`clienteNome`/`clientName`), sem objeto aninhado.
    pick<string>(videoRaw, ['clienteNome', 'cliente_nome', 'clientName', 'client_name'], '')

  // `lembrete_gravacao` não tem vídeo — referencia um evento da escala
  // (`/recording-events`) em vez disso.
  const eventRaw = pick<Raw | null>(raw, ['event', 'evento', 'recordingEvent'], null)

  return {
    id: String(pick(raw, ['id', '_id'], cryptoId())),
    type: normalizeNotificationType(pick(raw, ['type', 'tipo'], null)),
    read: Boolean(pick(raw, ['lida', 'read'], false)),
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    video: videoRaw
      ? {
          id: String(pick(videoRaw, ['id', '_id'], '')),
          title: pick(videoRaw, ['nomeArquivo', 'nome_arquivo', 'title'], 'Vídeo'),
          posterUrl: pick<string | null>(videoRaw, ['thumbnailUrl', 'thumbnail_url', 'posterUrl'], null),
          publicLink: pick<string | null>(videoRaw, ['linkPublico', 'link_publico', 'publicLink'], null),
          projectName: pick(projectRaw, ['nome', 'name'], ''),
          clientName,
        }
      : null,
    event: eventRaw
      ? {
          id: String(pick(eventRaw, ['id', '_id'], '')),
          title: pick(eventRaw, ['title', 'titulo'], 'Gravação'),
          startAt: pick<string>(eventRaw, ['startAt', 'inicioEm', 'inicio_em'], ''),
          clientName: pick<string | null>(eventRaw, ['clientName', 'cliente_nome', 'clienteNome'], null),
        }
      : null,
  }
}

function cryptoId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

/* -------------------------------- auth ----------------------------------- */

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await api.post<Raw>('/auth/login', { email, senha: password }, { auth: false })
    const token = pick(res, ['access_token', 'accessToken'], '')
    const userRaw = pick<Raw | null>(res, ['user'], null)
    if (!token) throw new Error('Resposta de login sem token.')
    return { token, user: userRaw ? mapUser(userRaw) : mapUser(res) }
  },

  /**
   * Cadastro. O backend cria um projeto/vídeo de exemplo (isExemplo) junto
   * com a conta, então o dashboard já abre com conteúdo para explorar.
   */
  async register(input: {
    name: string
    email: string
    password: string
  }): Promise<AuthResponse> {
    const res = await api.post<Raw>(
      '/auth/register',
      { nome: input.name, email: input.email, senha: input.password },
      { auth: false },
    )
    const token = pick(res, ['access_token', 'accessToken'], '')
    const userRaw = pick<Raw | null>(res, ['user'], null)
    if (!token) throw new Error('Resposta de cadastro sem token.')
    return { token, user: userRaw ? mapUser(userRaw) : mapUser(res) }
  },

  /**
   * Solicita o e-mail de redefinição de senha. A UI trata a resposta como
   * sucesso sempre (não revela se o e-mail existe). `POST /auth/forgot-password`
   * ainda não existe no backend documentado em API.md — precisa ser
   * adicionado lá antes disso funcionar fora do demo.
   */
  async forgotPassword(email: string): Promise<void> {
    if (isDemo()) {
      await delay(null, 400)
      return
    }
    await api.post('/auth/forgot-password', { email }, { auth: false })
  },

  /** Redefine a senha a partir do token recebido por e-mail. */
  async resetPassword(token: string, password: string): Promise<void> {
    if (isDemo()) {
      await delay(null, 400)
      return
    }
    await api.post('/auth/reset-password', { token, novaSenha: password }, { auth: false })
  },
}

/* ------------------------------- videos ---------------------------------- */

/** Teto de itens por página aceito pelo backend em `GET /videos`. */
const VIDEOS_PAGE_LIMIT = 100

/**
 * `GET /videos` passou a ser paginado (default `page=1&limit=50`, teto de
 * `limit=100`) — sem paginar de verdade nessa busca, contas com mais vídeos
 * que o limit pareciam estar com vídeos "sumindo" (truncados na primeira
 * página). Busca todas as páginas e agrega, já que dashboard/projetos ainda
 * listam tudo de uma vez (sem infinite scroll).
 */
async function fetchAllVideoPages(
  query: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<Raw[]> {
  const items: Raw[] = []
  let page = 1
  for (;;) {
    const res = await api.get('/videos', { query: { ...query, page, limit: VIDEOS_PAGE_LIMIT }, signal })
    const pageItems = asArray<Raw>(res)
    items.push(...pageItems)
    const totalPages = pick<number>(res as Raw, ['totalPages', 'total_pages'], 1)
    if (pageItems.length === 0 || page >= totalPages) break
    page += 1
  }
  return items
}

/** Busca os vídeos de um projeto já resolvido, herdando o nome do cliente (não vem no item). */
async function fetchProjectVideos(project: Project, signal?: AbortSignal): Promise<Video[]> {
  const raw = await fetchAllVideoPages({ project_id: project.id }, signal)
  return raw.map((v) => mapVideo(v, { clientName: project.client?.name ?? null }))
}

/**
 * Agrega "todos os vídeos" da conta numa única chamada (`GET /videos` sem
 * `project_id`). O item retornado não vem com o nome do cliente embutido
 * (mesmo formato de `GET /videos?project_id=`), então busca a lista de
 * projetos em paralelo só pra resolver `projectId -> clientName`. Dashboard,
 * projetos e canal do cliente chamam `list()` sem `projectId`
 * independentemente; um cache curto evita repetir as 2 chamadas em
 * navegações próximas no tempo. Não é passado `signal` porque a mesma
 * promise é compartilhada entre chamadores independentes.
 */
const ALL_VIDEOS_CACHE_TTL_MS = 8000
let allVideosCache: { promise: Promise<Video[]>; expiresAt: number } | null = null

function invalidateAllVideosCache() {
  allVideosCache = null
}

function fetchAllVideosCached(): Promise<Video[]> {
  const now = Date.now()
  if (allVideosCache && allVideosCache.expiresAt > now) return allVideosCache.promise

  const promise = (async () => {
    const [projects, raw] = await Promise.all([projectService.list(), fetchAllVideoPages({})])
    const clientNameByProjectId = new Map(projects.map((p) => [p.id, p.client?.name ?? '']))
    const videos = raw.map((v) => {
      const projectId = pick<string | null>(v, ['projectId', 'project_id'], null)
      return mapVideo(v, { clientName: (projectId && clientNameByProjectId.get(projectId)) ?? '' })
    })
    return videos.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  })()
  promise.catch(() => invalidateAllVideosCache())
  allVideosCache = { promise, expiresAt: now + ALL_VIDEOS_CACHE_TTL_MS }
  return promise
}

export const videoService = {
  /**
   * Sem `projectId`: agrega os vídeos de TODOS os projetos da conta (o
   * backend só lista por projeto — `GET /videos?project_id=`), usado pelo
   * dashboard, via cache curto (ver `fetchAllVideosCached`). Com `projectId`:
   * lista só os daquele projeto.
   */
  async list(projectId?: string, signal?: AbortSignal): Promise<Video[]> {
    if (isDemo()) {
      return delay(
        resolveLatestVersions(projectId ? demoVideosForProject(projectId) : demoVideos),
      )
    }
    if (projectId) {
      const project = await projectService.get(projectId, signal)
      return resolveLatestVersions(await fetchProjectVideos(project, signal))
    }
    return resolveLatestVersions(await fetchAllVideosCached())
  },

  /**
   * Página única de vídeos de um projeto (`GET /videos?project_id=&page=&limit=`),
   * para telas com "carregar mais" em vez de agregar tudo de uma vez como o
   * `list()` acima faz (ver `fetchAllVideoPages`). Não resolve `clientName`
   * por vídeo — quem chama isso já está numa tela de projeto único e não
   * precisa repetir o nome do cliente por card. Quem usa isso é responsável
   * por acumular as páginas e rodar `resolveLatestVersions` sobre a lista
   * acumulada a cada nova página (a API lista mais recente primeiro por
   * versão, então a versão nova sempre chega numa página igual ou anterior à
   * da antiga).
   */
  async listPage(
    projectId: string,
    opts: { page: number; limit?: number } = { page: 1 },
    signal?: AbortSignal,
  ): Promise<{ videos: Video[]; hasMore: boolean }> {
    if (isDemo()) {
      return delay({ videos: demoVideosForProject(projectId), hasMore: false })
    }
    const limit = opts.limit ?? VIDEOS_PAGE_LIMIT
    const res = await api.get('/videos', {
      query: { project_id: projectId, page: opts.page, limit },
      signal,
    })
    const raw = asArray<Raw>(res)
    const totalPages = pick<number>(res as Raw, ['totalPages', 'total_pages'], opts.page)
    return { videos: raw.map((v) => mapVideo(v)), hasMore: opts.page < totalPages }
  },

  /** Não existe `GET /videos/:id` no backend — resolve buscando entre todos os projetos. */
  async get(id: string, signal?: AbortSignal): Promise<Video> {
    if (isDemo()) {
      const resolved = resolveLatestVersions(demoVideos)
      return delay(resolved.find((v) => v.id === id) ?? resolved[0])
    }
    const all = await videoService.list(undefined, signal)
    const found = all.find((v) => v.id === id)
    if (!found) throw new ApiError('Vídeo não encontrado.', 404)
    return found
  },

  /** Passo 1 do upload: pega a presigned URL do R2. */
  async getUploadUrl(input: {
    fileName: string
    contentType: string
  }): Promise<{ uploadUrl: string; key: string; publicUrl: string | null; headers?: Record<string, string> }> {
    const res = await api.post<Raw>('/videos/upload-url', {
      nomeArquivo: input.fileName,
      contentType: input.contentType,
    })
    return {
      uploadUrl: pick(res, ['uploadUrl'], ''),
      key: pick(res, ['key'], ''),
      publicUrl: pick<string | null>(res, ['publicUrl'], null),
      headers: pick<Record<string, string> | undefined>(res, ['headers'], undefined),
    }
  },

  /** Passo 3 do upload: registra o vídeo no banco após subir pro R2. */
  async create(input: {
    projectId: string
    urlStorage: string
    nomeArquivo: string
    versao?: number
  }): Promise<Video> {
    const res = await api.post<Raw>('/videos', {
      projectId: input.projectId,
      urlStorage: input.urlStorage,
      nomeArquivo: input.nomeArquivo,
      versao: input.versao,
    })
    invalidateAllVideosCache()
    return mapVideo(res)
  },

  /**
   * Sobe uma nova versão vinculada a um vídeo existente (ex.: cliente pediu
   * ajuste e o editor reenvia a correção). O backend cria uma linha nova com
   * `videoPaiId` apontando pro vídeo atual, incrementa `versao` e gera um
   * `linkPublico` novo e independente — o link antigo NÃO passa a redirecionar
   * pra essa versão nova, então quem chamar isto precisa reenviar o link novo
   * pro cliente. O status do vídeo antigo também não é alterado pelo backend.
   */
  async newVersion(
    videoId: string,
    input: { urlStorage: string; nomeArquivo: string },
  ): Promise<Video> {
    if (isDemo()) return delay(demoNewVersion(videoId, input.nomeArquivo), 300)
    const res = await api.post<Raw>(`/videos/${videoId}/new-version`, {
      urlStorage: input.urlStorage,
      nomeArquivo: input.nomeArquivo,
    })
    invalidateAllVideosCache()
    return mapVideo(res)
  },

  /**
   * Define/edita o prazo de entrega do vídeo. Só o owner deve chamar isto (a
   * UI esconde a edição do editor); o backend também deve validar.
   */
  async updateDeadline(id: string, deadline: string | null): Promise<Video> {
    if (isDemo()) {
      const found = demoVideos.find((v) => v.id === id)
      return delay({ ...(found ?? demoVideos[0]), id, deadline }, 300)
    }
    const res = await api.patch<Raw>(`/videos/${id}/deadline`, { deadline })
    invalidateAllVideosCache()
    return mapVideo(res)
  },

  /** Renomeia o vídeo. Owner e cliente (via link público) podem chamar isto. */
  async updateTitle(id: string, title: string): Promise<Video> {
    if (isDemo()) {
      const found = demoVideos.find((v) => v.id === id)
      if (!found) throw new ApiError('Vídeo não encontrado.', 404)
      found.title = title
      return delay(found, 300)
    }
    const res = await api.patch<Raw>(`/videos/${id}/titulo`, { nomeArquivo: title })
    invalidateAllVideosCache()
    return mapVideo(res)
  },

  /** Define o editor responsável pelo vídeo (só o owner deve chamar). */
  async assignEditor(id: string, editorId: string | null): Promise<Video> {
    if (isDemo()) {
      const found = demoVideos.find((v) => v.id === id)
      return delay({ ...(found ?? demoVideos[0]), id, editorId }, 300)
    }
    const res = await api.patch<Raw>(`/videos/${id}/editor-responsavel`, { editorId })
    invalidateAllVideosCache()
    return mapVideo(res)
  },

  /** Baixa o arquivo original — usa a própria `urlStorage` do vídeo, sem endpoint dedicado. */
  async getDownloadOriginalUrl(id: string): Promise<{ url: string; filename: string }> {
    if (isDemo()) {
      await delay(null, 300)
      const found = demoVideos.find((v) => v.id === id)
      return {
        url: found?.originalUrl || found?.url || found?.posterUrl || '/placeholder.svg',
        filename: `${found?.title ?? 'video'}-original.mp4`,
      }
    }
    const video = await videoService.get(id)
    const url = video.originalUrl ?? video.url
    if (!url) throw new ApiError('Arquivo original indisponível.', 404)
    return { url, filename: video.title || `video-${id}-original.mp4` }
  },

  /** Exclui o vídeo (só o owner deve chamar). */
  async remove(id: string): Promise<void> {
    if (isDemo()) {
      const idx = demoVideos.findIndex((v) => v.id === id)
      if (idx !== -1) demoVideos.splice(idx, 1)
      return void (await delay(null, 300))
    }
    await api.delete(`/videos/${id}`)
    invalidateAllVideosCache()
  },

  /**
   * Define o status do vídeo diretamente pelo owner/editor (ex.: ações em lote
   * no dashboard), sem passar pelo fluxo de aprovação do cliente no link
   * público. Autenticado, exige role owner/editor (ver API.md).
   */
  async updateStatus(id: string, status: VideoStatus): Promise<Video> {
    if (isDemo()) {
      const found = demoVideos.find((v) => v.id === id)
      if (!found) throw new ApiError('Vídeo não encontrado.', 404)
      found.status = status
      return delay(found, 300)
    }
    const res = await api.patch<Raw>(`/videos/${id}/status`, { status })
    invalidateAllVideosCache()
    return mapVideo(res)
  },
}

/* ------------------------------ clients ---------------------------------- */

export const clientService = {
  async list(signal?: AbortSignal): Promise<Client[]> {
    if (isDemo()) return delay(demoClients)
    const res = await api.get('/clients', { signal })
    return asArray(res).map(mapClient)
  },
  async get(id: string, signal?: AbortSignal): Promise<Client> {
    if (isDemo()) {
      const found = demoClients.find((c) => c.id === id)
      if (!found) throw new ApiError('Cliente não encontrado.', 404)
      return delay(found)
    }
    const res = await api.get<Raw>(`/clients/${id}`, { signal })
    return mapClient(res)
  },
  async create(input: { name: string; email?: string }): Promise<Client> {
    if (isDemo()) {
      const created: Client = {
        id: `c-${Date.now()}`,
        name: input.name,
        email: input.email ?? '',
        isExample: false,
        description: null,
        photoUrl: null,
      }
      demoClients.push(created)
      return delay(created, 300)
    }
    const res = await api.post<Raw>('/clients', { nome: input.name, email: input.email })
    return mapClient(res)
  },
  async update(
    id: string,
    input: { name?: string; email?: string; description?: string | null; photoUrl?: string | null },
  ): Promise<Client> {
    if (isDemo()) {
      const found = demoClients.find((c) => c.id === id)
      if (!found) throw new ApiError('Cliente não encontrado.', 404)
      if (input.name !== undefined) found.name = input.name
      if (input.email !== undefined) found.email = input.email
      if (input.description !== undefined) found.description = input.description
      if (input.photoUrl !== undefined) found.photoUrl = input.photoUrl
      return delay(found, 300)
    }
    const res = await api.patch<Raw>(`/clients/${id}`, {
      nome: input.name,
      email: input.email,
      descricao: input.description,
      fotoUrl: input.photoUrl,
    })
    return mapClient(res)
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/clients/${id}`)
  },

  /**
   * Passo 1 do upload da foto de perfil: presigned URL pro R2. Path/body
   * seguem o mesmo formato de `userService.getBrandingUploadUrl` — endpoint
   * ainda não documentado em API.md, precisa ser confirmado com o back.
   */
  async getPhotoUploadUrl(input: {
    clientId: string
    fileName: string
    contentType: string
  }): Promise<{ uploadUrl: string; key: string; publicUrl: string | null; headers?: Record<string, string> }> {
    const res = await api.post<Raw>(`/clients/${input.clientId}/photo-upload-url`, {
      nomeArquivo: input.fileName,
      contentType: input.contentType,
    })
    return {
      uploadUrl: pick(res, ['uploadUrl'], ''),
      key: pick(res, ['key'], ''),
      publicUrl: pick<string | null>(res, ['publicUrl'], null),
      headers: pick<Record<string, string> | undefined>(res, ['headers'], undefined),
    }
  },
}

/* ------------------------------ projects --------------------------------- */

export const projectService = {
  /** O backend não filtra por cliente — busca tudo e filtra no front quando `clientId` é passado. */
  async list(clientId?: string, signal?: AbortSignal): Promise<Project[]> {
    if (isDemo())
      return delay(clientId ? demoProjects.filter((p) => p.clientId === clientId) : demoProjects)
    const res = await api.get('/projects', { signal })
    const all = asArray(res).map(mapProject)
    return clientId ? all.filter((p) => p.clientId === clientId) : all
  },
  async get(id: string, signal?: AbortSignal): Promise<Project> {
    if (isDemo()) return delay(demoProjects.find((p) => p.id === id) ?? demoProjects[0])
    const res = await api.get<Raw>(`/projects/${id}`, { signal })
    return mapProject(res)
  },
  async create(input: { name: string; clientId: string }): Promise<Project> {
    const res = await api.post<Raw>('/projects', { nome: input.name, clientId: input.clientId })
    return mapProject(res)
  },
  async update(id: string, input: { name?: string; clientId?: string }): Promise<Project> {
    const res = await api.patch<Raw>(`/projects/${id}`, { nome: input.name, clientId: input.clientId })
    return mapProject(res)
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`)
  },
  /** Atribui um editor ao projeto (só owner). Idempotente — retorna a lista atualizada de membros. */
  async assignMember(projectId: string, memberId: string): Promise<ProjectMember[]> {
    if (isDemo()) return delay(demoAssignProjectMember(projectId, memberId), 300)
    const res = await api.post<Raw>(`/projects/${projectId}/members/${memberId}`, {})
    return asArray(res).map(mapProjectMember)
  },
  /** Remove o acesso de um editor ao projeto (só owner). Retorna a lista atualizada de membros. */
  async removeMember(projectId: string, memberId: string): Promise<ProjectMember[]> {
    if (isDemo()) return delay(demoRemoveProjectMember(projectId, memberId), 300)
    const res = await api.delete<Raw>(`/projects/${projectId}/members/${memberId}`)
    return asArray(res).map(mapProjectMember)
  },
}

/* ------------------------------ portfólios -------------------------------- */

/**
 * Vitrine da agência (só owner): coleções de vídeos curadas manualmente, cada
 * uma com link público próprio (/p/:link) — distinto da galeria de projeto
 * (`projectService`/`getProjectGallery`), que espelha 1:1 os vídeos de uma
 * entrega e carrega status de aprovação. Aqui não há isso: um vídeo só entra
 * quando o owner escolhe (selecionando um já existente ou subindo um novo
 * direto pro portfólio), e a página pública nunca expõe cliente/projeto.
 *
 * Endpoints ainda não existem no backend — ver
 * `scratchpad/mensagem-backend-portfolios.md` para o contrato esperado. Até lá,
 * a experiência completa roda em modo demo.
 */
export const portfolioService = {
  async list(signal?: AbortSignal): Promise<Portfolio[]> {
    if (isDemo()) return delay(demoPortfolios)
    const res = await api.get('/portfolios', { signal })
    return asArray(res).map(mapPortfolio)
  },
  async get(id: string, signal?: AbortSignal): Promise<Portfolio> {
    if (isDemo()) {
      const found = demoPortfolios.find((p) => p.id === id)
      if (!found) throw new ApiError('Portfólio não encontrado.', 404)
      return delay(found)
    }
    const res = await api.get<Raw>(`/portfolios/${id}`, { signal })
    return mapPortfolio(res)
  },
  async create(input: { name: string; description?: string }): Promise<Portfolio> {
    if (isDemo()) return delay(demoCreatePortfolio(input), 300)
    const res = await api.post<Raw>('/portfolios', {
      nome: input.name,
      descricao: input.description,
    })
    return mapPortfolio(res)
  },
  async update(id: string, input: { name?: string; description?: string | null }): Promise<Portfolio> {
    if (isDemo()) return delay(demoUpdatePortfolio(id, input), 300)
    const res = await api.patch<Raw>(`/portfolios/${id}`, {
      nome: input.name,
      descricao: input.description,
    })
    return mapPortfolio(res)
  },
  async remove(id: string): Promise<void> {
    if (isDemo()) return void (await delay(demoDeletePortfolio(id), 300))
    await api.delete(`/portfolios/${id}`)
  },
  /** Adiciona um vídeo já existente (de qualquer projeto) ao portfólio — o backend copia url/poster nesse momento. */
  async addExistingVideo(
    portfolioId: string,
    videoId: string,
    input: { title?: string; description?: string } = {},
  ): Promise<Portfolio> {
    if (isDemo())
      return delay(demoAddExistingPortfolioVideo(portfolioId, videoId, input), 300)
    const res = await api.post<Raw>(`/portfolios/${portfolioId}/videos`, {
      videoId,
      titulo: input.title,
      descricao: input.description,
    })
    return mapPortfolio(res)
  },
  /**
   * Passo 1/3 do upload dedicado ao portfólio (mesmo shape de
   * `videoService.getUploadUrl`). Sem branch demo: quem chama isto já checou
   * `isDemo()` antes (mesmo padrão de `upload-view.tsx`), pra não gerar uma
   * URL presignada falsa que ninguém vai usar.
   */
  async getUploadUrl(
    portfolioId: string,
    input: { fileName: string; contentType: string },
  ): Promise<{
    uploadUrl: string
    key: string
    publicUrl: string | null
    headers?: Record<string, string>
  }> {
    const res = await api.post<Raw>(`/portfolios/${portfolioId}/upload-url`, {
      nomeArquivo: input.fileName,
      contentType: input.contentType,
    })
    return {
      uploadUrl: pick(res, ['uploadUrl'], ''),
      key: pick(res, ['key'], ''),
      publicUrl: pick<string | null>(res, ['publicUrl'], null),
      headers: pick<Record<string, string> | undefined>(res, ['headers'], undefined),
    }
  },
  /** Passo 3/3: registra o vídeo enviado direto pro portfólio (sem projeto/cliente por trás). */
  async confirmUpload(
    portfolioId: string,
    input: { urlStorage: string; nomeArquivo: string; title?: string; description?: string },
  ): Promise<Portfolio> {
    if (isDemo())
      return delay(
        demoAddUploadedPortfolioVideo(portfolioId, {
          title: input.title || input.nomeArquivo,
          description: input.description ?? null,
          videoUrl: input.urlStorage,
          posterUrl: null,
        }),
        300,
      )
    const res = await api.post<Raw>(`/portfolios/${portfolioId}/videos/upload-complete`, {
      urlStorage: input.urlStorage,
      nomeArquivo: input.nomeArquivo,
      titulo: input.title,
      descricao: input.description,
    })
    return mapPortfolio(res)
  },
  async updateVideo(
    portfolioId: string,
    videoId: string,
    input: { title?: string; description?: string | null },
  ): Promise<Portfolio> {
    if (isDemo()) return delay(demoUpdatePortfolioVideo(portfolioId, videoId, input), 300)
    const res = await api.patch<Raw>(`/portfolios/${portfolioId}/videos/${videoId}`, {
      titulo: input.title,
      descricao: input.description,
    })
    return mapPortfolio(res)
  },
  async removeVideo(portfolioId: string, videoId: string): Promise<Portfolio> {
    if (isDemo()) return delay(demoRemovePortfolioVideo(portfolioId, videoId), 300)
    const res = await api.delete<Raw>(`/portfolios/${portfolioId}/videos/${videoId}`)
    return mapPortfolio(res)
  },
  /** Reordena os vídeos do portfólio (botões subir/descer na UI de gestão). */
  async reorder(portfolioId: string, orderedVideoIds: string[]): Promise<Portfolio> {
    if (isDemo()) return delay(demoReorderPortfolioVideos(portfolioId, orderedVideoIds), 300)
    const res = await api.patch<Raw>(`/portfolios/${portfolioId}/videos/order`, {
      videoIds: orderedVideoIds,
    })
    return mapPortfolio(res)
  },
}

/* --------------------------- public (cliente) ---------------------------- */

export const publicService = {
  async getByLink(link: string, signal?: AbortSignal): Promise<PublicVideo> {
    if (isDemoVideoLink(link)) return delay(demoPublicVideo(link))
    const res = await api.get<Raw>(`/public/videos/${encodeURIComponent(link)}`, {
      auth: false,
      signal,
    })
    const projetoRaw = pick<Raw | null>(res, ['projeto', 'project'], null)
    const clienteRaw = pick<Raw | null>(res, ['cliente', 'client'], null)
    const agenciaRaw = pick<Raw | null>(res, ['agencia', 'agency', 'branding'], null)
    const overallRaw = pick<number | string | null>(res, ['notaGeral', 'nota_geral'], null)
    // Reaproveita `mapClient` (mesmos nomes de campo de `/clients`) pra extrair
    // a foto/descrição configuradas pelo owner, exibidas no modo Reels.
    const cliente = clienteRaw ? mapClient(clienteRaw) : null
    return {
      video: mapVideo(res, { clientName: cliente?.name ?? null }),
      comments: asArray(pick(res, ['comments'], [])).map(mapComment),
      ratings: asArray(pick(res, ['ratings'], [])).map(mapRating),
      ratingQuestions: asArray(pick(res, ['ratingQuestions', 'rating_questions'], []))
        .map(mapRatingQuestion)
        .sort((a, b) => a.order - b.order),
      overallRating: overallRaw === null || overallRaw === '' ? null : Number(overallRaw),
      projectName: pick<string | null>(projetoRaw, ['nome', 'name'], null),
      branding: mapBranding(agenciaRaw),
      queue: asArray(pick(res, ['queue'], []))
        .map(mapQueueItem)
        .filter((q) => q.link),
      clientPhotoUrl: cliente?.photoUrl ?? null,
      clientDescription: cliente?.description ?? null,
    }
  },

  async addComment(
    link: string,
    input: { text: string; timestamp: number; author?: string; audioUrl?: string | null },
  ): Promise<Comment> {
    if (isDemoVideoLink(link))
      return delay(
        {
          id: cryptoId(),
          author: input.author || 'Você',
          timestamp: input.timestamp,
          text: input.text,
          audioUrl: input.audioUrl ?? null,
          createdAt: new Date().toISOString(),
          authorRole: 'client',
          parentId: null,
        },
        250,
      )
    const res = await api.post<Raw>(
      `/public/videos/${encodeURIComponent(link)}/comments`,
      {
        timestampVideo: input.timestamp,
        texto: input.text,
        autorNome: (input.author ?? '').trim() || 'Cliente',
        audioUrl: input.audioUrl ?? undefined,
      },
      { auth: false },
    )
    return mapComment(res)
  },

  /**
   * Presigned URL pra upload direto do áudio gravado pelo cliente (mesmo
   * padrão 3-etapas de `videoService.getUploadUrl`), pro comentário por voz.
   * Endpoint ainda não existe no backend — precisa ser criado lá seguindo
   * este mesmo contrato antes desta função funcionar fora do modo demo.
   */
  async getCommentAudioUploadUrl(
    link: string,
    input: { fileName: string; contentType: string },
  ): Promise<{ uploadUrl: string; key: string; publicUrl: string | null; headers?: Record<string, string> }> {
    const res = await api.post<Raw>(
      `/public/videos/${encodeURIComponent(link)}/comments/audio-upload-url`,
      { nomeArquivo: input.fileName, contentType: input.contentType },
      { auth: false },
    )
    return {
      uploadUrl: pick(res, ['uploadUrl'], ''),
      key: pick(res, ['key'], ''),
      publicUrl: pick<string | null>(res, ['publicUrl'], null),
      headers: pick<Record<string, string> | undefined>(res, ['headers'], undefined),
    }
  },

  async addRating(
    link: string,
    input: { questionId: string; category: string; value: number },
  ): Promise<Rating> {
    if (isDemoVideoLink(link))
      return delay(
        {
          id: cryptoId(),
          questionId: input.questionId,
          category: input.category,
          value: input.value,
        },
        200,
      )
    // `questionId` carrega o id da pergunta de avaliação (RatingQuestion.id).
    const res = await api.post<Raw>(
      `/public/videos/${encodeURIComponent(link)}/ratings`,
      { ratingQuestionId: input.questionId, nota: input.value },
      { auth: false },
    )
    return mapRating(res)
  },

  /** Aprova o vídeo. `overallRating` (nota geral, 1-5) alimenta o desempenho do editor. */
  async approve(link: string, overallRating?: number): Promise<void> {
    if (isDemoVideoLink(link)) return void (await delay(null, 300))
    await api.post(
      `/public/videos/${encodeURIComponent(link)}/approve`,
      { notaGeral: overallRating },
      { auth: false },
    )
  },

  async requestChanges(link: string): Promise<void> {
    if (isDemoVideoLink(link)) return void (await delay(null, 300))
    await api.post(`/public/videos/${encodeURIComponent(link)}/request-changes`, undefined, {
      auth: false,
    })
  },

  /** Renomeia o vídeo a partir da tela pública do cliente. */
  async updateTitle(link: string, title: string): Promise<Video> {
    if (isDemoVideoLink(link)) {
      const found = demoVideos.find((v) => v.publicLink === link) ?? demoVideos[0]
      found.title = title
      return delay(found, 300)
    }
    const res = await api.patch<Raw>(
      `/public/videos/${encodeURIComponent(link)}/titulo`,
      { nomeArquivo: title },
      { auth: false },
    )
    return mapVideo(res)
  },

  /** Galeria pública do projeto: um link só listando todos os vídeos da entrega. */
  async getProjectGallery(link: string, signal?: AbortSignal): Promise<ProjectGallery> {
    if (isDemoProjectLink(link)) return delay(demoProjectGallery(link))
    const res = await api.get<Raw>(`/public/projects/${encodeURIComponent(link)}`, {
      auth: false,
      signal,
    })
    const projetoRaw = pick<Raw | null>(res, ['projeto', 'project'], null)
    const clienteRaw = pick<Raw | null>(res, ['cliente', 'client'], null)
    const agenciaRaw = pick<Raw | null>(res, ['agencia', 'agency', 'branding'], null)
    return {
      projectName: pick(projetoRaw, ['nome', 'name'], ''),
      clientName: pick(clienteRaw, ['nome', 'name'], ''),
      branding: mapBranding(agenciaRaw),
      videos: hideSupersededGalleryVideos(
        asArray(pick(res, ['videos'], []))
          .map(mapGalleryVideoItem)
          .filter((v) => v.link),
      )
        // Backend não garante ordem; sem isso o vídeo recém-enviado podia
        // aparecer depois de vídeos antigos do mesmo projeto na galeria.
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    }
  },

  /** Portfólio público da agência (vitrine): grade de vídeos sem nenhum dado de cliente/projeto. */
  async getPortfolioByLink(link: string, signal?: AbortSignal): Promise<PublicPortfolio> {
    if (isDemoPortfolioLink(link)) return delay(demoPublicPortfolio(link))
    const res = await api.get<Raw>(`/public/portfolios/${encodeURIComponent(link)}`, {
      auth: false,
      signal,
    })
    const agenciaRaw = pick<Raw | null>(res, ['agencia', 'agency', 'branding'], null)
    return {
      name: pick(res, ['nome', 'name'], ''),
      description: pick<string | null>(res, ['descricao', 'description'], null),
      branding: mapBranding(agenciaRaw),
      videos: asArray(pick(res, ['videos'], []))
        .map(mapPortfolioVideoItem)
        .sort((a, b) => a.order - b.order),
    }
  },
}

/* -------------------------- canal interno (agência) ---------------------- */

export const internalCommentService = {
  /** Comentários do canal interno (visível só para owner/editor). */
  async list(videoId: string, signal?: AbortSignal): Promise<Comment[]> {
    if (isDemo()) return delay(demoInternalComments(videoId))
    const res = await api.get(`/videos/${videoId}/comments/internal`, { signal })
    return asArray(res).map(mapComment)
  },

  /**
   * Publica um comentário interno. `parentId` transforma o envio numa
   * resposta dentro da thread.
   */
  async add(
    videoId: string,
    input: { text: string; timestamp: number; parentId?: string | null },
  ): Promise<Comment> {
    if (isDemo())
      return delay(
        {
          id: cryptoId(),
          author: demoMe().name,
          timestamp: input.timestamp,
          text: input.text,
          audioUrl: null,
          createdAt: new Date().toISOString(),
          authorRole: demoMe().teamRole,
          parentId: input.parentId ?? null,
        },
        250,
      )
    const res = await api.post<Raw>(`/videos/${videoId}/comments/internal`, {
      timestampVideo: input.timestamp,
      texto: input.text,
      parentId: input.parentId ?? undefined,
    })
    return mapComment(res)
  },
}

/* --------------------- canal do cliente (visão agência) ------------------ */

export const clientChannelService = {
  /**
   * Visão autenticada do canal do cliente para um vídeo (por id). Reaproveita o
   * endpoint público através do link do vídeo, então owner e cliente enxergam
   * exatamente os mesmos comentários e respostas.
   */
  async get(videoId: string, signal?: AbortSignal): Promise<PublicVideo> {
    if (isDemo()) return delay(demoClientChannel(videoId))
    const video = await videoService.get(videoId, signal)
    if (!video.publicLink) {
      // Sem link público ainda: devolve só o vídeo, sem comentários.
      return {
        video,
        comments: [],
        ratings: [],
        ratingQuestions: [],
        overallRating: null,
        projectName: null,
        branding: null,
        queue: [],
        clientPhotoUrl: null,
        clientDescription: null,
      }
    }
    const pub = await publicService.getByLink(video.publicLink, signal)
    // Mantém o vídeo autenticado (mais completo) por cima do público.
    return { ...pub, video }
  },

  /** Resposta da agência publicada no canal do cliente. */
  async reply(
    videoId: string,
    input: { text: string; timestamp: number },
  ): Promise<Comment> {
    if (isDemo())
      return delay(
        {
          id: cryptoId(),
          author: demoMe().name,
          timestamp: input.timestamp,
          text: input.text,
          audioUrl: null,
          createdAt: new Date().toISOString(),
          authorRole: 'agency',
          parentId: null,
        },
        250,
      )
    const res = await api.post<Raw>(`/videos/${videoId}/comments/client-reply`, {
      timestampVideo: input.timestamp,
      texto: input.text,
    })
    return mapComment(res)
  },

  /** Remove um comentário do cliente do canal (ação do owner). */
  async remove(videoId: string, commentId: string): Promise<void> {
    if (isDemo()) return void (await delay(null, 200))
    await api.delete(`/videos/${videoId}/comments/${commentId}`)
  },

  /**
   * Move um comentário do cliente para a discussão interna do mesmo vídeo
   * (`targetVideoId` normalmente é o próprio `videoId`), onde passa a
   * aparecer na revisão interna. O comentário original some do canal do
   * cliente.
   */
  async moveToInternal(
    videoId: string,
    comment: Comment,
    targetVideoId: string,
  ): Promise<Comment> {
    if (isDemo())
      return delay(
        { ...comment, id: cryptoId(), createdAt: new Date().toISOString(), parentId: null },
        300,
      )
    const res = await api.post<Raw>(`/videos/${videoId}/comments/${comment.id}/move`, {
      videoDestinoId: targetVideoId,
    })
    return mapComment(res)
  },
}

/* ------------------------------ dashboard -------------------------------- */

export const dashboardService = {
  async insights(signal?: AbortSignal): Promise<DashboardInsights> {
    if (isDemo()) return delay(demoInsights())
    const res = await api.get<Raw>('/dashboard/insights', {
      query: { horas_pendentes: 48 },
      signal,
    })
    const fastRaw = pick<Raw | null>(res, ['clienteAprovacaoMaisRapida'], null)
    return {
      pendingOver48h: Number(pick(res, ['videosPendentesAtrasados'], 0)) || 0,
      fastestClient: fastRaw
        ? {
            name: pick(fastRaw, ['nome'], ''),
            avgHours: Number(pick(fastRaw, ['tempoMedioHoras'], 0)) || 0,
          }
        : null,
      approvedThisMonth: Number(pick(res, ['videosAprovadosNoMes'], 0)) || 0,
    }
  },
}

/* --------------------------- notificações --------------------------------- */

export const notificationService = {
  /** `unreadOnly` mapeia pro query param `naoLidas` — sem ele, o backend traz lidas + não lidas. */
  async list(unreadOnly?: boolean, signal?: AbortSignal): Promise<AppNotification[]> {
    if (isDemo())
      return delay(unreadOnly ? demoNotifications.filter((n) => !n.read) : demoNotifications)
    const res = await api.get('/notifications', {
      query: { naoLidas: unreadOnly || undefined },
      signal,
    })
    return asArray(res).map(mapNotification)
  },
  /**
   * Hoje o backend devolve o número cru (não `{ count }}`) — aceita os dois
   * formatos pra não quebrar se isso for ajustado depois.
   */
  async unreadCount(signal?: AbortSignal): Promise<number> {
    if (isDemo()) return delay(demoNotifications.filter((n) => !n.read).length)
    const res = await api.get<unknown>('/notifications/unread-count', { signal })
    if (typeof res === 'number') return res
    return Number(pick(res as Raw, ['count'], 0)) || 0
  },
  async markRead(id: string): Promise<void> {
    if (isDemo()) {
      const found = demoNotifications.find((n) => n.id === id)
      if (found) found.read = true
      return
    }
    await api.patch(`/notifications/${id}/read`)
  },
  async markAllRead(): Promise<void> {
    if (isDemo()) {
      demoNotifications.forEach((n) => (n.read = true))
      return
    }
    await api.patch('/notifications/read-all')
  },
}

/* ----------------------------- user / branding --------------------------- */

export const userService = {
  /**
   * Atualiza o perfil pessoal do usuário logado (nome, e-mail, foto).
   * `PATCH /users/me` ainda não existe no backend documentado em API.md —
   * precisa ser adicionado lá (aceitando `{ nome?, email?, fotoUrl? }` e
   * devolvendo o `User` atualizado) antes disso funcionar fora do demo.
   */
  async updateProfile(input: {
    name?: string
    email?: string
    photoUrl?: string | null
  }): Promise<User> {
    if (isDemo()) {
      const current = demoMe()
      return {
        ...current,
        name: input.name ?? current.name,
        email: input.email ?? current.email,
        photoUrl: input.photoUrl !== undefined ? input.photoUrl : current.photoUrl,
      }
    }
    const res = await api.patch<Raw>('/users/me', {
      nome: input.name,
      email: input.email,
      fotoUrl: input.photoUrl,
    })
    return mapUser(res)
  },

  /**
   * Presigned URL para subir a foto de perfil (avatar) ao R2. Mesmo fluxo de
   * 3 passos do logo da agência, mas para o próprio usuário — endpoint
   * ainda não existe no backend documentado em API.md, precisa ser
   * adicionado lá (`POST /users/me/photo-upload-url`) antes disso funcionar
   * fora do demo.
   */
  async getProfileUploadUrl(input: {
    fileName: string
    contentType: string
  }): Promise<{ uploadUrl: string; key: string; publicUrl: string | null; headers?: Record<string, string> }> {
    const res = await api.post<Raw>('/users/me/photo-upload-url', {
      nomeArquivo: input.fileName,
      contentType: input.contentType,
    })
    return {
      uploadUrl: pick(res, ['uploadUrl'], ''),
      key: pick(res, ['key'], ''),
      publicUrl: pick<string | null>(res, ['publicUrl'], null),
      headers: pick<Record<string, string> | undefined>(res, ['headers'], undefined),
    }
  },

  /**
   * Passo 1: presigned URL para subir o logo da agência ao R2.
   * Path e body seguem `POST /users/me/branding/logo-upload-url`.
   */
  async getBrandingUploadUrl(input: {
    fileName: string
    contentType: string
  }): Promise<{ uploadUrl: string; key: string; publicUrl: string | null; headers?: Record<string, string> }> {
    const res = await api.post<Raw>('/users/me/branding/logo-upload-url', {
      nomeArquivo: input.fileName,
      contentType: input.contentType,
    })
    return {
      uploadUrl: pick(res, ['uploadUrl'], ''),
      key: pick(res, ['key'], ''),
      publicUrl: pick<string | null>(res, ['publicUrl'], null),
      headers: pick<Record<string, string> | undefined>(res, ['headers'], undefined),
    }
  },

  /**
   * Passo 2: salva o branding. O DTO real aceita `{ logoUrl?, corDestaque?, nome? }`
   * — `nome` aqui atualiza o nome de exibição da agência (`nomeAgencia`), não o
   * nome da pessoa dona da conta.
   */
  async updateBranding(input: {
    logoUrl?: string | null
    agencyName?: string | null
    accentColor?: string | null
  }): Promise<Branding> {
    if (isDemo())
      return {
        logoUrl: input.logoUrl ?? null,
        agencyName: input.agencyName ?? null,
        accentColor: input.accentColor ?? null,
      }
    const res = await api.patch<Raw>('/users/me/branding', {
      logoUrl: input.logoUrl,
      nome: input.agencyName,
      corDestaque: input.accentColor,
    })
    return (
      mapBranding(res) ?? {
        logoUrl: input.logoUrl ?? null,
        agencyName: input.agencyName ?? null,
        accentColor: input.accentColor ?? null,
      }
    )
  },
}

/* ------------------------------- sessões ----------------------------------- */

/** Sessões ativas (dispositivos logados) da própria conta. */
export const sessionService = {
  async list(signal?: AbortSignal): Promise<Session[]> {
    if (isDemo()) return delay(demoSessions())
    const res = await api.get('/account/sessions', { signal })
    return asArray(res).map(mapSession)
  },

  /** Encerra uma sessão específica (ex.: notebook perdido de um colaborador). */
  async revoke(id: string): Promise<void> {
    if (isDemo()) return void (await delay(null, 300))
    await api.delete(`/account/sessions/${id}`)
  },

  /** Encerra todas as sessões da conta, exceto a que fez a própria requisição. */
  async revokeAllOthers(): Promise<void> {
    if (isDemo()) return void (await delay(null, 400))
    await api.delete('/account/sessions')
  },
}

/* ------------------------------- relatório ------------------------------- */

export const reportService = {
  /** Relatório do projeto em PDF — o backend devolve o binário direto (não JSON). */
  async getProjectReport(
    projectId: string,
  ): Promise<{ url: string; filename: string }> {
    const filename = `relatorio-${projectId}.pdf`
    if (isDemo()) {
      await delay(null, 500)
      return { url: buildDemoReport(projectId), filename: `relatorio-${projectId}.txt` }
    }
    const token = getToken()
    let res: Response
    try {
      res = await fetch(`${API_URL}/api/projects/${projectId}/report`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
    } catch {
      throw new ApiError('Não foi possível conectar ao servidor.', 0)
    }
    if (!res.ok) throw new ApiError('Não foi possível gerar o relatório.', res.status)
    const blob = await res.blob()
    return { url: URL.createObjectURL(blob), filename }
  },
}

/* --------------------------- dados de exemplo ---------------------------- */

export const sampleDataService = {
  /**
   * Remove o cliente/projeto/vídeos de exemplo (isExemplo). Não existe um
   * endpoint dedicado — reaproveita `DELETE /clients/:id`, que já apaga em
   * cascata os projetos e vídeos do cliente de exemplo.
   */
  async remove(): Promise<void> {
    if (isDemo()) return void (await delay(null, 400))
    const clients = await clientService.list()
    const examples = clients.filter((c) => c.isExample)
    await Promise.all(examples.map((c) => clientService.remove(c.id)))
    invalidateAllVideosCache()
  },
}

/* -------------------------------- admin ---------------------------------- */

export const adminService = {
  async users(signal?: AbortSignal): Promise<AdminUser[]> {
    if (isDemo()) return delay(demoAdminUsers)
    const res = await api.get('/admin/users', { signal })
    return asArray(res).map(mapAdminUser)
  },
  async metrics(signal?: AbortSignal): Promise<AdminMetrics> {
    if (isDemo()) return delay(demoMetrics)
    const res = await api.get<Raw>('/admin/metrics', { signal })
    const usersRaw = pick<Raw>(res, ['users'], {})
    const videosRaw = pick<Raw>(res, ['videos'], {})
    const porStatusRaw = pick<Raw>(videosRaw, ['porStatus'], {})
    return {
      totalUsers: Number(pick(usersRaw, ['total'], 0)) || 0,
      totalVideos: Number(pick(videosRaw, ['total'], 0)) || 0,
      pendingVideos: Number(pick(porStatusRaw, ['pendente'], 0)) || 0,
      approvedVideos: Number(pick(porStatusRaw, ['aprovado'], 0)) || 0,
    }
  },
  async updateUserStatus(id: string, status: UserStatus): Promise<AdminUser> {
    if (isDemo()) {
      const found = demoAdminUsers.find((u) => u.id === id)
      return delay({ ...(found ?? demoAdminUsers[0]), id, status }, 300)
    }
    const res = await api.patch<Raw>(`/admin/users/${id}/status`, {
      status: status === 'suspended' ? 'suspenso' : 'ativo',
    })
    return mapAdminUser(res)
  },
  /**
   * Único jeito hoje de ativar um plano pago (não existe checkout). O
   * formato de resposta ainda não está documentado, então a tela admin
   * atualiza a linha localmente após o PATCH resolver, em vez de depender
   * do corpo devolvido.
   */
  async updatePlan(accountId: string, plan: PlanId): Promise<void> {
    if (isDemo()) return void (await delay(null, 300))
    await api.patch(`/admin/accounts/${accountId}/plan`, { plan })
  },
}

/* -------------------------------- planos ---------------------------------- */

function mapPlanStatus(raw: Raw): PlanStatus {
  const limitsRaw = pick<Raw>(raw, ['limits', 'limites'], {})
  const usageRaw = pick<Raw>(raw, ['usage', 'uso'], {})
  return {
    plan: (pick(raw, ['plan', 'plano'], 'free') as PlanId) ?? 'free',
    limits: {
      maxClients: pick<number | null>(limitsRaw, ['maxClients'], null),
      maxVideosPerMonth: pick<number | null>(limitsRaw, ['maxVideosPerMonth'], null),
      maxRatingQuestions: pick<number | null>(limitsRaw, ['maxRatingQuestions'], null),
      maxExtraEditors: pick<number | null>(limitsRaw, ['maxExtraEditors'], null),
      whiteLabel: Boolean(pick(limitsRaw, ['whiteLabel'], false)),
      pdfReports: Boolean(pick(limitsRaw, ['pdfReports'], false)),
      priorityQueue: Boolean(pick(limitsRaw, ['priorityQueue'], false)),
      teamPerformance: Boolean(pick(limitsRaw, ['teamPerformance'], false)),
      storageGb: pick<number | null>(limitsRaw, ['storageGb'], null),
    },
    usage: {
      clients: Number(pick(usageRaw, ['clients'], 0)) || 0,
      extraEditors: Number(pick(usageRaw, ['extraEditors'], 0)) || 0,
      videosThisMonth: Number(pick(usageRaw, ['videosThisMonth'], 0)) || 0,
      ratingQuestions: Number(pick(usageRaw, ['ratingQuestions'], 0)) || 0,
    },
  }
}

export const planService = {
  async me(signal?: AbortSignal): Promise<PlanStatus> {
    if (isDemo()) return delay(demoPlanStatus())
    const res = await api.get<Raw>('/plans/me', { signal })
    return mapPlanStatus(res)
  },
}

/* -------------------------------- cobrança -------------------------------- */

export const billingService = {
  /**
   * Inicia o checkout recorrente na Mercado Pago. A resposta é a URL da
   * própria tela hospedada da Mercado Pago — o front deve navegar o
   * navegador inteiro pra lá (`window.location.href`), não abrir como
   * modal/iframe.
   */
  async checkout(plan: PlanId, cycle: BillingCycle): Promise<{ url: string }> {
    if (isDemo()) {
      // Sem gateway de verdade no demo: simula sucesso imediato navegando
      // direto pra tela de retorno, e já troca o plano localmente.
      demoSetPlan(plan)
      return delay({ url: '/configuracoes/plano?status=sucesso' }, 400)
    }
    const res = await api.post<Raw>('/billing/checkout', { plan, cycle })
    return { url: pick(res, ['url'], '') }
  },

  /** Cancela a assinatura na hora, sem período de graça. */
  async cancel(): Promise<{ plan: PlanId }> {
    if (isDemo()) {
      demoSetPlan('free')
      return delay({ plan: 'free' }, 300)
    }
    const res = await api.post<Raw>('/billing/cancel')
    return { plan: (pick(res, ['plan'], 'free') as PlanId) ?? 'free' }
  },
}

/* -------------------------------- equipe --------------------------------- */

export const teamService = {
  /** Membros da conta/agência. */
  async members(signal?: AbortSignal): Promise<TeamMember[]> {
    if (isDemo()) return delay(demoTeamMembers())
    const res = await api.get('/account/members', { signal })
    return asArray(res).map(mapTeamMember)
  },

  /**
   * Convida um novo editor por e-mail — expira em 3 dias (`expiresAt` no
   * retorno). A resposta traz `inviteUrl`, que o owner pode repassar
   * manualmente, além de disparar o envio real via `sendInviteEmail`. Se já
   * existir um convite anterior para esse e-mail mas ele tiver expirado, o
   * backend cancela o antigo e cria este automaticamente (sem 409) — o 409
   * só ocorre para usuário ativo ou convite ainda válido.
   */
  async invite(email: string): Promise<TeamMember & { inviteUrl?: string | null }> {
    if (isDemo()) {
      const token = `demo-${Date.now()}`
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      return delay(
        {
          id: `invite-${Date.now()}`,
          name: '',
          email,
          teamRole: 'editor',
          status: 'invited',
          createdAt: new Date().toISOString(),
          expiresAt: null,
          inviteUrl: `${origin}/convite/${token}`,
        },
        400,
      )
    }
    const res = await api.post<Raw>('/account/invite', { email })
    const inviteUrl = pick<string | null>(res, ['inviteUrl'], null)
    return {
      ...mapTeamMember({ email, status: 'invited', teamRole: 'editor', ...(res ?? {}) }),
      inviteUrl,
    }
  },

  /** Suspende ou reativa um membro. */
  async updateStatus(id: string, status: MemberStatus): Promise<TeamMember> {
    if (isDemo()) {
      const found = demoTeamMembers().find((m) => m.id === id)
      return delay({ ...(found ?? demoTeamMembers()[0]), id, status }, 300)
    }
    const res = await api.patch<Raw>(`/account/members/${id}/status`, {
      status: toBackendMemberStatus(status),
    })
    return mapTeamMember(res)
  },

  /** Cancela/exclui um convite pendente (membro ainda com status "invited"). */
  async cancelInvite(id: string): Promise<void> {
    if (isDemo()) {
      await delay(null, 300)
      return
    }
    await api.delete(`/account/invite/${id}`)
  },

  /**
   * Reenvia o e-mail do convite (mesmo `inviteUrl`) e renova `expiresAt`
   * para +3 dias a partir de agora — funciona mesmo se o convite já tinha
   * expirado, então o retorno atualizado substitui a linha expirada no
   * lugar em vez de criar uma nova (ver uso em `components/team-view.tsx`).
   */
  async sendInviteEmail(id: string): Promise<TeamMember> {
    if (isDemo()) {
      const found = demoTeamMembers().find((m) => m.id === id)
      return delay(
        { ...(found ?? demoTeamMembers()[0]), id, expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
        500,
      )
    }
    const res = await api.post<Raw>(`/account/invite/${id}/send-email`)
    return mapTeamMember(res)
  },

  /**
   * Promove um editor ativo a owner. `PATCH /account/members/:id/role`
   * ainda não existe no backend documentado em API.md — precisa ser
   * adicionado lá antes disso funcionar fora do demo.
   */
  async promoteToOwner(id: string): Promise<TeamMember> {
    if (isDemo()) {
      const found = demoTeamMembers().find((m) => m.id === id)
      return delay({ ...(found ?? demoTeamMembers()[0]), id, teamRole: 'owner' }, 300)
    }
    const res = await api.patch<Raw>(`/account/members/${id}/role`, { teamRole: 'owner' })
    return mapTeamMember(res)
  },

  /**
   * Sessões ativas de UM MEMBRO da equipe, na visão do owner (ex.: derrubar o
   * notebook de um editor que saiu, sem precisar suspender a conta inteira).
   */
  async memberSessions(memberId: string, signal?: AbortSignal): Promise<Session[]> {
    if (isDemo()) return delay(demoMemberSessions(memberId))
    const res = await api.get(`/account/members/${memberId}/sessions`, { signal })
    return asArray(res).map(mapSession)
  },

  async revokeMemberSession(memberId: string, sessionId: string): Promise<void> {
    if (isDemo()) return void (await delay(null, 300))
    await api.delete(`/account/members/${memberId}/sessions/${sessionId}`)
  },

  async revokeAllMemberSessions(memberId: string): Promise<void> {
    if (isDemo()) return void (await delay(null, 400))
    await api.delete(`/account/members/${memberId}/sessions`)
  },
}

/* ---------------------- perguntas de avaliação (owner) -------------------- */

export const ratingQuestionService = {
  /** Perguntas de avaliação da conta, ordenadas para exibição (inclui inativas). */
  async list(signal?: AbortSignal): Promise<RatingQuestion[]> {
    if (isDemo()) return delay(demoRatingQuestions())
    const res = await api.get('/rating-questions', { signal })
    return asArray(res)
      .map(mapRatingQuestion)
      .sort((a, b) => a.order - b.order)
  },

  async create(text: string): Promise<RatingQuestion> {
    if (isDemo()) return delay({ id: `q-${Date.now()}`, text, order: 999, active: true }, 300)
    const res = await api.post<Raw>('/rating-questions', { texto: text })
    return mapRatingQuestion(res)
  },

  async update(
    id: string,
    input: { text?: string; order?: number; active?: boolean },
  ): Promise<RatingQuestion> {
    if (isDemo()) {
      const found = demoRatingQuestions().find((q) => q.id === id)
      return delay({ ...(found ?? demoRatingQuestions()[0]), id, ...input }, 250)
    }
    const res = await api.patch<Raw>(`/rating-questions/${id}`, {
      texto: input.text,
      ordem: input.order,
      ativo: input.active,
    })
    return mapRatingQuestion(res)
  },

  async remove(id: string): Promise<void> {
    if (isDemo()) return void (await delay(null, 250))
    await api.delete(`/rating-questions/${id}`)
  },
}

/* ------------------------- desempenho da equipe --------------------------- */

export const teamPerformanceService = {
  async list(signal?: AbortSignal): Promise<EditorPerformance[]> {
    if (isDemo()) return delay(demoTeamPerformance())
    const res = await api.get('/team/performance', { signal })
    return asArray(res).map(mapEditorPerformance)
  },
}

/* ------------------------------ calendário -------------------------------- */

function mapCrewMember(raw: Raw): CrewMember {
  return {
    id: pick(raw, ['id', '_id'], ''),
    name: pick(raw, ['name', 'nome'], ''),
  }
}

function mapRecordingEvent(raw: Raw): RecordingEvent {
  const crewRaw = pick<Raw[]>(raw, ['crew', 'equipe'], [])
  return {
    id: pick(raw, ['id', '_id'], ''),
    title: pick(raw, ['title', 'titulo'], ''),
    startAt: pick(raw, ['startAt', 'inicio', 'dataInicio', 'start_at'], ''),
    endAt: pick<string | null>(raw, ['endAt', 'fim', 'dataFim', 'end_at'], null),
    clientId: pick<string | null>(raw, ['clientId', 'clienteId', 'client_id'], null),
    clientName: pick<string | null>(raw, ['clientName', 'clienteNome', 'client_name'], null),
    crew: Array.isArray(crewRaw) ? crewRaw.map(mapCrewMember) : [],
    notes: pick<string | null>(raw, ['notes', 'notas', 'observacoes'], null),
  }
}

/**
 * Escala de gravação da agência (aba Calendário). Endpoints `/recording-events`
 * ainda não existem no backend documentado em API.md — precisam ser
 * adicionados lá (aceitando/devolvendo os campos mapeados acima) antes disso
 * funcionar fora do demo.
 */
export const calendarService = {
  async list(signal?: AbortSignal): Promise<RecordingEvent[]> {
    if (isDemo()) return delay(demoRecordingEvents)
    const res = await api.get('/recording-events', { signal })
    return asArray(res).map(mapRecordingEvent)
  },

  async create(input: {
    title: string
    startAt: string
    endAt?: string | null
    clientId?: string | null
    clientName?: string | null
    crew?: CrewMember[]
    notes?: string | null
  }): Promise<RecordingEvent> {
    if (isDemo()) {
      const created: RecordingEvent = {
        id: `ev-${Date.now()}`,
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        clientId: input.clientId ?? null,
        clientName: input.clientName ?? null,
        crew: input.crew ?? [],
        notes: input.notes ?? null,
      }
      demoRecordingEvents.push(created)
      return delay(created, 300)
    }
    const res = await api.post<Raw>('/recording-events', {
      titulo: input.title,
      dataInicio: input.startAt,
      dataFim: input.endAt,
      clienteId: input.clientId,
      equipeIds: input.crew?.map((c) => c.id),
      observacoes: input.notes,
    })
    return mapRecordingEvent(res)
  },

  async update(
    id: string,
    input: Partial<{
      title: string
      startAt: string
      endAt: string | null
      clientId: string | null
      clientName: string | null
      crew: CrewMember[]
      notes: string | null
    }>,
  ): Promise<RecordingEvent> {
    if (isDemo()) {
      const found = demoRecordingEvents.find((e) => e.id === id)
      if (!found) throw new ApiError('Evento não encontrado.', 404)
      Object.assign(found, input)
      return delay(found, 300)
    }
    const res = await api.patch<Raw>(`/recording-events/${id}`, {
      titulo: input.title,
      dataInicio: input.startAt,
      dataFim: input.endAt,
      clienteId: input.clientId,
      equipeIds: input.crew?.map((c) => c.id),
      observacoes: input.notes,
    })
    return mapRecordingEvent(res)
  },

  async remove(id: string): Promise<void> {
    if (isDemo()) {
      const idx = demoRecordingEvents.findIndex((e) => e.id === id)
      if (idx >= 0) demoRecordingEvents.splice(idx, 1)
      await delay(null, 200)
      return
    }
    await api.delete(`/recording-events/${id}`)
  },
}

/**
 * Roster de equipe de gravação — nomes livres (freelancers, motorista, etc.)
 * sem precisar de conta/convite no Aprova. Endpoint `/crew` ainda não existe
 * no backend documentado em API.md, mesma situação de `/recording-events`.
 */
export const crewService = {
  async list(signal?: AbortSignal): Promise<CrewMember[]> {
    if (isDemo()) return delay(demoCrewRoster)
    const res = await api.get('/crew', { signal })
    return asArray(res).map(mapCrewMember)
  },

  async create(name: string): Promise<CrewMember> {
    if (isDemo()) {
      const created: CrewMember = {
        id: `crew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
      }
      demoCrewRoster.push(created)
      return delay(created, 200)
    }
    const res = await api.post<Raw>('/crew', { nome: name })
    return mapCrewMember(res)
  },
}

/* ------------------------------- convites -------------------------------- */

export const inviteService = {
  /** Aceita um convite: cria a conta do editor (nome + senha). */
  async accept(
    token: string,
    input: { name: string; password: string },
  ): Promise<void> {
    if (isDemo()) {
      await delay(null, 400)
      return
    }
    await api.post(
      `/account/invite/${encodeURIComponent(token)}/accept`,
      { nome: input.name, senha: input.password },
      { auth: false },
    )
  },
}
