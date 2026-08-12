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

/** Uma agência da qual o usuário logado é membro (owner ou editor). */
export interface AccountOption {
  accountId: string
  nomeAgencia: string
  role: TeamRole
  /** Só presente em `GET /auth/my-accounts`: marca a conta do token atual. */
  isCurrent?: boolean
}

/**
 * Resultado de login/cadastro social: sucesso direto (1 conta vinculada) ou
 * um passo intermediário de seleção quando o e-mail tem 2+ agências — ver
 * `authService.selectAccount` e a seção "Multi-conta" em API.md.
 */
export type LoginResult =
  | ({ requiresAccountSelection?: false } & AuthResponse)
  | {
      requiresAccountSelection: true
      pendingToken: string
      accounts: AccountOption[]
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

/**
 * Etapa de produção interna do vídeo (quadro Kanban do dashboard) — eixo
 * DIFERENTE de `VideoStatus`: `status` é a decisão do CLIENTE (aprovado/
 * ajuste/pendente) vinda do fluxo de aprovação público; `productionStage` é
 * o estágio interno da agência, que existe antes do vídeo ir pro cliente
 * (planejamento, gravação, edição) e depois da aprovação (entrega). O
 * backend sincroniza automaticamente `aguardando_aprovacao`→`aprovado`/
 * `ajustes` quando o cliente decide pelo link público; as demais etapas só
 * mudam manualmente, arrastando o card no board.
 */
export type ProductionStage =
  | 'planejado'
  | 'producao'
  | 'edicao'
  | 'aguardando_aprovacao'
  | 'ajustes'
  | 'aprovado'
  | 'entregue'

export const productionStageLabel: Record<ProductionStage, string> = {
  planejado: 'Planejado',
  producao: 'Em produção',
  edicao: 'Em edição',
  aguardando_aprovacao: 'Aguardando aprovação',
  ajustes: 'Ajustes',
  aprovado: 'Aprovado',
  entregue: 'Entregue',
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
  /**
   * Marca própria deste cliente (logo + cor), distinta da foto de perfil
   * acima (que é um avatar pro modo Reels, não uma logomarca). Quando
   * definida, sobrepõe a marca da agência nos links públicos que pertencem
   * a este cliente (galeria do projeto, e portfólio quando associado a ele) —
   * ver `resolveBranding` em `lib/services.ts`.
   */
  branding: Branding | null
  /**
   * Valores dos campos personalizados da conta, por id de
   * `ClientFieldDefinition` — só entra aqui o campo que tem valor
   * preenchido pra este cliente; um campo definido na conta mas nunca
   * preenchido pra um cliente específico simplesmente não aparece no mapa.
   */
  customFields: Record<string, string>
  /** Id do profissional da equipe responsável por este cliente (gerente de conta), definido pelo owner. */
  responsibleId: string | null
}

/**
 * Campo personalizado de cadastro de cliente, definido pela agência (owner)
 * em `/configuracoes/campos-cliente` — schema por conta, não por cliente.
 * Os valores em si ficam em `Client.customFields`, por id deste registro.
 */
export interface ClientFieldDefinition {
  id: string
  label: string
  order: number
}

export type ClientActivityType =
  | 'video_enviado'
  | 'aprovacao_cliente'
  | 'ajuste_solicitado'
  | 'comentario_cliente'
  | 'resposta_agencia'
  | 'nova_versao'
  | 'arquivo_enviado'
  | 'arquivo_removido'
  | 'nota_atualizada'

export type ClientActivityActorType = 'cliente' | 'owner' | 'editor' | 'sistema'

/**
 * Item da trilha de auditoria do cliente (`GET /clients/:id/activity`),
 * gravado automaticamente pelo backend nas rotas já existentes (aprovação,
 * ajuste, comentário, nova versão, arquivo) — o frontend nunca cria isso
 * diretamente, só lista. Ver `scratchpad/mensagem-backend-central-cliente.md`.
 */
export interface ClientActivity {
  id: string
  type: ClientActivityType
  createdAt: string
  actorType: ClientActivityActorType | null
  actorName: string | null
  videoId: string | null
  projectId: string | null
  fileId: string | null
  description: string
}

export type ClientFileCategory = 'briefing' | 'contrato' | 'referencia' | 'roteiro' | 'outro'

/**
 * Arquivo operacional interno do cliente (briefing, contrato, roteiro,
 * referência) — distinto dos vídeos de aprovação, nunca exposto em rotas
 * públicas. Mesmo fluxo de upload presigned URL → R2 usado por vídeos/branding.
 */
export interface ClientFile {
  id: string
  fileName: string
  fileUrl: string
  mimeType: string
  sizeBytes: number | null
  category: ClientFileCategory
  description: string | null
  uploadedByName: string | null
  createdAt: string
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

/**
 * Tipo de um card genérico do Kanban que não é vídeo — vídeo continua sendo
 * um `Video` normal, não entra aqui. Ver `scratchpad/mensagem-backend-demandas-genericas.md`.
 */
export type DemandKind = 'projeto' | 'campanha' | 'gravacao' | 'demanda'

/**
 * Card genérico do quadro Kanban sem vídeo associado (`GET/POST/PATCH/DELETE
 * /demandas`) — projeto, campanha, gravação ou demanda avulsa. Reaproveita o
 * mesmo `ProductionStage` de `Video.productionStage`, já que o quadro trata
 * os dois tipos de card igual.
 */
export interface Demand {
  id: string
  title: string
  kind: DemandKind
  clientId: string | null
  responsibleId: string | null
  deadline: string | null
  productionStage: ProductionStage
  createdAt: string
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
  /** Etapa de produção interna (quadro Kanban) — ver `ProductionStage`. */
  productionStage: ProductionStage
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

/**
 * Identidade visual (logo + cor de destaque) exibida numa tela pública.
 * Mesmo shape usado tanto para a marca da agência (`User.branding`) quanto
 * para a marca própria de um cliente (`Client.branding`) — ver
 * `resolveBranding` em `lib/services.ts` para como as duas se combinam.
 */
export interface Branding {
  /** URL do logo enviado (null = usar o fallback: logo do cliente, senão o padrão do sistema). */
  logoUrl: string | null
  /** Nome de exibição (opcional, usado como alt/label). */
  agencyName: string | null
  /** Cor de destaque em hex (ex: "#ff5a36"), null = cair no próximo nível (cliente → agência → padrão do sistema). */
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
  /** id interno do vídeo — usado só para resolver qual é a versão mais recente, nunca exposto na UI. */
  id: string
  /** id do vídeo que esta versão substitui, se houver (ver `id`). */
  videoPaiId: string | null
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

/** Um item de portfólio é um vídeo ou uma foto — `mediaType` distingue os dois. */
export type PortfolioItemMediaType = 'video' | 'foto'

/**
 * Um item (vídeo ou foto) dentro de um portfólio (vitrine da agência,
 * distinta da galeria de projeto/aprovação). Sem `status` de aprovação: aqui
 * o item já é um "case" pronto para mostrar a possíveis clientes, não algo em
 * fluxo de revisão. `videoUrl`/`posterUrl` são denormalizados no momento em
 * que o item entra no portfólio (vídeo selecionado de um projeto existente,
 * ou vídeo/foto enviado direto), então a rota pública não precisa resolver o
 * `Video` original.
 *
 * Para `mediaType: 'foto'`, `videoUrl` é sempre `null` e `posterUrl` é a
 * própria foto (usada tanto como thumbnail na grade quanto em tela cheia no
 * lightbox) — sem pipeline de otimização separado, como existe pra vídeo.
 */
export interface PortfolioItem {
  id: string
  mediaType: PortfolioItemMediaType
  title: string
  description: string | null
  videoUrl: string | null
  posterUrl: string | null
  processingStatus: VideoProcessingStatus
  order: number
  createdAt: string | null
}

/** Portfólio da agência (owner): coleção curada de vídeos/fotos com link público próprio, para atrair novos clientes. */
export interface Portfolio {
  id: string
  name: string
  description: string | null
  /** Link público (slug) para a rota /p/:link. */
  link: string
  /** Categoria/aba do hub público a que este álbum pertence (null = "Sem categoria"). */
  categoryId: string | null
  /** Capa explícita definida pelo owner; se null, o frontend usa o poster do primeiro item como fallback. */
  coverUrl: string | null
  /**
   * Cliente ao qual este álbum foi personalizado (opcional) — quando definido,
   * a página pública deste álbum usa a marca desse cliente (`Client.branding`)
   * em vez da marca da agência. Útil para montar um case personalizado pra
   * apresentar a um prospect com a cara dele. `null` = álbum genérico da
   * vitrine, sem vínculo com cliente (o caso comum).
   */
  clientId: string | null
  videos: PortfolioItem[]
  createdAt: string | null
  updatedAt: string | null
}

/** Portfólio como visto na rota pública /p/:link (GET /public/portfolios/:link) — sem dado de cliente exposto, exceto a marca quando o álbum foi personalizado para um. */
export interface PublicPortfolio {
  name: string
  description: string | null
  branding: Branding | null
  videos: PortfolioItem[]
}

/** Categoria/aba livre criada pelo owner para agrupar álbuns de portfólio no hub público. */
export interface PortfolioCategory {
  id: string
  name: string
  order: number
}

/** Perfil da vitrine da agência: foto de perfil + o link público do hub que reúne todos os álbuns (/portfolio/:hubLink). */
export interface PortfolioProfile {
  photoUrl: string | null
  /** Nunca null — gerado automaticamente na primeira leitura, como o `publicLink` de projeto. */
  hubLink: string
}

/**
 * Um álbum como aparece agrupado numa categoria do hub público — versão
 * enxuta, sem `videos[]`. `mediaType` é o tipo predominante entre os itens do
 * álbum (maioria simples definida pelo backend) — usado só para o filtro
 * foto/vídeo dentro de uma categoria no hub, já que um álbum pode misturar os
 * dois tipos internamente.
 */
export interface PortfolioHubItem {
  id: string
  name: string
  description: string | null
  link: string
  coverUrl: string | null
  mediaType: PortfolioItemMediaType
}

/** Hub público da agência (rota /portfolio/:hubLink): perfil + álbuns agrupados por categoria, sem nenhum dado de cliente/projeto. */
export interface PublicPortfolioHub {
  agencyName: string | null
  photoUrl: string | null
  branding: Branding | null
  categories: { id: string; name: string; portfolios: PortfolioHubItem[] }[]
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

/** Ciclo de cobrança da assinatura (Asaas). */
export type BillingCycle = 'MONTHLY' | 'YEARLY'

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
  /**
   * Id do `TeamMember` (conta real, com login) por trás desse nome, quando
   * vinculado explicitamente pelo owner/editor — `null` pra gente da equipe
   * sem conta no Aprova (freelancer, motorista etc.), o caso comum. Base
   * necessária pro backend um dia poder notificar a pessoa certa quando
   * entra numa gravação (hoje só existe `lembrete_gravacao` genérico, sem
   * alvo por usuário) — ver `crewService.create`.
   */
  userId: string | null
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
