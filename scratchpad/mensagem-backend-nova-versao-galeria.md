Oi! Uma cliente reclamou que, ao subir uma nova versão de um vídeo, a versão antiga (com erro) continuou aparecendo na galeria pública junto com a nova — e a nova apareceu sem título. Rastreei os dois problemas e um deles depende de mudança aí no backend.

## Contexto

Quando uma agência sobe uma nova versão (`POST /videos/:id/new-version`), o vídeo antigo continua existindo no banco (histórico preservado, como já é o comportamento esperado) — só que ele **também continua aparecendo na galeria pública do projeto**, lado a lado com a nova versão, porque a rota da galeria não expõe o suficiente pro frontend saber que aquele vídeo foi substituído.

## O que precisa ser feito

**1. `GET /public/projects/:linkPublico` — incluir `id` e `videoPaiId` em cada item de `videos[]`**

Hoje a resposta é (documentada em `API.md`):
```json
"videos": [
  { "link": "64c7527a-...", "title": "video1.mp4", "posterUrl": "https://.../thumb.jpg", "status": "pendente", "statusProcessamento": "pronto", "versao": 1 }
]
```

Preciso que cada item também traga:
```json
{ "id": "uuid", "videoPaiId": null, ... resto igual ... }
```

Já é exatamente o mesmo shape que `GET /videos?project_id=` já devolve (`id`, `videoPaiId`) — é só espelhar os mesmos dois campos aqui. Com isso o frontend consegue esconder da galeria qualquer vídeo que já foi substituído por uma versão mais nova (mesma lógica que já funciona no dashboard interno da agência).

**2. Confirmar que `POST /videos/:id/new-version` sempre devolve `nomeArquivo` preenchido**

O título vazio na nova versão bate com o comportamento de `nomeArquivo` vindo `null`/`""` na resposta desse endpoint. Body que o frontend envia: `{ "urlStorage": "...", "nomeArquivo": "nome-do-arquivo.mp4" }` — o valor enviado deveria voltar preenchido na resposta (mesmo shape do `Video` que `POST /videos` já retorna). Se puder confirmar/testar esse caso específico (nova versão, não upload original), ajuda a descartar essa causa.

## O que já está pronto no frontend

Já ajustei o frontend pra esconder a versão antiga assim que esses dois campos chegarem (`id`/`videoPaiId` por vídeo na galeria) — não precisa de mais nada do meu lado, só a resposta trazendo os campos. Documentei o formato esperado no `API.md` (seção "Galeria pública do projeto"), marcado como pendente.

Qualquer dúvida sobre o payload, me chama.
