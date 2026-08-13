'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  Briefcase,
  IdCard,
  BarChart3,
  Settings,
  Kanban,
  Upload,
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
  Images,
  ChevronRight,
  Plug,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/back-button'
import { useAuth } from '@/components/auth-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/notification-bell'
import { AccountSwitcher } from '@/components/account-switcher'
import { teamRoleLabel, type Role, type TeamRole } from '@/lib/types'
import { AnimatePresence, motion, useReducedMotion } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'

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
  /** Ícone do rail (camada 1) — os itens dentro (camada 2) têm o próprio ícone. */
  icon: typeof LayoutDashboard
  items: NavItem[]
}

// Navegação em duas camadas (rail + painel), estilo Salesforce/Linear. Um
// módulo inteiro some do rail se todos os itens dele forem escondidos (ex:
// editor não vê nenhum item de "Equipe e resultados" — o ícone do rail some
// junto, não fica um módulo vazio clicável).
const navModules: NavModule[] = [
  {
    key: 'geral',
    label: 'Visão geral',
    icon: LayoutDashboard,
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, teamRole: 'owner' }],
  },
  {
    key: 'trabalho',
    label: 'Trabalho',
    icon: Briefcase,
    items: [
      { href: '/kanban', label: 'Kanban', icon: Kanban },
      { href: '/upload', label: 'Enviar vídeo', icon: Upload },
      { href: '/projetos', label: 'Projetos', icon: FolderOpen },
      { href: '/calendario', label: 'Calendário', icon: CalendarDays },
    ],
  },
  {
    key: 'clientes',
    label: 'Clientes',
    icon: IdCard,
    items: [
      { href: '/clientes', label: 'Clientes', icon: Contact },
      {
        href: '/configuracoes/campos-cliente',
        label: 'Campos de cliente',
        icon: ListPlus,
        teamRole: 'owner',
      },
      { href: '/portfolios', label: 'Portfólios', icon: Images, teamRole: 'owner' },
    ],
  },
  {
    key: 'equipe',
    label: 'Equipe e resultados',
    icon: BarChart3,
    items: [
      { href: '/configuracoes/equipe', label: 'Equipe', icon: Users, teamRole: 'owner' },
      { href: '/equipe/desempenho', label: 'Desempenho', icon: BarChart3, teamRole: 'owner' },
      { href: '/relatorios', label: 'Relatórios', icon: FileBarChart, teamRole: 'owner' },
      {
        href: '/configuracoes/perguntas',
        label: 'Perguntas',
        icon: ListChecks,
        teamRole: 'owner',
      },
    ],
  },
  {
    key: 'conta',
    label: 'Conta',
    icon: Settings,
    items: [
      { href: '/notificacoes', label: 'Notificações', icon: Bell },
      // Sem teamRole: editor também acessa para editar o próprio perfil (a
      // seção de branding dentro da tela é que fica escondida do editor).
      { href: '/configuracoes', label: 'Configurações', icon: Settings, exact: true },
      // Sem teamRole: editor também esbarra em limites (ex: teto de vídeos/mês)
      // e precisa entender por que uma ação foi bloqueada.
      { href: '/configuracoes/plano', label: 'Meu Plano', icon: Gauge },
      { href: '/configuracoes/integracoes', label: 'Integrações', icon: Plug, teamRole: 'owner' },
      { href: '/planos', label: 'Planos', icon: CreditCard, teamRole: 'owner' },
      { href: '/admin', label: 'Admin', icon: Shield, role: 'admin' },
    ],
  },
]

function itemMatchesRoute(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
}

/** Módulos + itens visíveis pro usuário logado (filtra por role/teamRole). */
function useVisibleModules(): NavModule[] {
  const { user } = useAuth()
  return useMemo(
    () =>
      navModules
        .map((m) => ({
          ...m,
          items: m.items.filter(
            (item) =>
              (!item.role || user?.role === item.role) &&
              (!item.teamRole || user?.teamRole === item.teamRole),
          ),
        }))
        .filter((m) => m.items.length > 0),
    [user],
  )
}

