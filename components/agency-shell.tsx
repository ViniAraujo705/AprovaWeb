'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  Film,
  Briefcase,
  IdCard,
  BarChart3,
  Settings,
  Kanban,
  Shield,
  Menu,
  X,
  LogOut,
  Users,
  ListChecks,
  ListPlus,
  FileBarChart,
  CreditCard,
  ChevronLeft,
  FolderOpen,
  Contact,
  Bell,
  Gauge,
  CalendarDays,
  CalendarClock,
  NotebookPen,
  Images,
  ChevronRight,
  Plug,
  Plus,
  ChevronsUpDown,
  ArrowLeft,
  UserRound,
  KeyRound,
  Palette,
  Moon,
  Sun,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/back-button'
import { useAuth } from '@/components/auth-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/notification-bell'
import { NotificationPopups } from '@/components/notification-popups'
import { AccountSwitcher } from '@/components/account-switcher'
import { AgencyLogo } from '@/components/agency-logo'
import { teamRoleLabel, type Role, type TeamRole } from '@/lib/types'
import { AnimatePresence, motion, useReducedMotion } from '@/components/motion'
import { useBrandAccentStyle } from '@/lib/theme'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  /** Papel de sistema exigido (admin). */
  role?: Role
  /** Papel na conta exigido (owner esconde do editor). */
  teamRole?: TeamRole
  /** Só marca ativo no match exato (evita conflito com sub-rotas). */
  exact?: boolean
}

type NavModule = {
  key: string
  label: string
  /** Ícone usado no rail quando o menu está recolhido, se o módulo tiver só 1 item. */
  icon: typeof LayoutDashboard
  items: NavItem[]
}

// Menu principal: só o trabalho do dia a dia (padrão Linear/Vercel/Stripe).
// Tudo o que é ajuste de conta/agência vive em `settingsModules` — ao entrar
// numa rota de configuração, a própria sidebar troca para esse menu.
// Um módulo some da lista se todos os itens dele forem escondidos pelo papel.
const navModules: NavModule[] = [
  // Sem rótulo: o Dashboard fica solto no topo, sem cabeçalho de seção.
  {
    key: 'geral',
    label: '',
    icon: LayoutDashboard,
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, teamRole: 'owner' }],
  },
  // "Enviar vídeo" não está aqui: é o botão de destaque no topo do menu.
  {
    key: 'producao',
    label: 'Produção',
    icon: Briefcase,
    items: [
      { href: '/kanban', label: 'Kanban', icon: Kanban },
      { href: '/videos', label: 'Vídeos', icon: Film, teamRole: 'owner' },
      { href: '/projetos', label: 'Projetos', icon: FolderOpen },
      { href: '/clientes', label: 'Clientes', icon: Contact },
      { href: '/portfolios', label: 'Portfólios', icon: Images, teamRole: 'owner' },
    ],
  },
  {
    key: 'agenda',
    label: 'Agenda',
    icon: CalendarDays,
    items: [
      { href: '/calendario', label: 'Calendário', icon: CalendarDays },
      { href: '/checkday', label: 'CheckDay', icon: NotebookPen },
    ],
  },
  {
    key: 'resultados',
    label: 'Resultados',
    icon: BarChart3,
    items: [
      { href: '/equipe/desempenho', label: 'Desempenho', icon: BarChart3, teamRole: 'owner' },
      { href: '/relatorios', label: 'Relatórios', icon: FileBarChart, teamRole: 'owner' },
    ],
  },
]

const settingsModules: NavModule[] = [
  {
    key: 'conta',
    label: 'Minha conta',
    icon: UserRound,
    items: [
      // Sem teamRole: cada pessoa cuida do próprio perfil, acesso e e-mails.
      // A central de avisos (/notificacoes) é do dia a dia: fica no sininho.
      { href: '/configuracoes', label: 'Perfil', icon: UserRound, exact: true },
      { href: '/configuracoes/seguranca', label: 'Segurança', icon: KeyRound },
      { href: '/configuracoes/notificacoes', label: 'Notificações', icon: Bell },
    ],
  },
  {
    key: 'agencia',
    label: 'Agência',
    icon: Users,
    items: [
      { href: '/configuracoes/marca', label: 'Marca', icon: Palette, teamRole: 'owner' },
      { href: '/configuracoes/equipe', label: 'Equipe', icon: Users, teamRole: 'owner' },
      { href: '/configuracoes/perguntas', label: 'Perguntas de avaliação', icon: ListChecks, teamRole: 'owner' },
      { href: '/configuracoes/campos-cliente', label: 'Campos de cliente', icon: ListPlus, teamRole: 'owner' },
      { href: '/configuracoes/integracoes', label: 'Integrações', icon: Plug, teamRole: 'owner' },
    ],
  },
  {
    key: 'cobranca',
    label: 'Plano e cobrança',
    icon: CreditCard,
    items: [
      // Sem teamRole: editor também esbarra em limites (ex: teto de vídeos/mês)
      // e precisa entender por que uma ação foi bloqueada.
      { href: '/configuracoes/plano', label: 'Meu plano', icon: Gauge },
      { href: '/planos', label: 'Planos', icon: CreditCard, teamRole: 'owner' },
    ],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    icon: Shield,
    items: [{ href: '/admin', label: 'Admin', icon: Shield, role: 'admin' }],
  },
]

