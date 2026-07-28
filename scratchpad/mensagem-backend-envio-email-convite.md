Oi! Ajustei o frontend do envio de convite de equipe e preciso de uma rota nova no backend pra fechar o fluxo.

## Contexto

Hoje, quando o owner convida um editor (`POST /account/invite`), o backend só cria o registro do convite e devolve o `inviteUrl` — nenhum e-mail é enviado de verdade. O frontend tinha um botão "Enviar por e-mail" que era só um link `mailto:`, abrindo o cliente de e-mail do próprio owner. Isso não funciona bem (depende de ter um app de e-mail configurado na máquina), então tirei o `mailto:` e troquei por um botão que chama o backend direto. Só falta o backend implementar a rota.

## O que precisa ser feito

**Nova rota: `POST /account/invite/:id/send-email`**

- **Auth:** `owner`, e só pode disparar e-mail de um convite que pertence à própria conta dele.
- **Body:** nenhum (o `:id` já identifica o convite).
- **O que faz:** manda um e-mail de verdade pro endereço do convite (`invite.email`), usando algum provedor transacional (Resend, SES, Postmark, o que for mais fácil de integrar aí). O e-mail precisa conter o `inviteUrl` (o mesmo link que já é devolvido em `POST /account/invite`) e um texto simples tipo:

  > Você foi convidado(a) para colaborar como editor na APROVA. Acesse o link abaixo para criar sua senha de acesso: `{inviteUrl}`

- **Respostas:**
  - `204` (ou `{ sent: true }`) em caso de sucesso.
  - `404` se o `:id` não existir ou não pertencer à conta do owner autenticado.
  - `409` (ou `400`) se o convite já foi aceito (`status !== 'invited'`) — não faz sentido reenviar.
  - Se o provedor de e-mail falhar, devolver `500`/`502` com o corpo de erro padrão que vocês já usam (o frontend já trata isso via `ApiError`).
- **Rate limit:** vale colocar um limite de reenvio por convite (ex: 1 a cada X segundos) pra evitar spam se o owner ficar clicando.

## O que já está pronto no frontend

- Botão "Enviar e-mail" na tela de Equipe chama essa rota e mostra loading / sucesso / erro.
- O link de convite continua disponível com botão "Copiar" como alternativa, caso o e-mail falhe ou caia em spam — então não tem pressa de remover isso, os dois convivem.

Documentei tudo isso também no `API.md` do repo do frontend, seção "Conta / equipe", se quiser conferir o formato exato esperado.

Qualquer dúvida sobre o formato do payload ou dos erros, me chama.
