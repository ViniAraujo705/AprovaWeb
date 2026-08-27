'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bold,
  Check,
  CheckSquare2,
  ImagePlus,
  List,
  PencilLine,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type CheckDayItem = {
  id: string
  text: string
  checked: boolean
  kind: 'check' | 'bullet'
}

type CheckDayNote = {
  id: string
  title: string
  body: string
  items: CheckDayItem[]
  imageUrl?: string
  updatedAt: string
}

const STORAGE_KEY = 'aprova_checkday_notes'

const INITIAL_NOTES: CheckDayNote[] = [
  {
    id: 'today',
    title: 'Tarefas de hoje',
    body: 'Prioridades para fechar antes do fim do dia.',
    updatedAt: 'agora',
    items: [
      { id: 'briefing', text: 'Revisar briefing da campanha', checked: true, kind: 'check' },
      { id: 'edits', text: 'Enviar ajustes do vídeo institucional', checked: true, kind: 'check' },
      { id: 'meeting', text: 'Confirmar reunião com a Bela', checked: true, kind: 'check' },
      { id: 'calendar', text: 'Organizar calendário de setembro', checked: false, kind: 'check' },
      { id: 'invoices', text: 'Conferir notas fiscais pendentes', checked: false, kind: 'check' },
    ],
  },
  {
    id: 'ideas',
    title: 'Ideias de conteúdo',
    body: 'Ganchos e referências para os próximos vídeos.',
    updatedAt: 'hoje',
    items: [
      { id: 'idea-1', text: 'Bastidores da produção em formato curto', checked: false, kind: 'bullet' },
      { id: 'idea-2', text: 'Antes e depois da edição', checked: false, kind: 'bullet' },
    ],
  },
  {
    id: 'bela',
    title: 'Reunião Bela Cosméticos',
    body: 'Pontos para alinhar com a equipe da marca.',
    updatedAt: 'ontem',
    items: [
      { id: 'bela-1', text: 'Definir tom da campanha', checked: false, kind: 'check' },
      { id: 'bela-2', text: 'Validar cronograma de gravação', checked: false, kind: 'check' },
    ],
  },
  {
    id: 'passwords',
    title: 'Senhas e acessos',
    body: 'Acessos da equipe e ferramentas de trabalho.',
    updatedAt: '12 ago.',
    items: [],
  },
]

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function persistedNotes(): CheckDayNote[] {
  if (typeof window === 'undefined') return INITIAL_NOTES
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as CheckDayNote[]) : INITIAL_NOTES
  } catch {
    return INITIAL_NOTES
  }
}

function notePreview(note: CheckDayNote) {
  const checks = note.items.filter((item) => item.kind === 'check')
  if (checks.length) return `${checks.filter((item) => item.checked).length} de ${checks.length} concluídas · ${note.updatedAt}`
  return note.body || 'Nota vazia'
}