/** Rotas que abrem a sidebar no modo "Configurações". */
function isSettingsRoute(pathname: string): boolean {
  return ['/configuracoes', '/planos', '/admin'].some(
    (r) => pathname === r || pathname.startsWith(r + '/'),
  )
}

const SIDEBAR_COLLAPSED_KEY = 'aprova_sidebar_collapsed'

function itemMatchesRoute(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
}

/** Módulos + itens visíveis pro usuário logado (filtra por role/teamRole). */
function useVisibleModules(): NavModule[] {
  const { user } = useAuth()
  const settings = isSettingsRoute(usePathname())
  return useMemo(
    () =>
      (settings ? settingsModules : navModules)
        .map((m) => ({
          ...m,
          items: m.items.filter(
            (item) =>
              (!item.role || user?.role === item.role) &&
              (!item.teamRole || user?.teamRole === item.teamRole),
          ),
        }))
        .filter((m) => m.items.length > 0),
    [user, settings],
  )
}

function Logo({ collapsed }: { collapsed?: boolean }) {
  const { user } = useAuth()
  // Dashboard é owner-only — editor volta pro Kanban ao clicar na marca.
  const home = user?.teamRole === 'owner' ? '/dashboard' : '/kanban'
  return (
    <Link href={home} className={cn(collapsed && 'flex justify-center')}>
      <AgencyLogo branding={user?.branding ?? null} size={collapsed ? 'icon' : 'sm'} />
    </Link>
  )
}

