Oi! Pedido pequeno de ajuste no link do hub público de portfólio.

## Contexto

O `linkHub` (usado em `/portfolio/:linkHub`, gerado automaticamente na
primeira chamada de `GET /portfolio-profile`) está saindo com uma sequência
de caracteres aleatória, tipo `hub-x7k2m9p4` — enquanto o `link` de cada
portfólio individual (`/p/:link`) já sai bonito, baseado no nome do álbum
(ex: álbum "Fotos legais mac" vira `fotos-legais-mac`). Isso deixa o link
que a agência realmente compartilha (o hub, não o álbum) menos apresentável.

## O que precisa ser feito

Aplicar a mesma lógica de slug que já é usada pro `link` do portfólio
também na geração do `linkHub`: usar o nome da agência (`Branding.agencyName`
se a conta tiver marca própria configurada) ou o nome do usuário `owner`
como base, com um sufixo curto (número ou poucos caracteres) só em caso de
colisão com um slug já existente. Continua sendo gerado automaticamente na
primeira leitura de `GET /portfolio-profile`, como já é hoje — só muda o
algoritmo de geração do valor, não o fluxo.

Exemplo: agência "Brainer Media" → `linkHub: "brainer-media"` em vez de
algo tipo `hub-x7k2m9p4`.

## O que já está pronto no frontend

Nada a mudar — o frontend só exibe/copia o `linkHub` que vier da API
(`components/portfolios-view.tsx`), então qualquer formato novo já funciona
sem alteração nenhuma daqui.
