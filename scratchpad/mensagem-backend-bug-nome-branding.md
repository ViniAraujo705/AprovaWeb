Oi! Achei um bug testando a tela de marca da agência (`/configuracoes`) — passando aqui rapidinho.

## O bug

Salvando a marca da agência (logo/nome/cor) com o campo "Nome da agência" vazio, o `PATCH /users/me/branding` responde `400`:

```json
{ "message": "Dados invalidos enviados ao banco de dados" }
```

O body enviado nesse caso era:

```json
{ "logoUrl": null, "nome": null, "corDestaque": "#272754" }
```

Pelo formato do erro (parece um erro do Prisma passando direto, não uma validação normal de DTO), a suspeita é que `nome`/`nomeAgencia` seja uma coluna não-nullable e o `update` com `null` estoura na hora de gravar.

## O que já ajustei no front

De cara, já parei de mandar `nome` quando o campo está vazio (só envio quando tem valor não-vazio) — isso evita o erro na hora, então não tá bloqueando ninguém. Mas reparei que o `PATCH /users/me/branding` documentado no `API.md` só lista `{ logoUrl?, corDestaque? }` — `nome` nunca fez parte do contrato oficial dessa rota.

## O que preciso confirmar com vocês

`/users/me/branding` aceita atualizar o nome de exibição da agência (`nomeAgencia`) ou não?

- **Se aceita**: precisa aceitar `nome: null` sem quebrar (ou pelo menos não estourar erro de Prisma — pode simplesmente ignorar/manter o valor atual se preferirem não suportar "limpar" o nome). E dá pra atualizar o `API.md` incluindo `nome?` no body documentado, já que hoje ele não aparece lá.
- **Se não aceita**: me avisem que campo/rota é o correto pra agência trocar o nome de exibição (é o `nomeAgencia` da conta, não o `nome` do usuário dono) — a tela de configurações tem esse campo há um tempo e preciso saber se ele nunca funcionou de verdade ou se mudou de rota.

Não é bloqueante (já contornei no front), só queria fechar o contrato certinho.
