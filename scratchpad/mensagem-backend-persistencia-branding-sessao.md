Oi! Encontramos um problema de persistência do branding entre sessões/dispositivos.

## Comportamento observado

O owner salva logo e cor em `PATCH /users/me/branding` com sucesso. Enquanto a
sessão atual está aberta, a tela reflete a alteração. Ao sair e entrar de novo
(inclusive no mesmo computador), ou ao entrar em outro computador, a tela volta
sem logo/cor.

## Causa confirmada no contrato atual

O frontend substitui a sessão pelo objeto `user` retornado por:

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/select-account`
- `POST /account/invite/:token/accept`

Mas o `User` documentado nessas respostas não inclui branding, e não existe um
`GET /users/me` documentado para buscá-lo depois. Portanto o branding salvo no
banco não tem como ser reidratado em uma sessão nova.

## Ajuste solicitado

Por favor, retornem a marca da conta ativa em todos os retornos autenticados
acima. Formato preferido:

```json
{
  "user": {
    "id": "...",
    "nome": "Maria",
    "email": "maria@agencia.com",
    "teamRole": "owner",
    "branding": {
      "logoUrl": "https://... ou null",
      "corDestaque": "#1E90FF ou null",
      "nomeAgencia": "Agência Maria"
    }
  },
  "access_token": "..."
}
```

`branding: null` também é aceitável quando nada estiver configurado. Se
preferirem não ampliar o payload de autenticação, a alternativa é disponibilizar
`GET /users/me` autenticado com esses mesmos campos; o frontend o chamará na
hidratação da sessão.

Isso é necessário para manter a identidade visual em qualquer dispositivo.