function Logo({ collapsed }: { collapsed?: boolean }) {
  const { user } = useAuth()
  // Dashboard é owner-only — editor volta pro Kanban ao clicar na marca.
  const home = user?.teamRole === 'owner' ? '/dashboard' : '/kanban'
  return (
    <Link
      href={home}
      className={cn('flex items-center gap-2', collapsed && 'justify-center')}
    >
      <span className="relative size-8 shrink-0 overflow-hidden rounded-lg">
        <Image src="/logo-check.png" alt="Check" fill className="object-cover" sizes="32px" />
      </span>
      {!collapsed && (
        <span className="font-display text-2xl leading-none tracking-wide">
          CHECK
        </span>
      )}
    </Link>
  )
}

/** Camada 1: rail estreito (56px), só ícones — um por módulo. */
function NavRail({
  modules,
  activeModuleKey,
  openModuleKey,
  onSelect,
}: {
  modules: NavModule[]
  activeModuleKey: string | null
  openModuleKey: string | null
  onSelect: (key: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {modules.map((m) => {
        const Icon = m.icon
        // Preto = módulo da rota atual (sempre, independente do painel aberto).
        // Cinza = módulo só "espiado" (painel aberto sem ter navegado pra ele).
        const isActiveRoute = m.key === activeModuleKey
        const isOpen = m.key === openModuleKey
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelect(m.key)}
            title={m.label}
            aria-label={m.label}
            aria-pressed={isOpen}
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-lg transition-colors',
              isActiveRoute
                ? 'bg-primary text-primary-foreground'
                : isOpen
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Icon className="size-5" />
          </button>
        )
      })}
    </div>
  )
}

