Oi! Isso aqui não é um pedido de trabalho, é só um levantamento — surgiu uma conversa sobre deixar cada agência com uma URL própria (tipo `empresa.aprova.com`) pra reforçar a experiência white-label, e antes de desenhar qualquer coisa no front eu queria entender o que já existe (ou não) do lado de vocês.

## O que eu queria saber

**1. Infra/hosting**
Onde a API roda hoje (Vercel, EC2, Railway, outro)? Isso importa pra saber se dá pra usar wildcard domain gerenciado (tipo o suporte nativo da Vercel a `*.dominio.com`, com certificado automático) ou se teríamos que provisionar DNS/SSL wildcard na mão.

**2. Domínio**
Quem administra o DNS do `aprova.com` (ou o domínio que for usado em produção) hoje? Pra criar um registro wildcard (`*.aprova.com`) alguém do time precisa ter acesso ao registrador/provedor de DNS.

**3. Modelagem**
Hoje não existe nenhum campo tipo `slug`/`subdomain` no `Account` (nem no schema, nem em nenhuma rota documentada). Se isso avançar, a ideia seria a agência escolher um slug único (ex: `empresa`) guardado no `Account`, com validação de unicidade e uma lista de reservados (`www`, `api`, `admin`, `app`, etc). Isso é algo que faz sentido nascer no backend (schema + validação) ou vocês prefeririam outra abordagem?

**4. Resolução**
Pra cada request que chegar em `empresa.aprova.com`, o front vai precisar descobrir "isso é a conta X" antes de renderizar. Dava pra resolver de duas formas: (a) um endpoint público tipo `GET /public/accounts/by-subdomain/:slug` retornando só o necessário pro branding (nome/logo/cor), ou (b) já embutir isso nas rotas públicas existentes. Alguma preferência, ou é cedo demais pra decidir isso?

## O que eu NÃO estou pedindo agora

Não é pra ninguém implementar nada disso ainda — é só reconhecimento de terreno pra eu saber se, quando entrarmos nesse projeto de verdade, o gargalo maior vai ser infra (DNS/SSL) ou modelagem (schema/endpoint), e dimensionar certo.

Qualquer contexto que vocês já tiverem sobre isso ajuda bastante.
