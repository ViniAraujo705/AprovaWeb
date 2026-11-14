import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = { title: `Política de Privacidade · ${LEGAL.product}` }

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt={LEGAL.updatedAt}>
      <p>
        Esta política explica quais dados o {LEGAL.product}
        {LEGAL.company !== LEGAL.product ? `, operado por ${LEGAL.company}` : ''}
        {LEGAL.cnpj ? ` (CNPJ ${LEGAL.cnpj})` : ''}, coleta, como usa e quais são os seus direitos, de acordo com a
        Lei Geral de Proteção de Dados (Lei 13.709/2018).
      </p>

      <h2>1. Quais dados coletamos</h2>
      <ul>
        <li>Dados de cadastro da agência e da equipe: nome, e-mail, foto de perfil e dados de cobrança.</li>
        <li>Conteúdo enviado: vídeos, imagens, legendas, comentários, avaliações e anotações.</li>
        <li>Dados dos clientes da agência cadastrados por ela (nome, contato) e comentários feitos nos links de aprovação.</li>
        <li>
          Ao conectar Instagram e Facebook: o identificador e o nome da sua conta do Facebook, as Páginas e contas
          profissionais do Instagram que você autorizar (identificador, nome, nome de usuário e foto) e os tokens de
          acesso concedidos pela Meta.
        </li>
        <li>Dados técnicos de uso: endereço IP, navegador e registros de acesso, para segurança e suporte.</li>
      </ul>

      <h2>2. Como usamos os dados</h2>
      <ul>
        <li>Prestar o serviço: aprovação de vídeos, calendário, notificações e relatórios.</li>
        <li>
          Publicar no Instagram e no Facebook somente o conteúdo que a agência agendou, no horário escolhido por ela,
          e mostrar o status e o link da publicação.
        </li>
        <li>Cobrança, suporte, segurança e cumprimento de obrigações legais.</li>
      </ul>
      <p>
        Os dados obtidos pelas APIs da Meta são usados apenas para essas finalidades. Não vendemos dados, não os
        usamos para publicidade e não os compartilhamos com terceiros, exceto com os provedores que operam a
        infraestrutura do serviço (hospedagem, banco de dados, armazenamento de arquivos, e-mail e pagamentos) e
        quando exigido por lei.
      </p>

      <h2>3. Armazenamento e segurança</h2>
      <p>
        Os dados ficam em servidores de provedores de nuvem. Os tokens de acesso da Meta e do Google são guardados
        criptografados (AES-256) e nunca são exibidos no navegador. O acesso é restrito à equipe de cada agência,
        conforme as permissões definidas por ela.
      </p>

      <h2>4. Por quanto tempo guardamos</h2>
      <p>
        Mantemos os dados enquanto a conta estiver ativa. Ao desconectar a Meta, os tokens e a lista de perfis são
        apagados na hora. Ao encerrar a conta, os dados são excluídos em até 30 dias, salvo o que a lei obriga a
        guardar.
      </p>

      <h2>5. Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados, e revogar consentimentos, a
        qualquer momento. Veja como excluir os dados da integração com a Meta em{' '}
        <a href="/exclusao-de-dados">Exclusão de dados</a>.
      </p>

      <h2>6. Contato</h2>
      <p>
        Dúvidas ou pedidos sobre privacidade: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>
    </LegalPage>
  )
}
