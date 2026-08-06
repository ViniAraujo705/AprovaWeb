/**
 * Tipos de domínio usados pelo frontend.
 *
 * As respostas cruas da API são normalizadas para estes shapes em
 * `lib/services.ts`, então os componentes trabalham sempre com um formato
 * estável mesmo que os nomes dos campos do backend variem levemente.
 */

export type Role = 'admin' | 'user'

/**
 * Papel do usuário DENTRO da conta/agência (eixo diferente de `Role`, que é o
 * papel de sistema). O dono da conta é `owner`; editores são convidados.
 * Usado para liberar/esconder gestão de equipe, canal do cliente e branding.
 */
export type TeamRole = 'owner' | 'editor'

export const teamRoleLabel: Record<TeamRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Papel na conta/agência (owner/editor). Default: owner. */
  teamRole: TeamRole
  /** Foto de perfil do usuário (avatar), quando configurada. */
  photoUrl: string | null
  /** Marca própria da agência (logo/nome), quando configurada. */
  branding?: Branding | null
}

export interface AuthResponse {
  token: string
  user: User
}

// Status exibidos na UI (pt-BR). O backend pode devolver em inglês; ver
// `normalizeStatus` em services.ts.
export type VideoStatus = 'pendente' | 'aprovado' | 'ajuste' | 'erro'

export const statusLabel: Record<VideoStatus, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  ajuste: 'Ajuste',
  erro: 'Erro',
}

export interface Client {
  id: string
  name: string
  email: string
  /** Cliente de exemplo criado no onboarding (isExemplo). */
  isExample: boolean
  /** Legenda exibida no modo Reels da tela pública do cliente (bio estilo Instagram). */
  description: string | null
  /** Foto de perfil do cliente, exibida como avatar no modo Reels. */
  photoUrl: string | null
}

export interface Project {
  id: string
  name: string
  clientId: string
  client?: Client
  /** Projeto de exemplo criado no onboarding (is_exemplo). */
  isExample: boolean
  /** Link público (slug) da galeria do projeto, para a rota /g/:linkPublico. */
  publicLink: string | null
  /** Editores com acesso a este projeto. Só vem em `GET /projects/:id`. */
  members?: ProjectMember[]
}

/** Editor atribuído a um projeto (`GET /projects/:id`, `POST/DELETE /projects/:id/members/:memberId`). */
export interface ProjectMember {
  id: string
  userId: string
  name: string
  email: string
}

// Estado do processamento do vídeo otimizado no backend. Enquanto está
// "processando" a tela do cliente mostra a thumbnail com um indicador sutil.
export type VideoProcessingStatus = 'processando' | 'pronto'

export interface Video {
  id: string
  title: string
  type: string
  status: VideoStatus
  /** Duração em segundos (0 se desconhecida). */
  duration: number
  /** URL de reprodução (otimizada quando pronta, senão o arquivo original). */
  url: string | null
  /** URL do arquivo original enviado (urlStorage), para "baixar original". */
  originalUrl: string | null
  /** URL do poster/thumbnail. */
  posterUrl: string | null
  /** Link público (slug) para a rota /v/:link. */
  publicLink: string | null
  clientName: string
  projectId: string | null
  commentsCount: number
  /** Data/hora do comentário mais recente (para ordenar por atividade recente). Null sem comentários. */
  lastCommentAt: string | null
  createdAt: string | null
  /** Status do processamento do vídeo otimizado (status_processamento). */
  processingStatus: VideoProcessingStatus
  /** Vídeo pertencente ao projeto de exemplo do onboarding (is_exemplo). */
  isExample: boolean
  /**
   * Prazo de entrega definido pelo owner (ISO date), visível só para a equipe
   * da agência (owner/editor) — nunca exibido nas telas do cliente.
   */
  deadline: string | null
  /**
   * Id do editor responsável pelo vídeo (membro da equipe), definido pelo
   * owner. Alimenta o cálculo de desempenho do editor.
   */
  editorId: string | null
  /** Número da versão (versao). 1 para o upload original. */
  version: number
  /** Id do vídeo que esta versão substitui, se houver (videoPai.id). */
  videoPaiId: string | null
  /**
   * Computado no frontend (não vem da API): id da versão mais recente da
   * cadeia de versões deste vídeo. Igual ao próprio id quando já é a mais
   * recente. Backend não expõe relação pai→filho, só filho→pai, então isso
   * é resolvido percorrendo a lista completa — ver `resolveLatestVersions`
   * em lib/services.ts.
   */
  latestVersionId: string
}

/**
 * Quem escreveu um comentário.
 * - `client`: comentário do cliente no canal público.
 * - `owner`/`editor`: membros da agência (canal interno).
 * - `agency`: resposta da agência publicada no canal do cliente.
 */
