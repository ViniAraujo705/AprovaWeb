'use client'

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

const MARGIN = 8

/**
 * Mantém um painel flutuante (menu, filtro, popover) dentro da tela.
 *
 * O painel é posicionado com CSS abaixo do gatilho (`top-full`). Depois de
 * montar, medimos: se a parte de baixo passa da tela e há mais espaço acima,
 * ele abre para cima; se não cabe em nenhum dos lados, ganha altura máxima com
 * rolagem interna. Só mexe no estilo vertical — a horizontal continua no CSS.
 */
export function useFitViewport(ref: RefObject<HTMLElement | null>, open = true): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open) {
      setStyle({})
      return
    }
    const el = ref.current
    const anchor = el?.offsetParent as HTMLElement | null
    if (!el || !anchor) return
    const panel = el.getBoundingClientRect()
    const trigger = anchor.getBoundingClientRect()
    const vh = window.innerHeight
    if (panel.bottom <= vh - MARGIN) return
    const below = vh - trigger.bottom - MARGIN * 2
    const above = trigger.top - MARGIN * 2
    if (above > below) {
      setStyle({
        top: 'auto',
        bottom: '100%',
        marginTop: 0,
        marginBottom: MARGIN,
        maxHeight: above,
        overflowY: panel.height > above ? 'auto' : undefined,
      })
    } else {
      setStyle({ maxHeight: below, overflowY: 'auto' })
    }
  }, [ref, open])
  return style
}
