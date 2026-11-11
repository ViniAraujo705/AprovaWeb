'use client'

/**
 * Relatórios (/relatorios) — owner-only. Duas abas: Produtividade
 * (`components/productivity-report.tsx`, tudo calculado no backend em
 * GET /reports/productivity) e Avaliações (`components/ratings-report.tsx`).
 * `?aba=avaliacoes` abre direto na aba de avaliações.
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { RatingsReportView } from '@/components/ratings-report'
import { ProductivityReport } from '@/components/productivity-report'

type ReportTab = 'produtividade' | 'avaliacoes'

const REPORT_TABS: { value: ReportTab; label: string }[] = [
  { value: 'produtividade', label: 'Produtividade' },
  { value: 'avaliacoes', label: 'Avaliações' },
]

export function ReportsView() {
  const [tab, setTab] = useState<ReportTab>('produtividade')

  // `?aba=avaliacoes` abre direto na aba de avaliações (link de outras telas).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('aba') === 'avaliacoes') setTab('avaliacoes')
  }, [])

  function changeTab(next: ReportTab) {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === 'avaliacoes') url.searchParams.set('aba', 'avaliacoes')
    else url.searchParams.delete('aba')
    window.history.replaceState(window.history.state, '', url)
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Equipe e resultados"
        title="Relatórios"
        description={
          tab === 'produtividade'
            ? 'Ritmo de entregas, tempo de aprovação, prazos, clientes e equipe.'
            : 'Notas que os clientes deram às entregas — inclusive de projetos já excluídos.'
        }
      />

      <div role="tablist" aria-label="Tipo de relatório" className="mt-6 flex gap-2 border-b border-border print:hidden">
        {REPORT_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => changeTab(t.value)}
            className={cn(
              '-mb-px min-h-12 border-b-2 px-4 text-sm font-medium transition-colors',
              tab === t.value
                ? 'border-selected font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'produtividade' ? <ProductivityReport onOpenRatings={() => changeTab('avaliacoes')} /> : <RatingsReportView />}
    </div>
  )
}