export type CommentAuthorRole = 'client' | 'owner' | 'editor' | 'agency'

export interface Comment {
  id: string
  author: string
  /** Momento do vídeo, em segundos. */
  timestamp: number
  text: string
  /** URL do áudio gravado pelo cliente, quando o comentário foi falado em vez de escrito. */
  audioUrl: string | null
  createdAt: string | null
  /** Papel de quem escreveu (para badges e diferenciação visual). */
  authorRole: CommentAuthorRole | null
  /** Comentário-pai numa thread (parent_comment_id). null = comentário raiz. */
  parentId: string | null
}

/** Um comentário raiz com suas respostas (thread), para o canal interno. */
export interface CommentThread {
  comment: Comment
  replies: Comment[]
}

/** true para autores do lado da agência (owner/editor/agency). */
export function isAgencyAuthor(role: CommentAuthorRole | null): boolean {
  return role === 'owner' || role === 'editor' || role === 'agency'
}

export interface Rating {
  id: string
  /** Id da pergunta de avaliação correspondente (null em dados legados). */
  questionId: string | null
  /** Texto da categoria/pergunta no momento da nota (fallback de exibição). */
  category: string
  value: number
}

/** Pergunta de avaliação customizável por agência (GET/POST/PATCH/DELETE /rating-questions). */
export interface RatingQuestion {
  id: string
  text: string
  /** Posição na lista (menor = primeiro). */
  order: number
  active: boolean
}

/** Identidade visual da agência exibida na tela pública do cliente. */
export interface Branding {
  /** URL do logo enviado pela agência (null = usar logo padrão do sistema). */
  logoUrl: string | null
  /** Nome de exibição da agência (opcional, usado como alt/label). */
  agencyName: string | null
  /** Cor de destaque da agência em hex (ex: "#ff5a36"), null = cor padrão do sistema. */
  accentColor: string | null
}

export interface PublicVideo {
  video: Video
  comments: Comment[]
  ratings: Rating[]
  /** Perguntas de avaliação ativas da agência, na ordem de exibição. */
  ratingQuestions: RatingQuestion[]
  /** Nota geral já registrada (1-5), se o cliente já avaliou. */
  overallRating: number | null
  /** Nome do projeto (para título/Open Graph). */
  projectName: string | null
  /** Marca da agência dona do vídeo (logo no topo da tela pública). */
  branding: Branding | null
  /**
   * Todos os vídeos do mesmo cliente (o atual incluso), na ordem de exibição —
   * alimenta a navegação por swipe estilo Reels na aba "Preview Reels".
   * Vazio quando o cliente só tem este vídeo.
   */
  queue: QueueVideoItem[]
  /** Foto de perfil do cliente (configurada pelo owner), usada como avatar no modo Reels. */
  clientPhotoUrl: string | null
  /** Legenda do cliente (configurada pelo owner), exibida como legenda no modo Reels. */
  clientDescription: string | null
}

/** Item leve de um vídeo do cliente, usado só para montar a fila de swipe. */
export interface QueueVideoItem {
  link: string
  title: string
  posterUrl: string | null
  status: VideoStatus
}

/** Um vídeo listado na galeria pública do projeto (GET /public/projects/:linkPublico). */
export interface GalleryVideoItem {
  /** linkPublico do vídeo — usado para montar a URL do player (/v/:link). */
  link: string
  title: string
  posterUrl: string | null
  status: VideoStatus
  processingStatus: VideoProcessingStatus
  version: number
  createdAt: string | null
}

/** Galeria pública de um projeto: um link só para todos os vídeos da entrega. */
export interface ProjectGallery {
  projectName: string
  clientName: string
  branding: Branding | null
  videos: GalleryVideoItem[]
}

/** Cards de destaque do dashboard (GET /dashboard/insights). */
export interface DashboardInsights {
  /** Vídeos pendentes há mais de 48h. */
  pendingOver48h: number
  /** Cliente mais rápido para aprovar (menor tempo médio). */
  fastestClient: { name: string; avgHours: number } | null
  /** Total de vídeos aprovados no mês atual. */
  approvedThisMonth: number
}

export type UserStatus = 'active' | 'inactive' | 'suspended'

export interface AdminUser extends User {
  status: UserStatus
  createdAt: string | null
  /**
   * Plano da conta (só relevante para linhas `teamRole: 'owner'`). `GET
   * /admin/users` ainda não documenta esse campo — pode vir `undefined`, e a
   * tela admin trata a ausência como 'free'.
   */
  plan?: PlanId | null
}

export interface AdminMetrics {
  totalUsers: number
  totalVideos: number
  pendingVideos: number
  approvedVideos: number
}

/* --------------------------------- planos --------------------------------- */

export type PlanId = 'free' | 'pro' | 'agencia'