export function CheckDayView() {
  const [notes, setNotes] = useState<CheckDayNote[]>(INITIAL_NOTES)
  const [hydrated, setHydrated] = useState(false)
  const [selectedId, setSelectedId] = useState(INITIAL_NOTES[0].id)
  const [search, setSearch] = useState('')
  const [bold, setBold] = useState(false)

  useEffect(() => {
    const saved = persistedNotes()
    setNotes(saved)
    setSelectedId(saved[0]?.id ?? '')
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }, [hydrated, notes])

  const selectedNote = notes.find((note) => note.id === selectedId) ?? notes[0]
  const filteredNotes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    if (!term) return notes
    return notes.filter((note) => `${note.title} ${note.body} ${note.items.map((item) => item.text).join(' ')}`.toLocaleLowerCase('pt-BR').includes(term))
  }, [notes, search])

  function updateNote(id: string, update: Partial<CheckDayNote>) {
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, ...update, updatedAt: 'agora' } : note)))
  }

  function createNote() {
    const note: CheckDayNote = { id: id(), title: 'Nova nota', body: '', items: [], updatedAt: 'agora' }
    setNotes((current) => [note, ...current])
    setSelectedId(note.id)
  }

  function deleteNote() {
    if (!selectedNote) return
    setNotes((current) => {
      const next = current.filter((note) => note.id !== selectedNote.id)
      setSelectedId(next[0]?.id ?? '')
      return next
    })
  }

  function addItem(kind: CheckDayItem['kind']) {
    if (!selectedNote) return
    updateNote(selectedNote.id, {
      items: [...selectedNote.items, { id: id(), text: kind === 'check' ? 'Novo item' : 'Novo tópico', checked: false, kind }],
    })
  }

  function addImage() {
    if (!selectedNote) return
    const url = window.prompt('Cole a URL da imagem')?.trim()
    if (url) updateNote(selectedNote.id, { imageUrl: url })
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mb-5">
        <h1 className="font-display text-4xl tracking-wide sm:text-5xl">CHECKDAY</h1>
        <p className="mt-1 text-sm text-muted-foreground">Notas, listas e prioridades do seu dia.</p>
      </div>

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] shadow-2xl shadow-black/20 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-[#2a2a2a] bg-[#111] p-3 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-1 pb-3">
            <h2 className="text-base font-semibold text-[#f5f5f0]">CheckDay</h2>
            <button type="button" onClick={createNote} aria-label="Nova nota" title="Nova nota" className="grid size-8 place-items-center rounded-lg bg-[#1e1e1e] text-[#f5f5f0] transition-colors hover:bg-[#2a2a2a]">
              <PencilLine className="size-4" />
            </button>
          </div>
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#6a6a66]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="buscar nota..." className="h-9 w-full rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] pl-8 pr-3 text-xs text-[#f5f5f0] outline-none placeholder:text-[#6a6a66] focus:border-[#565656]" />
          </label>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {filteredNotes.map((note) => {
              const checks = note.items.filter((item) => item.kind === 'check')
              const isActive = note.id === selectedNote?.id
              return (
                <button key={note.id} type="button" onClick={() => setSelectedId(note.id)} className={cn('w-full rounded-xl px-3 py-2.5 text-left transition-colors', isActive ? 'bg-[#222]' : 'hover:bg-[#1a1a1a]')}>
                  <div className="flex items-center gap-2">
                    {checks.length > 0 && <span className={cn('size-1.5 shrink-0 rounded-full', checks.every((item) => item.checked) ? 'bg-[#1D9E75]' : 'bg-[#E0983F]')} />}
                    <p className="min-w-0 truncate text-sm font-semibold text-[#f5f5f0]">{note.title || 'Sem título'}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#8a8a86]">{notePreview(note)}</p>
                </button>
              )
            })}
            {filteredNotes.length === 0 && <p className="px-3 py-6 text-center text-xs text-[#6a6a66]">Nenhuma nota encontrada.</p>}
          </div>
        </aside>

        {selectedNote ? (
          <article className="flex min-w-0 flex-col bg-[#0d0d0d]">
            <div className="flex items-center gap-1 border-b border-[#1e1e1e] px-4 py-2.5 sm:px-6">
              <ToolbarButton label="Adicionar checklist" onClick={() => addItem('check')}><CheckSquare2 className="size-4" /></ToolbarButton>
              <ToolbarButton label="Adicionar lista" onClick={() => addItem('bullet')}><List className="size-4" /></ToolbarButton>
              <ToolbarButton label="Negrito" active={bold} onClick={() => setBold((value) => !value)}><Bold className="size-4" /></ToolbarButton>
              <ToolbarButton label="Inserir imagem" onClick={addImage}><ImagePlus className="size-4" /></ToolbarButton>
              <div className="flex-1" />
              <ToolbarButton label="Excluir nota" destructive onClick={deleteNote}><Trash2 className="size-4" /></ToolbarButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              <input value={selectedNote.title} onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })} aria-label="Título da nota" className="w-full bg-transparent text-xl font-semibold text-[#f5f5f0] outline-none placeholder:text-[#6a6a66]" placeholder="Título" />
              <p className="mt-1 text-xs text-[#6a6a66]">editado {selectedNote.updatedAt} · hoje</p>
              <textarea value={selectedNote.body} onChange={(event) => updateNote(selectedNote.id, { body: event.target.value })} rows={2} placeholder="Comece a escrever..." className={cn('mt-6 w-full resize-none bg-transparent text-sm leading-6 text-[#c9c9c3] outline-none placeholder:text-[#6a6a66]', bold && 'font-bold')} />
              {selectedNote.imageUrl && <img src={selectedNote.imageUrl} alt="Imagem da nota" className="mt-3 max-h-64 rounded-xl border border-[#2a2a2a] object-cover" />}
              <div className="mt-3 space-y-1">
                {selectedNote.items.map((item) => (
                  <div key={item.id} className="group flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-[#151515]">
                    {item.kind === 'check' ? (
                      <button type="button" onClick={() => updateNote(selectedNote.id, { items: selectedNote.items.map((current) => current.id === item.id ? { ...current, checked: !current.checked } : current) })} aria-label={item.checked ? `Desmarcar ${item.text}` : `Concluir ${item.text}`} className={cn('grid size-5 shrink-0 place-items-center rounded-md border transition-colors', item.checked ? 'border-[#1D9E75] bg-[#1D9E75] text-white' : 'border-[#565656] hover:border-[#8a8a86]')}>
                        {item.checked && <Check className="size-3.5 stroke-[3]" />}
                      </button>
                    ) : <span className="ml-1 size-1.5 shrink-0 rounded-full bg-[#8a8a86]" />}
                    <input value={item.text} onChange={(event) => updateNote(selectedNote.id, { items: selectedNote.items.map((current) => current.id === item.id ? { ...current, text: event.target.value } : current) })} className={cn('min-w-0 flex-1 bg-transparent text-sm text-[#f5f5f0] outline-none', item.checked && 'text-[#8a8a86] line-through')} />
                    <button type="button" onClick={() => updateNote(selectedNote.id, { items: selectedNote.items.filter((current) => current.id !== item.id) })} aria-label={`Remover ${item.text}`} className="invisible grid size-7 place-items-center rounded-md text-[#6a6a66] hover:bg-[#222] hover:text-[#f5f5f0] group-hover:visible"><Plus className="size-4 rotate-45" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addItem('check')} className="mt-5 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-[#8a8a86] hover:bg-[#1e1e1e] hover:text-[#f5f5f0]"><Plus className="size-3.5" /> Adicionar item</button>
            </div>
          </article>
        ) : (
          <div className="grid min-h-80 place-items-center bg-[#0d0d0d] text-sm text-[#6a6a66]">
            <button type="button" onClick={createNote} className="rounded-lg bg-[#1e1e1e] px-4 py-2 text-[#f5f5f0] hover:bg-[#2a2a2a]">Criar primeira nota</button>
          </div>
        )}
      </section>
    </div>
  )
}

function ToolbarButton({ children, label, onClick, active, destructive }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean; destructive?: boolean }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={cn('grid size-8 place-items-center rounded-lg text-[#8a8a86] transition-colors hover:bg-[#1e1e1e] hover:text-[#f5f5f0]', active && 'bg-[#222] text-[#f5f5f0]', destructive && 'hover:text-red-400')}>{children}</button>
}
