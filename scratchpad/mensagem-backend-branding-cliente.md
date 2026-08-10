Oi! Fechei no front a possibilidade de a agência configurar uma marca própria (logo + cor) por cliente, que sobrepõe a marca da agência nos links públicos desse cliente — pensando em agência white-label que revende a aprovação pro cliente final dela. Precisa de trabalho aí no backend pra ficar completo.

## Contexto

Hoje só existe marca no nível da agência (`User.branding`, via `/users/me/branding`), usada em todo link público. O pedido era deixar isso configurável por cliente também: quando a agência define uma marca própria pra um cliente específico, quem abre o link público (galeria de entrega do projeto, ou um álbum de portfólio marcado pra esse cliente) vê a logo/cor do cliente no lugar da marca da agência — sem precisar gerar nenhum arquivo (PDF/PNG), é só o link normal do sistema mostrando outra marca.

Já implementei tudo que dá pra fazer só no front: tipos, telas, chamadas de serviço e fixtures de modo demo (funciona ponta a ponta sem vocês, só que com dados fake). O que falta é 100% backend — os endpoints/campos novos não existem ainda.

## O que precisa ser feito

**1. `Client` ganha um `branding` opcional, igual o `User` já tem**

Novos endpoints, mesmo contrato de `/users/me/branding/logo-upload-url` e `PATCH /users/me/branding`, só que escopados ao cliente:

```
POST  /clients/:id/branding/logo-upload-url   { nomeArquivo, contentType } -> { uploadUrl, key, publicUrl, expiresIn }
PATCH /clients/:id/branding                   { logoUrl?, corDestaque? }   -> { logoUrl, corDestaque }
```

`contentType` aceito: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`. Presigned URL no mesmo fluxo de R2 que já existe pro branding da agência, só numa pasta separada (ou reaproveitando a mesma, tanto faz). `logoUrl: null` / `corDestaque: null` limpa o campo (volta a herdar da agência). Só `owner` pode chamar (mesma regra do branding da agência).

E o `GET /clients/:id` / `GET /clients` / `PATCH /clients/:id` passam a incluir esse campo no `Client`:

```json
{ "id": "...", "nome": "...", "email": "...", "branding": { "logoUrl": "https://...", "corDestaque": "#d6336c" } }
```

`branding: null` quando o cliente não tem marca própria configurada (caso mais comum).

**2. `Portfolio` ganha `clienteId` opcional**

Só em `PATCH /portfolios/:id` (não em `POST` — todo álbum novo nasce sem cliente, como vitrine geral):

```
PATCH /portfolios/:id   { ..., clienteId?: "uuid" | null }
```

É só pra "etiquetar" um álbum específico como personalizado pra um cliente (ex: vocês fazem uma seleção de cases pra apresentar de novo pra um prospect/cliente específico, com a marca dele). Não tem nada a ver com o dono/criador do portfólio nem restringe quem vê o link — é só sinalização de marca.

**3. `GET /public/projects/:linkPublico` — incluir `cliente.branding`**

Resposta hoje já traz `cliente: { nome }`. Precisa passar a trazer também:

```json
"cliente": { "nome": "Cliente X", "branding": { "logoUrl": "https://...", "corDestaque": "#d6336c" } }
```

`branding` nesse `cliente` é o mesmo objeto do item 1 (`{ logoUrl, corDestaque } | null`). Todo projeto já tem `clientId`, então isso é literalmente incluir o branding do cliente que já é buscado pra pegar o `nome`.

**4. `GET /public/portfolios/:linkPublico` — incluir `cliente.branding` quando o álbum estiver marcado**

Essa rota (pendente à parte, já documentada) precisa incluir:

```json
"cliente": { "branding": { "logoUrl": "https://...", "corDestaque": "#d6336c" } }
```

só quando o portfólio tiver `clienteId` setado (item 2) **e** esse cliente tiver `branding` configurado — senão omite o campo (ou `null`). Importante: aqui **não** exponham `cliente.nome` nem `cliente.id`, só o `branding` — essa rota é a vitrine pública, não deve revelar pra quem o álbum foi personalizado, só mudar a marca visual.

## O que já está pronto no frontend

- `Client.branding` e a tela de edição (upload de logo + seletor de cor) já estão prontos em `/clientes/:id`, chamando os dois endpoints do item 1 — só falta eles existirem de verdade.
- `Portfolio.clienteId` e o seletor de cliente na tela de edição do portfólio já estão prontos, mandando `clienteId` no `PATCH /portfolios/:id`.
- A lógica de merge (marca do cliente sobrepõe a da agência campo a campo — só logo, só cor, ou os dois, com fallback pro que não estiver setado) já está implementada e é usada tanto na galeria pública do projeto quanto na página pública do portfólio.
- Modo demo já simula tudo isso (um cliente de exemplo já vem com marca própria pra dar pra testar visualmente sem vocês).
- Documentei os contratos esperados no `API.md` (seções "Clientes", "Portfólios", "Galeria pública do projeto" e "Portfólio público"), tudo marcado como `[ PENDENTE NO BACKEND ]`.

Deixei o calendário de fora por enquanto — ficou só pra depois.

Qualquer dúvida sobre os payloads, me chama.
