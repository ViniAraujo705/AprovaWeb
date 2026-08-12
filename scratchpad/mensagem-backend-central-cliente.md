Oi! Fechei no frontend uma central por cliente em `/clientes/:id`: ela reúne visão geral, projetos, conteúdos, aprovações, calendário e histórico. Projetos, vídeos e os eventos de calendário já são associados ao cliente; para fechar o recurso de verdade ainda faltam dois blocos no backend: arquivos operacionais e trilha de auditoria.

O calendário já tem um pedido separado e mais detalhado em `mensagem-backend-calendario-notificacao-equipe.md`, então não estou repetindo essas rotas aqui.

## 1. Histórico / auditoria do cliente

Hoje conseguimos mostrar apenas o momento em que um vídeo foi enviado (`Video.criadoEm`) e o status atual. Não há como mostrar o histórico real de aprovações, pedidos de ajuste, novas versões, comentários ou alterações operacionais.

Sugestão: uma tabela append-only `ClientActivity` (ou `AuditLog`, se já houver algo equivalente) escopada à conta.

Campos mínimos:

- `id`
- `contaId`/`agenciaId`
- `clienteId` (FK obrigatória para `Client`)
- `tipo`: `video_enviado | aprovacao_cliente | ajuste_solicitado | comentario_cliente | resposta_agencia | nova_versao | arquivo_enviado | arquivo_removido | nota_atualizada`
- `criadoEm`
- `atorTipo`: `cliente | owner | editor | sistema` (nullable para eventos antigos, se necessário)
- `atorNome` (nullable; snapshot de exibição)
- `videoId`, `projectId`, `arquivoId` (FKs nullable, conforme o evento)
- `descricao` (texto curto já pronto para exibir)
- `metadados` JSON (opcional, para timestamp do comentário, versão do vídeo, valores antes/depois etc.)

Rotas, para owner/editor e sempre restritas à própria conta:

| Método | Rota | Query | Resposta |
|---|---|---|---|
| `GET` | `/clients/:id/activity` | `cursor?`, `limit?` | `{ items: ClientActivity[], nextCursor?: string }` |

Ordenar por `criadoEm DESC`; `limit` pode ter default 30. O backend deve gravar os eventos automaticamente nas rotas já existentes — não queremos uma rota do frontend para criar auditoria manualmente.

Exemplo de item:

```json
{
  "id": "uuid",
  "tipo": "ajuste_solicitado",
  "criadoEm": "2026-08-12T18:00:00.000Z",
  "atorTipo": "cliente",
  "atorNome": "Marina, Bela Cosméticos",
  "descricao": "Solicitou ajustes em Reel — campanha de primavera",
  "videoId": "uuid-do-video",
  "projectId": "uuid-do-projeto",
  "arquivoId": null,
  "metadados": { "timestampVideo": 12.4 }
}
```

## 2. Arquivos operacionais do cliente

Além dos vídeos de aprovação, a agência precisa guardar briefing, contrato, referência, roteiro, logo e outros anexos internos ligados ao cliente. Esses arquivos nunca devem aparecer nos links públicos de aprovação.

Tabela sugerida: `ClientFile`.

- `id`, `contaId`/`agenciaId`, `clienteId`
- `nomeArquivo`, `urlStorage`, `mimeType`, `tamanhoBytes`
- `categoria` (string livre ou enum: `briefing | contrato | referencia | roteiro | outro`)
- `descricao` (nullable)
- `enviadoPorId` (nullable) e `criadoEm`

Rotas, para owner/editor:

| Método | Rota | Body / retorno |
|---|---|---|
| `GET` | `/clients/:id/files` | `ClientFile[]` |
| `POST` | `/clients/:id/files/upload-url` | `{ nomeArquivo, contentType }` → `{ uploadUrl, key, publicUrl, headers?, expiresIn }` |
| `POST` | `/clients/:id/files` | `{ nomeArquivo, urlStorage, mimeType, tamanhoBytes?, categoria?, descricao? }` → `ClientFile` |
| `PATCH` | `/clients/:id/files/:fileId` | `{ categoria?, descricao?, nomeArquivo? }` → `ClientFile` |
| `DELETE` | `/clients/:id/files/:fileId` | `204` e remover o objeto do storage |

O fluxo de upload pode seguir exatamente o padrão presigned URL já usado por vídeos e branding: solicitar URL → `PUT` direto no R2 → registrar o arquivo. Validar que `fileId` pertence ao `clienteId` e que ambos pertencem à conta do token.

## 3. Endpoint consolidado (opcional, para performance)

O frontend já consegue compor a central com `GET /clients/:id`, `GET /projects`, `GET /videos` e `GET /recording-events`. Não bloqueia o lançamento, mas uma rota dedicada reduziria requisições e agregaria os números no backend:

`GET /clients/:id/overview`

```json
{
  "cliente": { "id": "...", "nome": "Bela Cosméticos" },
  "resumo": {
    "projetos": 4,
    "conteudos": 18,
    "pendentesAprovacao": 3,
    "emAjuste": 2,
    "aprovados": 11,
    "gravacoesAgendadas": 2
  },
  "proximosEventos": [],
  "atividadeRecente": []
}
```

Pode ficar para uma segunda fase; com as duas seções anteriores o frontend continua funcionando sem essa rota.

## 4. CORS para desenvolvimento local

Ao testar o frontend local contra a Railway, `OPTIONS https://aprova-back-production.up.railway.app/api/auth/login` respondeu `204`, mas sem `Access-Control-Allow-Origin: http://localhost:3000`. O browser bloqueia a chamada antes de chegar ao login.

Para desenvolvimento, incluir em `CORS_ORIGIN`/allowlist pelo menos:

- `http://localhost:3000`
- `http://127.0.0.1:3000`

Se a API usa cookies em algum fluxo, manter `credentials: true` e não usar `*` como origem. No frontend local deixei um proxy temporário do Next como contorno, mas liberar essas origens deixa a integração direta mais simples.

Quando implementarem, atualizem o `API.md` (fonte de verdade do frontend) com os DTOs e exemplos de resposta. Qualquer dúvida no shape, me chamem.
