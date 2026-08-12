Oi! Complemento do pedido anterior do calendário (`mensagem-backend-calendario-notificacao-equipe.md`) — mesma entidade `RecordingEvent` de lá, só adicionando dois campos que faltavam pra cobrir o pedido de "calendário operacional" (item 6 do briefing: gravações, captações, ensaios, reuniões, entregas, prazos, eventos e demandas internas, tudo na mesma agenda).

## Contexto

Até agora o calendário só representava "gravação". O frontend passou a tratar isso como uma agenda genérica com um campo de tipo — não muda nada do que já foi combinado (rotas, os outros campos, a lógica de `Crew`/notificação), só acrescenta:

## O que precisa ser feito

Na entidade `RecordingEvent` já especificada (`POST/PATCH /recording-events`), adicionar:

- `tipo`: enum `gravacao | captacao | ensaio | reuniao | entrega | prazo | evento | demanda_interna`, obrigatório, default `gravacao` (pra não quebrar os registros que já existirem sem esse campo).
- `demandaId` (FK pra `Demanda`, nullable) — presente só quando `tipo = demanda_interna` e o usuário optar por vincular a atividade a um card já existente do Kanban (`Demanda`, ver `mensagem-backend-demandas-genericas.md`). Sem validação forte necessária: se vier um id que não existe mais, tudo bem devolver `null` nesse campo em vez de dar erro.

Corpo de `POST/PATCH /recording-events` ganha só esses dois campos a mais:

```json
{
  "titulo": "Roteiro campanha de verão",
  "tipo": "demanda_interna",
  "dataInicio": "2026-08-14T12:00:00.000Z",
  "dataFim": null,
  "clienteId": "uuid",
  "equipeIds": ["uuid"],
  "demandaId": "uuid-da-demanda",
  "observacoes": "..."
}
```

E a resposta devolve `tipo` e `demandaId` do mesmo jeito, junto com `equipe` expandida (isso já estava no pedido anterior).

## O que já está pronto no frontend

`components/calendar-view.tsx` já manda `tipo`/`demandaId` no payload e já sabe renderizar ícone/cor por tipo, filtrar a grade e a exportação `.ics` por tipo, e travar título/cliente quando a atividade é vinculada a uma demanda. Roda liso contra fixtures no modo demo; assim que os campos existirem nas rotas já implementadas (ou quando implementarem, se ainda não fizeram), não precisa de mais nada daqui.

## Fora desse pedido (próximo passo, não bloqueia isso)

Sync automático com o Google Calendar (empurrar o compromisso pra agenda pessoal do profissional) exigiria OAuth2 + refresh token por conta — não é um campo a mais, é infra nova. Por enquanto a exportação `.ics` (import manual no Google/Apple/Outlook) cobre o caso de uso principal; quando fizer sentido priorizar OAuth, a gente conversa separado.

Qualquer dúvida no enum ou no formato, me chama.
