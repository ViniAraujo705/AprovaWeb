Oi! Atualizamos a vitrine e o modo demo do frontend com a nova grade comercial abaixo. Para produção, precisamos que o backend/checkout reconheça o quarto plano e aplique esses limites no servidor (o front só usa `GET /plans/me` para exibir uso e trata o `403` que vocês devolverem).

| Plano | Preço mensal | Clientes ativos | Membros totais (inclui owner) | Vídeos/arquivos em aprovação por mês | Armazenamento |
|---|---:|---:|---:|---:|---:|
| `portfolio` | R$ 19 | 0 | 0 | 0 | 10 GB |
| `free` | R$ 0 | 1 | 1 | 10 | 5 GB |
| `pro` | R$ 69 | 8 | 3 | 100 | 100 GB |
| `agencia` | R$ 149 | 30 | 8 | 500 | 500 GB |

Recursos por plano:

- Todos: perfil/portfólio público. No `portfolio`, projetos no portfólio são ilimitados; no `free`, máximo 6; no `pro`/`agencia`, ilimitados.
- Solicitação de alterações e aprovação pelo cliente: `free`, `pro`, `agencia`.
- Gestão de gravações, gestão de entregas e área do cliente: `free` básica; `pro` e `agencia` completas.
- Calendário de conteúdo e disponibilizar conteúdo para postagem: `pro` e `agencia`.
- Relatórios: `pro` básicos; `agencia` avançados.
- Desempenho da equipe, prioridade de processamento e suporte prioritário: só `agencia`.

## Contrato necessário

1. Adicionar `portfolio` ao enum/plano de `Account`, ao admin e ao checkout da Asaas. Valores: `portfolio` R$ 19/mês ou R$ 192/ano; `pro` R$ 69/mês ou R$ 684/ano; `agencia` R$ 149/mês ou R$ 1.488/ano. O equivalente mensal no anual exibido ao cliente é R$ 16, R$ 57 e R$ 124, respectivamente.
2. `GET /plans/me` deve devolver o plano e os limites efetivos. Além dos campos atuais, precisamos destes campos para as permissões novas:

```json
{
  "plan": "portfolio | free | pro | agencia",
  "limits": {
    "maxClients": 0,
    "maxTeamMembers": 1,
    "maxApprovalFilesPerMonth": 10,
    "maxPortfolioProjects": 6,
    "storageGb": 5,
    "publicPortfolio": true,
    "changeRequests": true,
    "clientApproval": true,
    "recordingManagement": "none | basic | complete",
    "deliveryManagement": "none | basic | complete",
    "contentCalendar": false,
    "clientArea": "none | basic | complete",
    "publishContent": false,
    "reports": "none | basic | advanced",
    "teamPerformance": false,
    "priorityProcessing": false,
    "prioritySupport": false
  },
  "usage": {
    "clients": 0,
    "teamMembers": 1,
    "approvalFilesThisMonth": 0,
    "portfolioProjects": 0
  }
}
```

`null` continua significando ilimitado. Se preferirem manter `maxExtraEditors`/`videosThisMonth` por compatibilidade, tudo bem, mas os novos nomes acima não deixam ambíguo que a contagem de membros inclui o owner e que o limite mensal vale para vídeo **e** arquivo.

3. Aplicar a checagem no backend em cada criação/ação protegida e responder `403` com uma mensagem específica de upgrade. O frontend já abre o paywall ao receber esse status.

4. Confirmem, por favor, como serão tratados os recursos atuais de white label e perguntas de avaliação: eles não aparecem na nova tabela comercial, então não vamos inventar um acesso no frontend sem a regra de negócio definida.