export const planLabel: Record<PlanId, string> = {
  free: 'Free',
  pro: 'Pro',
  agencia: 'Agência',
}

/** Ciclo de cobrança da assinatura (Mercado Pago). */
export type BillingCycle = 'MONTHLY' | 'ANNUALLY'

/** `null` em qualquer campo = ilimitado (Pro e Agência não têm teto nesses eixos). */
export interface PlanLimits {
  maxClients: number | null
  maxVideosPerMonth: number | null
  maxRatingQuestions: number | null
  maxExtraEditors: number | null
  whiteLabel: boolean
  pdfReports: boolean
  priorityQueue: boolean
  teamPerformance: boolean
  storageGb: number | null
}

export interface PlanUsage {
  clients: number
  extraEditors: number
  videosThisMonth: number
  ratingQuestions: number
}

export interface PlanStatus {
  plan: PlanId
  limits: PlanLimits
  usage: PlanUsage
}

/* ------------------------------- equipe ---------------------------------- */

export type MemberStatus = 'active' | 'invited' | 'suspended'

export const memberStatusLabel: Record<MemberStatus, string> = {
  active: 'Ativo',
  invited: 'Convite pendente',
  suspended: 'Suspenso',
}

/** Membro da conta/agência (GET /account/members). */
export interface TeamMember {
  id: string
  name: string
  email: string
  teamRole: TeamRole
  status: MemberStatus
  createdAt: string | null
  /**
   * Prazo para o convite ser aceito, se o backend enviar essa data (ainda
   * não documentado em API.md — hoje sempre `null`). Convite com `status
   * === 'invited'` e `expiresAt` no passado é tratado como expirado na UI.
   */
  expiresAt: string | null
}

/* ------------------------------- sessões ----------------------------------- */

/** Tipo de dispositivo (define o ícone exibido), inferido do user-agent no backend. */
export type SessionDeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown'

/** Uma sessão autenticada ativa da conta (GET /account/sessions). */
export interface Session {
  id: string
  /** Ex.: "Chrome · macOS". */
  device: string
  deviceType: SessionDeviceType
  /** Cidade/região aproximada por IP, quando o backend resolve geolocalização. */
  location: string | null
  ip: string | null
  createdAt: string | null
  lastActiveAt: string | null
  /** true só para a sessão do navegador que fez a própria requisição. */
  current: boolean
}

/* --------------------------- desempenho da equipe ------------------------- */

/** Faixa de desempenho do editor, conforme a nota média (0-10). */
export type PerformanceTier = 'verde' | 'amarelo' | 'laranja' | 'vermelho' | 'sem_dados'

/** Uma linha de GET /team/performance. */
export interface EditorPerformance {
  editorId: string
  name: string
  avatarUrl: string | null
  /** Nota média (0-10) dos vídeos aprovados; null quando "sem_dados". */
  averageScore: number | null
  approvedVideosCount: number
  tier: PerformanceTier
}

/* ---------------------------- notificações --------------------------------- */

export type NotificationType =
  | 'comentario_cliente'
  | 'aprovacao_cliente'
  | 'ajuste_solicitado'
  | 'avaliacao_cliente'
  | 'lembrete_gravacao'

/**
 * Notificação de ação do cliente num vídeo, ou lembrete de gravação próxima
 * (GET /notifications). Nomeado `AppNotification` (não `Notification`) pra
 * não colidir com a Notification API do browser.
 */
export interface AppNotification {
  id: string
  type: NotificationType
  read: boolean
  createdAt: string | null
  /** Presente pros tipos de ação do cliente num vídeo; `null` em `lembrete_gravacao`. */
  video: {
    id: string
    title: string
    posterUrl: string | null
    publicLink: string | null
    projectName: string
    clientName: string
  } | null
  /** Presente só em `lembrete_gravacao` — evento da escala (`/calendario`) que está próximo. */
  event: {
    id: string
    title: string
    startAt: string
    clientName: string | null
  } | null
}

/* ------------------------------ calendário ---------------------------------- */

/**
 * Pessoa da equipe de gravação — só um nome livre, sem conta/login no Aprova.
 * Reaproveitável entre eventos (roster salvo, não precisa digitar de novo).
 */
export interface CrewMember {
  id: string
  name: string
}

/** Escala de gravação da agência (aba Calendário). */
export interface RecordingEvent {
  id: string
  title: string
  /** Data e hora de início (ISO). */
  startAt: string
  /** Data e hora de término (ISO), opcional — mesmo dia do início. */
  endAt: string | null
  clientId: string | null
  /** Nome do cliente resolvido (pra exibir sem precisar de outra chamada). */
  clientName: string | null
  /** Quem vai gravar — pode incluir gente sem conta no Aprova. */
  crew: CrewMember[]
  notes: string | null
}
