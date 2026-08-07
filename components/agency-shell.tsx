'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Upload,
  Shield,
  Menu,
  X,
  Play,
  LogOut,
  Settings,
  Users,
  ListChecks,
  BarChart3,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Contact,
  Bell,
  Gauge,
  CalendarDays,
  Images,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/back-button'
import { useAuth } from '@/components/auth-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/notification-bell'
import { teamRoleLabel, type Role, type TeamRole } from '@/lib/types'
import { AnimatePresence, motion, useReducedMotion } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'

const SIDEBAR_COLLAPSED_KEY = 'aprova_sidebar_collapsed'

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

// Itens com teamRole:'owner' ficam escondidos para editores (equipe, branding).
const nav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Enviar vídeo', icon: Upload },
  { href: '/projetos', label: 'Projetos', icon: FolderOpen },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays },
  { href: '/notificacoes', label: 'Notificações', icon: Bell },
  { href: '/clientes', label: 'Clientes', icon: Contact, teamRole: 'owner' },
  { href: '/portfolios', label: 'Portfólios', icon: Images, teamRole: 'owner' },
  { href: '/configuracoes/equipe', label: 'Equipe', icon: Users, teamRole: 'owner' },
  { href: '/equipe/desempenho', label: 'Desempenho', icon: BarChart3, teamRole: 'owner' },
  {
    href: '/configuracoes/perguntas',
    label: 'Perguntas',
    icon: ListChecks,
    teamRole: 'owner',
  },
  // Sem teamRole: editor também acessa para editar o próprio perfil (a
  // seção de branding dentro da tela é que fica escondida do editor).
  { href: '/configuracoes', label: 'Configurações', icon: Settings, exact: true },
  // Sem teamRole: editor também esbarra em limites (ex: teto de vídeos/mês)
  // e precisa entender por que uma ação foi bloqueada.
  { href: '/configuracoes/plano', label: 'Meu Plano', icon: Gauge },
  { href: '/planos', label: 'Planos', icon: CreditCard, teamRole: 'owner' },
  { href: '/admin', label: 'Admin', icon: Shield, role: 'admin' },
]

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={cn('flex items-center gap-2', collapsed && 'justify-center')}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Play className="size-4 fill-current" />
      </span>
      {!collapsed && (
        <span className="font-display text-2xl leading-none tracking-wide">
          APROVA
        </span>
      )}
    </Link>
  )
}

function NavLinks({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const { user } = useAuth()
  const items = nav.filter(
    (item) =>
      (!item.role || user?.role === item.role) &&
      (!item.teamRole || user?.teamRole === item.teamRole),
  )
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Icon className="size-5 shrink-0" />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        )
      })}
    </nav>
  )
}

function UserFooter({ collapsed }: { collapsed?: boolean }) {
  const { user, logout } = useAuth()

  if (collapsed) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-sidebar-border bg-secondary/40 p-2">
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

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-sidebar-border bg-secondary/40 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-bold uppercase text-foreground">
          {user?.photoUrl ? (
            <Image src={user.photoUrl} alt="" fill className="object-cover" sizes="32px" unoptimized />
          ) : (
            (user?.name || user?.email || '?').slice(0, 1)
          )}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 shrink truncate text-sm font-medium text-foreground" title={user?.name || 'Usuário'}>
              {user?.name || 'Usuário'}
            </p>
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
          <p className="truncate text-xs text-muted-foreground" title={user?.email}>
            {user?.email}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1">
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
  const [open, setOpen] = useState(false)
  // Fica true do momento em que o drawer abre até a animação de saída
  // terminar (via onExitComplete). Evita que um clique durante o fechamento
  // "vaze" para um elemento por trás do overlay (ex.: abrir o menu, tocar em
  // um item e sem querer acionar um botão de um card no dashboard).
  const [overlayBlocking, setOverlayBlocking] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const reduce = useReducedMotion()

  function openMenu() {
    setOverlayBlocking(true)
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
  }

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <div
      className={cn(
        'min-h-screen lg:grid lg:transition-[grid-template-columns] lg:duration-300 lg:ease-out',
        collapsed ? 'lg:grid-cols-[76px_1fr]' : 'lg:grid-cols-[260px_1fr]',
      )}
      style={brandAccentStyle(user?.branding?.accentColor)}
    >
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar p-5 lg:flex">
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between gap-2')}>
          <Logo collapsed={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <motion.span
              className="grid place-items-center"
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <ChevronLeft className="size-4" />
            </motion.span>
          </button>
        </div>
        <div className="mt-8 flex-1">
          <NavLinks collapsed={collapsed} />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-sidebar-border bg-secondary/60 p-4">
                <p className="font-display text-xl tracking-wide">PLANO PRO</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Vídeos ilimitados e links de aprovação sem marca d&apos;água.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <UserFooter collapsed={collapsed} />
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
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
              <div className="mt-8 flex-1">
                <NavLinks onNavigate={closeMenu} />
              </div>
              <UserFooter />
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
          <div className="px-4 pt-4 sm:px-6 lg:px-10 lg:pt-6">
            <BackButton />
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