/** Camada 2: painel do módulo aberto — título + itens (ícone + rótulo). */
function NavPanel({
  module,
  onNavigate,
  onClose,
}: {
  module: NavModule
  onNavigate?: () => void
  onClose: () => void
}) {
  const pathname = usePathname()
  return (
    <div className="flex h-full w-56 shrink-0 flex-col p-4">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <p className="text-xs font-medium text-muted-foreground/70">{module.label}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Recolher painel"
          title="Recolher painel"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>
      <nav className="flex flex-col gap-1">
        {module.items.map((item) => {
          const active = itemMatchesRoute(item, pathname)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

/** Lista única (sem duas camadas) pro drawer mobile — rail+painel não cabe bem numa gaveta estreita. */
function MobileNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const modules = useVisibleModules()

  return (
    <nav className="flex flex-col">
      {modules.map((m, i) => (
        <div key={m.key} className={cn(i > 0 && 'mt-4 border-t border-sidebar-border pt-4')}>
          <p className="px-3 pb-2 text-xs font-medium text-muted-foreground/70">{m.label}</p>
          <div className="flex flex-col gap-1">
            {m.items.map((item) => {
              const active = itemMatchesRoute(item, pathname)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <Icon className="size-5 shrink-0" />
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

/** Rodapé compacto (avatar, notificações, tema, sair) — usado no rail (56px), sempre ícone-só. */
function RailUserFooter() {
  const { user, logout } = useAuth()
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        title={user?.name || user?.email || ''}
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-bold uppercase text-foreground"
      >
        {user?.photoUrl ? (
          <Image src={user.photoUrl} alt="" fill className="object-cover" sizes="32px" unoptimized />
        ) : (
          (user?.name || user?.email || '?').slice(0, 1)
        )}
      </span>
      <AccountSwitcher direction="up" className="!min-h-0 !px-1.5" />
      <NotificationBell direction="up" />
      <ThemeToggle />
      <button
        type="button"
        onClick={logout}
        aria-label="Sair"
        title="Sair"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

/** Rodapé completo (nome, e-mail, badge de papel) — usado na gaveta mobile, onde tem espaço sobrando. */
function MobileUserFooter() {
  const { user, logout } = useAuth()
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-sidebar-border bg-secondary/40 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-bold uppercase text-foreground">
          {user?.photoUrl ? (
            <Image src={user.photoUrl} alt="" fill className="object-cover" sizes="32px" unoptimized />
          ) : (
            (user?.name || user?.email || '?').slice(0, 1)
          )}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="min-w-0 shrink truncate text-sm font-medium text-foreground" title={user?.name || 'Usuário'}>
            {user?.name || 'Usuário'}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={user?.email}>
            {user?.email}
          </p>
        </div>
        {user && (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              user.teamRole === 'owner'
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary text-muted-foreground ring-1 ring-border',
            )}
          >
            {teamRoleLabel[user.teamRole]}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-1">
        <AccountSwitcher direction="up" />
        <NotificationBell direction="up" />
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          aria-label="Sair"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function AgencyShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()
  const modules = useVisibleModules()
  const [open, setOpen] = useState(false)
  // Fica true do momento em que o drawer abre até a animação de saída
  // terminar (via onExitComplete). Evita que um clique durante o fechamento
  // "vaze" para um elemento por trás do overlay (ex.: abrir o menu, tocar em
  // um item e sem querer acionar um botão de um card no dashboard).
  const [overlayBlocking, setOverlayBlocking] = useState(false)
  const reduce = useReducedMotion()

  // Módulo dono da rota atual — sempre existe (exceto rotas fora do shell,
  // que nem chegam a montar este componente).
  const activeModuleKey = useMemo(() => {
    for (const m of modules) {
      if (m.items.some((item) => itemMatchesRoute(item, pathname))) return m.key
    }
    return null
  }, [modules, pathname])

  // Painel aberto no rail — segue a rota atual por padrão. Clicar de novo no
  // ícone já aberto recolhe (dá mais espaço pro conteúdo); clicar num módulo
  // diferente troca o painel sem navegar (deixa "espiar" antes de escolher).
  const [openModuleKey, setOpenModuleKey] = useState<string | null>(activeModuleKey)
  useEffect(() => {
    setOpenModuleKey(activeModuleKey)
  }, [activeModuleKey])

  function handleRailSelect(key: string) {
    setOpenModuleKey((prev) => (prev === key ? null : key))
  }

  const openModule = modules.find((m) => m.key === openModuleKey) ?? null

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
      style={brandAccentStyle(user?.branding?.accentColor)}
    >
      {/* Desktop sidebar: rail (56px) + painel do módulo aberto (224px) */}
      <aside className="sticky top-0 hidden h-screen border-r border-sidebar-border bg-sidebar lg:flex print:hidden">
        <div className="flex h-full w-14 shrink-0 flex-col items-center gap-4 py-4">
          <Logo collapsed />
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
            <NavRail
              modules={modules}
              activeModuleKey={activeModuleKey}
              openModuleKey={openModuleKey}
              onSelect={handleRailSelect}
            />
          </div>
          <RailUserFooter />
        </div>
        <AnimatePresence initial={false}>
          {openModule ? (
            <motion.div
              key={openModule.key}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 224, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="h-full overflow-hidden border-l border-sidebar-border"
            >
              <NavPanel module={openModule} onClose={() => setOpenModuleKey(null)} />
            </motion.div>
          ) : (
            // Painel recolhido: aba fina grudada na borda pra "puxar de volta"
            // o painel — sem isso, a única forma de reabrir é lembrar de
            // clicar de novo no ícone já ativo no rail (nada indica isso).
            activeModuleKey && (
              <motion.button
                key="collapsed-handle"
                type="button"
                onClick={() => setOpenModuleKey(activeModuleKey)}
                title="Expandir menu"
                aria-label="Expandir menu"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex h-full w-3 shrink-0 items-center justify-center border-l border-sidebar-border bg-sidebar text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ChevronRight className="size-3" />
              </motion.button>
            )
          )}
        </AnimatePresence>
      </aside>

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
              initial={reduce ? { opacity: 0 } : { x: '-100%' }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: '-100%' }}
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
              <div className="mt-8 min-h-0 flex-1 overflow-y-auto scrollbar-none">
                <MobileNavLinks onNavigate={closeMenu} />
              </div>
              <div className="mt-4">
                <MobileUserFooter />
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
    </div>
  )
}
