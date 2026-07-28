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
  demoClientChannel,
  demoClients,
  demoInsights,
  demoInternalComments,
  demoMe,
  demoMetrics,
  demoNotifications,
  demoProjectGallery,
  demoProjects,
  demoPublicVideo,
  demoRatingQuestions,
  demoTeamMembers,
  demoTeamPerformance,
  demoVideos,
  demoVideosForProject,
  isDemo,
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
  DashboardInsights,
  EditorPerformance,
  GalleryVideoItem,
  MemberStatus,
  NotificationType,
  PerformanceTier,
  Project,
  ProjectGallery,
  PublicVideo,
  QueueVideoItem,
  Rating,
  RatingQuestion,
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

function mapProject(raw: Raw): Project {
  const clientRaw = pick<Raw | null>(raw, ['client'], null)
  return {
    id: String(pick(raw, ['id', '_id', 'projectId'], '')),
    name: pick(raw, ['nome', 'name', 'title'], ''),
    clientId: String(pick(raw, ['clientId', 'client_id'], clientRaw?.id ?? '')),
    client: clientRaw ? mapClient(clientRaw) : undefined,
    isExample: Boolean(pick(raw, ['isExemplo', 'is_exemplo', 'isExample'], false)),
    publicLink: pick<string | null>(raw, ['linkPublico', 'link_publico', 'publicLink'], null),
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
  if (!logoUrl && !agencyName) return null
  return { logoUrl, agencyName }
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
  const originalUrl = pick<string | null>(raw, ['urlStorage', 'url_storage'], null)
  return {
    id: String(pick(raw, ['id', '_id', 'videoId'], '')),
    title: pick(raw, ['nomeArquivo', 'nome_arquivo', 'title', 'name'], 'Sem título'),
    type: pick(raw, ['type', 'format', 'tipo'], 'Vídeo'),
    status: normalizeStatus(pick(raw, ['status'], 'pendente')),
    duration: Number(pick(raw, ['duration', 'duracao', 'durationSeconds'], 0)) || 0,
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
  }
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
  return {
    link: String(pick(raw, ['link', 'publicLink', 'public_link', 'slug'], '')),
    title: pick(raw, ['title', 'name', 'titulo'], 'Sem título'),
    posterUrl: pick<string | null>(raw, ['posterUrl', 'poster', 'thumbnailUrl', 'thumbnail'], null),
    status: normalizeStatus(pick(raw, ['status'], 'pendente')),
    processingStatus: normalizeProcessing(
      pick(raw, ['statusProcessamento', 'status_processamento'], 'pronto'),
    ),
    version: Number(pick(raw, ['versao', 'version'], 1)) || 1,
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
  }
}

function normalizeNotificationType(raw: unknown): NotificationType {
  const s = String(raw ?? '')
  if (
    s === 'comentario_cliente' ||
    s === 'aprovacao_cliente' ||
    s === 'ajuste_solicitado' ||
    s === 'avaliacao_cliente'
  )
    return s
  return 'comentario_cliente'
}

function mapNotification(raw: Raw): AppNotification {
  const videoRaw = pick<Raw | null>(raw, ['video'], null)
  const projectRaw = pick<Raw | null>(videoRaw, ['project', 'projeto'], null)
  const clientRaw = pick<Raw | null>(projectRaw, ['client', 'cliente'], null)
  return {
    id: String(pick(raw, ['id', '_id'], cryptoId())),
    type: normalizeNotificationType(pick(raw, ['type', 'tipo'], null)),
    read: Boolean(pick(raw, ['lida', 'read'], false)),
    createdAt: pick<string | null>(raw, ['criadoEm', 'criado_em', 'createdAt'], null),
    video: {
      id: String(pick(videoRaw, ['id', '_id'], '')),
      title: pick(videoRaw, ['nomeArquivo', 'nome_arquivo', 'title'], 'Vídeo'),
      posterUrl: pick<string | null>(videoRaw, ['thumbnailUrl', 'thumbnail_url', 'posterUrl'], null),
      publicLink: pick<string | null>(videoRaw, ['linkPublico', 'link_publico', 'publicLink'], null),
      projectName: pick(projectRaw, ['nome', 'name'], ''),
      clientName: pick(clientRaw, ['nome', 'name'], ''),
    },
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

/** Busca os vídeos de um projeto já resolvido, herdando o nome do cliente (não vem no item). */
async function fetchProjectVideos(project: Project, signal?: AbortSignal): Promise<Video[]> {
  const res = await api.get('/videos', { query: { project_id: project.id }, signal })
  return asArray(res).map((v) => mapVideo(v, { clientName: project.client?.name ?? null }))
}

export const videoService = {
  /**
   * Sem `projectId`: agrega os vídeos de TODOS os projetos da conta (o
   * backend só lista por projeto — `GET /videos?project_id=`), usado pelo
   * dashboard. Com `projectId`: lista só os daquele projeto.
   */
  async list(projectId?: string, signal?: AbortSignal): Promise<Video[]> {
    if (isDemo()) return delay(projectId ? demoVideosForProject(projectId) : demoVideos)
    if (projectId) {
      const project = await projectService.get(projectId, signal)
      return fetchProjectVideos(project, signal)
    }
    const projects = await projectService.list(undefined, signal)
    const perProject = await Promise.all(projects.map((p) => fetchProjectVideos(p, signal)))
    return perProject.flat().sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  },

  /** Não existe `GET /videos/:id` no backend — resolve buscando entre todos os projetos. */
  async get(id: string, signal?: AbortSignal): Promise<Video> {
    if (isDemo()) return delay(demoVideos.find((v) => v.id === id) ?? demoVideos[0])
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
    duration?: number
  }): Promise<Video> {
    const res = await api.post<Raw>('/videos', {
      projectId: input.projectId,
      urlStorage: input.urlStorage,
      nomeArquivo: input.nomeArquivo,
      versao: input.versao,
      duration: input.duration,
    })
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
    return mapVideo(res)
  },

  /** Define o editor responsável pelo vídeo (só o owner deve chamar). */
  async assignEditor(id: string, editorId: string | null): Promise<Video> {
    if (isDemo()) {
      const found = demoVideos.find((v) => v.id === id)
      return delay({ ...(found ?? demoVideos[0]), id, editorId }, 300)
    }
    const res = await api.patch<Raw>(`/videos/${id}/editor-responsavel`, { editorId })
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
    input: { text: string; timestamp: number; author?: string },
  ): Promise<Comment> {
    if (isDemoVideoLink(link))
      return delay(
        {
          id: cryptoId(),
          author: input.author || 'Você',
          timestamp: input.timestamp,
          text: input.text,
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
      },
      { auth: false },
    )
    return mapComment(res)
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
      videos: asArray(pick(res, ['videos'], []))
        .map(mapGalleryVideoItem)
        .filter((v) => v.link),
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
   * Move um comentário do cliente para a discussão interna de outro vídeo
   * (tipicamente o vídeo do editor responsável), onde passa a aparecer na
   * revisão interna. O comentário original some do canal do cliente.
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
  }): Promise<Branding> {
    if (isDemo())
      return { logoUrl: input.logoUrl ?? null, agencyName: input.agencyName ?? null }
    const res = await api.patch<Raw>('/users/me/branding', {
      logoUrl: input.logoUrl,
      nome: input.agencyName,
    })
    return (
      mapBranding(res) ?? {
        logoUrl: input.logoUrl ?? null,
        agencyName: input.agencyName ?? null,
      }
    )
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
   * Convida um novo editor por e-mail. O envio de e-mail é simulado pelo
   * backend — a resposta traz `inviteUrl`, que o owner precisa repassar
   * manualmente (ver `TeamMember.inviteUrl` no retorno).
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

  /**
   * Cancela/exclui um convite pendente (membro ainda com status "invited").
   * `DELETE /account/invite/:id` ainda não existe no backend documentado em
   * API.md — precisa ser adicionado lá antes disso funcionar fora do demo.
   */
  async cancelInvite(id: string): Promise<void> {
    if (isDemo()) {
      await delay(null, 300)
      return
    }
    await api.delete(`/account/invite/${id}`)
  },

  /**
   * Dispara o envio real (via provedor transacional) do e-mail de convite
   * para o editor. `POST /account/invite/:id/send-email` ainda não existe
   * no backend documentado em API.md — precisa ser adicionado lá antes
   * disso funcionar fora do demo.
   */
  async sendInviteEmail(id: string): Promise<void> {
    if (isDemo()) {
      await delay(null, 500)
      return
    }
    await api.post(`/account/invite/${id}/send-email`)
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