/** Lista única com todos os grupos — usada no menu desktop expandido e na gaveta mobile. */
function NavLinksList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const modules = useVisibleModules()

  return (
    <nav className="flex flex-col">
      {modules.map((m, i) => (
        <div key={m.key} className={cn(i > 0 && 'mt-4')}>
          {m.label && (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {m.label}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {m.items.map((item) => {
              const active = itemMatchesRoute(item, pathname)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'relative flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                    active
                      ? 'bg-secondary font-semibold text-foreground'
                      : 'font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  {active && (
                    <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary-ink" />
                  )}
                  <Icon className={cn('size-[18px] shrink-0', active && 'text-primary-ink')} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

/** Menu desktop recolhido: só ícones, um por item (agrupados com espaço entre módulos), sem rótulo. */
function NavRailItems({ modules, pathname }: { modules: NavModule[]; pathname: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {modules.map((m) => (
        <div key={m.key} className="flex flex-col items-center gap-1">
          {m.items.map((item) => {
            const active = itemMatchesRoute(item, pathname)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-lg transition-colors',
                  active
                    ? 'bg-secondary text-primary-ink'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <Icon className="size-5" />
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Botão de destaque para a ação mais comum — enviar um vídeo pra aprovação. */
function UploadButton({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  if (compact) {
    return (
      <Link
        href="/upload"
        title="Enviar vídeo"
        aria-label="Enviar vídeo"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background transition hover:opacity-90"
      >
        <Plus className="size-5" />
      </Link>
    )
  }
  return (
    <Link
      href="/upload"
      onClick={onNavigate}
      className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.99]"
    >
      <Plus className="size-4" />
      Enviar vídeo
    </Link>
  )
}

/** Topo da sidebar no modo Configurações: volta pro app (padrão Linear/Vercel). */
function SettingsHeader({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { user } = useAuth()
  const home = user?.teamRole === 'owner' ? '/dashboard' : '/kanban'
  if (compact) {
    return (
      <Link
        href={home}
        title="Voltar ao app"
        aria-label="Voltar ao app"
        className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-5" />
      </Link>
    )
  }
  return (
    <div>
      <Link
        href={home}
        onClick={onNavigate}
        className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao app
      </Link>
      <p className="mt-3 px-1 font-display text-lg font-bold text-foreground">Configurações</p>
    </div>
  )
}

/** Atalho fixo pra Configurações, acima do usuário (só no menu principal). */
function SettingsLink({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  if (compact) {
    return (
      <Link
        href="/configuracoes"
        title="Configurações"
        aria-label="Configurações"
        className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
      >
        <Settings className="size-5" />
      </Link>
    )
  }
  return (
    <Link
      href="/configuracoes"
      onClick={onNavigate}
      className="flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
    >
      <Settings className="size-[18px] shrink-0" />
      Configurações
    </Link>
  )
}

function UserAvatar() {
  const { user } = useAuth()
  return (
    <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-avatar text-xs font-bold uppercase text-avatar-foreground">
      {user?.photoUrl ? (
        <Image src={user.photoUrl} alt="" fill className="object-cover" sizes="32px" unoptimized />
      ) : (
        (user?.name || user?.email || '?').slice(0, 1)
      )}
    </span>
  )
}

/**
 * Rodapé do menu: uma linha só (avatar + nome + papel). Tema, configurações e
 * sair ficam num menu que abre pra cima ao clicar. O painel usa `fixed` com
 * posição calculada porque a sidebar tem overflow-hidden (cortaria o popover).
 */
function UserMenu({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const isDemoUser = user?.id === 'demo-user'
  const roleLabel = user ? (isDemoUser ? 'Conta de exemplo' : teamRoleLabel[user.teamRole]) : ''
  const isDark = resolvedTheme === 'dark'

  function toggle() {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ left: r.left, bottom: window.innerHeight - r.top + 8 })
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onResize() {
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const itemClass =
    'flex w-full min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-secondary'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu da conta"
        title={compact ? user?.name || user?.email || '' : undefined}
        className={cn(
          'flex items-center rounded-xl transition-colors hover:bg-secondary',
          compact ? 'size-10 justify-center' : 'w-full min-w-0 gap-2.5 p-2 text-left',
          open && 'bg-secondary',
        )}
      >
        <UserAvatar />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{user?.name || 'Usuário'}</span>
              <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={panelRef}
            role="menu"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{ left: Math.max(8, pos.left), bottom: pos.bottom }}
            className="fixed z-50 w-64 max-w-[calc(100vw-16px)] rounded-2xl border border-border bg-card p-1.5 shadow-2xl"
          >
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="truncate text-sm font-semibold text-foreground">{user?.name || 'Usuário'}</p>
              <p className="truncate text-xs text-muted-foreground" title={user?.email}>
                {user?.email}
              </p>
            </div>
            <div className="my-1 h-px bg-border" />
            <button type="button" role="menuitem" className={itemClass} onClick={() => setTheme(isDark ? 'light' : 'dark')}>
              {isDark ? <Sun className="size-4 text-muted-foreground" /> : <Moon className="size-4 text-muted-foreground" />}
              {isDark ? 'Tema claro' : 'Tema escuro'}
            </button>
            <Link
              href="/configuracoes"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                setOpen(false)
                onNavigate?.()
              }}
            >
              <Settings className="size-4 text-muted-foreground" />
              Configurações
            </Link>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              className={cn(itemClass, 'text-danger-ink hover:bg-danger-soft')}
              onClick={logout}
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export function AgencyShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const brandAccent = useBrandAccentStyle(user?.branding?.accentColor, user?.branding?.secondaryColor, { applyToRoot: true })
  const pathname = usePathname()
  const modules = useVisibleModules()
  const inSettings = isSettingsRoute(pathname)
  const [open, setOpen] = useState(false)
  // Fica true do momento em que o drawer abre até a animação de saída
  // terminar (via onExitComplete). Evita que um clique durante o fechamento
  // "vaze" para um elemento por trás do overlay (ex.: abrir o menu, tocar em
  // um item e sem querer acionar um botão de um card no dashboard).
  const [overlayBlocking, setOverlayBlocking] = useState(false)
  const reduce = useReducedMotion()

  // Menu desktop expandido (lista completa, com rótulos) ou recolhido (só
  // ícones) — lembrado entre sessões via localStorage. `null` até ler do
  // localStorage no mount, pra não animar a partir do valor padrão errado.
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
  }, [])
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }
  const isCollapsed = collapsed ?? false

  function openMenu() {
    setOverlayBlocking(true)
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
  }

  return (
      <div
        className="min-h-screen lg:grid lg:grid-cols-[auto_1fr]"
        style={brandAccent}
      >
        {/* Desktop sidebar: lista completa (expandida) ou rail de ícones (recolhida) */}
        <motion.aside
          initial={false}
          animate={{ width: isCollapsed ? 56 : 288 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex print:hidden"
        >
          {isCollapsed ? (
            <div className="flex h-full w-14 shrink-0 flex-col items-center gap-4 py-4">
              <Logo collapsed />
              <NotificationBell />
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Expandir menu"
                title="Expandir menu"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </button>
              {inSettings ? <SettingsHeader compact /> : <UploadButton compact />}
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
                <NavRailItems modules={modules} pathname={pathname} />
              </div>
              <div className="flex flex-col items-center gap-1">
                {!inSettings && <SettingsLink compact />}
                <AccountSwitcher direction="up" className="!min-h-0 !px-1.5" />
                <UserMenu compact />
              </div>
            </div>
          ) : (
            <div className="flex h-full w-72 shrink-0 flex-col p-5">
              <div className="flex items-center justify-between gap-2">
                <Logo />
                <div className="flex items-center gap-0.5">
                  <NotificationBell />
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-label="Recolher menu"
                    title="Recolher menu"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-6">{inSettings ? <SettingsHeader /> : <UploadButton />}</div>
              <div className="mt-6 min-h-0 flex-1 overflow-y-auto scrollbar-none">
                <NavLinksList />
              </div>
              {!inSettings && (
                <div className="mt-2">
                  <SettingsLink />
                </div>
              )}
              <div className="mt-2 flex items-center gap-1 border-t border-sidebar-border pt-3">
                <div className="min-w-0 flex-1">
                  <UserMenu />
                </div>
                <AccountSwitcher direction="up" />
              </div>
            </div>
          )}
        </motion.aside>

        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
            <button
              type="button"
              onClick={openMenu}
              aria-label="Abrir menu"
              className="grid size-11 place-items-center rounded-lg text-foreground hover:bg-secondary"
            >
              <Menu className="size-6" />
            </button>
          </div>
        </header>

        {/* Mobile drawer */}
        <AnimatePresence onExitComplete={() => setOverlayBlocking(false)}>
          {open && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <motion.div
                className="absolute inset-0 bg-black/70"
                onClick={closeMenu}
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
              <motion.div
                className="absolute left-0 top-0 flex h-full w-72 flex-col bg-sidebar p-5"
                initial={reduce ? { y: -4 } : { x: '-100%' }}
                animate={reduce ? { y: 0 } : { x: 0 }}
                exit={reduce ? { y: -4 } : { x: '-100%' }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between">
                  <Logo />
                  <button
                    type="button"
                    onClick={closeMenu}
                    aria-label="Fechar menu"
                    className="grid size-11 place-items-center rounded-lg text-foreground hover:bg-secondary"
                  >
                    <X className="size-6" />
                  </button>
                </div>
                <div className="mt-6">
                  {inSettings ? <SettingsHeader onNavigate={closeMenu} /> : <UploadButton onNavigate={closeMenu} />}
                </div>
                <div className="mt-6 min-h-0 flex-1 overflow-y-auto scrollbar-none">
                  <NavLinksList onNavigate={closeMenu} />
                </div>
                {!inSettings && (
                  <div className="mt-2">
                    <SettingsLink onNavigate={closeMenu} />
                  </div>
                )}
                <div className="mt-2 flex items-center gap-1 border-t border-sidebar-border pt-3">
                  <div className="min-w-0 flex-1">
                    <UserMenu onNavigate={closeMenu} />
                  </div>
                  <AccountSwitcher direction="up" />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/*
          inert (não só pointer-events-none) enquanto o drawer está aberto OU
          ainda fechando: garante que nenhum clique "vaze" para um elemento
          atrás do overlay durante a animação de saída, independente de
          qualquer race de timing entre o clique que fecha o menu e o
          commit visual do fechamento.
        */}
        <main className="flex min-w-0 flex-col" inert={overlayBlocking || undefined}>
          {pathname !== '/dashboard' && (
            <div className="px-4 pt-4 sm:px-6 lg:px-10 lg:pt-6 print:hidden">
              <BackButton />
            </div>
          )}
          {children}
        </main>
        <NotificationPopups />
      </div>
  )
}
