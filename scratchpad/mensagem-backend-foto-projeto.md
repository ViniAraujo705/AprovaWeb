# Foto do projeto (`Project.fotoUrl`) — precisa de campo + rota de upload

Oi! Subi no front a possibilidade de dar uma **foto pro projeto** (miniatura
que aparece no card da lista `/projetos`, no cabeçalho do projeto e na lista de
projetos dentro do cliente). É interno — a galeria pública do cliente
(`/g/:linkPublico`) **não** muda em nada, não precisa expor isso lá.

O front já está pronto e mandando os campos abaixo. Como nada disso existe
ainda, hoje o fluxo termina em erro na hora de salvar a foto (o projeto é
criado normalmente, só a foto não persiste).

## O que preciso

### 1. Campo `fotoUrl` no `Project`

Nullable, string (URL pública do R2). Precisa vir em `GET /projects`,
`GET /projects/:id` e no retorno de `POST`/`PATCH`.

O front lê a resposta de forma defensiva — aceita `fotoUrl`, `foto_url`,
`photoUrl` ou `imagemUrl` —, então o nome que vocês preferirem funciona. O que
o front **envia** é `fotoUrl`.

### 2. `PATCH /projects/:id` aceitando `fotoUrl`

```
PATCH /projects/:id
{ "nome"?: "...", "clientId"?: "...", "fotoUrl"?: "https://.../foto.jpg" | null }
```

`fotoUrl: null` = remover a foto. Campo ausente = não mexe (o front só manda a
chave quando ela mudou).

### 3. `POST /projects/:id/photo-upload-url` (novo)

Mesmo contrato de 2 passos de `POST /clients/:id/photo-upload-url` — sem
terceiro passo de confirmação: a `publicUrl` que voltar aqui é enviada direto
no `PATCH` acima.

```
POST /projects/:id/photo-upload-url
{ "nomeArquivo": "foto.jpg", "contentType": "image/jpeg" }

200 → { "uploadUrl": "...", "key": "...", "publicUrl": "...", "expiresIn": 600 }
```

`contentType` aceita `image/png`, `image/jpeg`, `image/webp`. O front recorta a
imagem em 1:1 e comprime pra JPEG de 480px antes de subir, então o arquivo que
chega no R2 é pequeno (dezenas de KB) — não precisa de limite generoso.

## Permissão

Hoje o front só oferece criar projeto e trocar a foto pro **owner** (editor
passou a só selecionar projeto existente, ver mudança recente). Mas não
dependo disso: se `PATCH /projects/:id` e a rota nova continuarem liberadas
pra `owner` + `editor` como o resto de `/projects`, está ótimo.

## Ordem das chamadas (pra ficar claro no log de vocês)

Como a presigned URL é escopada no id do projeto, criar um projeto **com** foto
vira 3 chamadas em sequência:

1. `POST /projects { nome, clientId }` → pega o `id`
2. `POST /projects/:id/photo-upload-url` → `PUT` direto no R2
3. `PATCH /projects/:id { fotoUrl: publicUrl }`

Se preferirem um endpoint não escopado (`POST /projects/photo-upload-url`) pra
o front subir a foto **antes** de criar o projeto e já mandar `fotoUrl` no
`POST /projects`, eu troco — só me avisem. Fui pelo escopado porque é o padrão
de todas as outras rotas de imagem de vocês.

## Urgência

Baixa — é um acréscimo visual, nada quebra sem isso. Só o botão de foto fica
sem efeito até vocês subirem.
