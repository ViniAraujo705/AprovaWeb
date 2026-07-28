'use client'

/**
 * Primitivas de animação compartilhadas (Framer Motion).
 *
 * Regras do projeto:
 * - Sutileza: entradas leves (fade + leve escala/deslize), nada exagerado.
 * - Acessibilidade: tudo respeita `prefers-reduced-motion`. Quando o usuário
 *   pede menos movimento, as animações viram um simples fade (ou nada), sem
 *   deslocamento nem escala.
 *
 * Preferimos expor componentes prontos (FadeIn, StaggerList) para manter as
 * telas limpas e o comportamento consistente.
 */
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

export { motion, AnimatePresence, useReducedMotion }

type DivProps = ComponentPropsWithoutRef<typeof motion.div>

/**
 * Entrada suave: fade + leve escala (padrão) ou fade + deslize.
 * Vira um fade puro quando o usuário prefere menos movimento.
 */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  scale = 0.98,
  duration = 0.4,
  className,
  ...rest
}: {
  children: ReactNode
  delay?: number
  /** Deslocamento vertical inicial (px). Use 0 para não deslizar. */
  y?: number
  /** Escala inicial. Use 1 para não escalar. */
  scale?: number
  duration?: number
  className?: string
} & Omit<DivProps, 'children'>) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, scale }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * Container que escalona (stagger) a entrada dos filhos diretos marcados com
 * a variante `staggerItem`. Sem movimento quando reduced-motion está ativo.
 */
export function StaggerList({
  children,
  className,
  step = 0.06,
}: {
  children: ReactNode
  className?: string
  step?: number
}) {
  const reduce = useReducedMotion()
  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : step },
    },
  }
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Variante para itens dentro de <StaggerList>. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
}

/** Variante reduzida (só fade) para itens de <StaggerList>. */
export const staggerItemReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
}
