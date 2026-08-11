Oi! Pedido pequeno em cima do hub público de portfólio (`GET /public/portfolio-hub/:linkHub`, já especificado no `mensagem-backend-portfolios.md`).

## Contexto

Um cliente da agência (Hugo Haddad) pediu pra navegação do hub ganhar um passo a mais: hoje é `categoria → álbuns` direto; ele quer `categoria → foto/vídeo → álbuns`. Ex: categoria "Marketing de Moda" abre um filtro "Fotos" ou "Vídeos", e só depois aparecem os álbuns daquele cruzamento — em vez de precisar duplicar categorias tipo "Marketing de Moda — Fotos" e "Marketing de Moda — Vídeos" pra separar por tipo de mídia.

Já subi essa navegação no frontend (`components/public-portfolio-hub-view.tsx`), mas ela depende de saber se um álbum é predominantemente foto ou vídeo, e isso não existe hoje em `portfolios[]` dentro de `categorias[]` — só existe `tipoMidia` por item (`PortfolioItem`), não por álbum.

## O que precisa ser feito

Em cada objeto de `categorias[].portfolios[]` na resposta de `GET /public/portfolio-hub/:linkHub`, incluir um campo novo `tipoMidiaPredominante: "video" | "foto"` — o tipo de mídia majoritário entre os itens daquele álbum (maioria simples; em caso de empate, `"video"` como padrão). Não precisa mudar mais nada na resposta nem em nenhum outro endpoint.

## O que já está pronto no frontend

O `PortfolioHubItem` já tem o campo `mediaType` mapeado (`lib/services.ts`, `mapPortfolioHubItem`), lendo `tipoMidiaPredominante` (com fallback pra `mediaType`/`tipoMidia`, e `"video"` se nada vier — então nada quebra enquanto o campo não existe, só o passo de escolha foto/vídeo fica sempre pulado). Assim que o backend responder com esse campo, a navegação passa a funcionar de ponta a ponta sem nenhuma mudança adicional daqui.
