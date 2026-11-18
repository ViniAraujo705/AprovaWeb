import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = { title: `Termos de Uso · ${LEGAL.product}` }

export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt={LEGAL.updatedAt}>
      <p>
        Estes termos regem o uso do {LEGAL.product}
        {LEGAL.company !== LEGAL.product ? `, operado por ${LEGAL.company}` : ''}
        {LEGAL.cnpj ? ` (CNPJ ${LEGAL.cnpj})` : ''}, plataforma para agências organizarem demandas, enviarem vídeos e
        receberem a aprovação dos seus clientes. Ao criar uma conta ou usar o serviço, você concorda com eles.
      </p>

      <h2>1. Conta</h2>
      <ul>
        <li>Você é responsável pelos dados informados no cadastro e por manter sua senha em sigilo.</li>
        <li>
          O dono da conta da agência controla quem faz parte da equipe e o que cada pessoa pode acessar, e responde
          pelo uso feito por ela.
        </li>
      </ul>

      <h2>2. Conteúdo</h2>
      <ul>
        <li>
          Vídeos, imagens, comentários e demais materiais enviados continuam sendo da agência e dos seus clientes. Você
          nos autoriza a armazená-los e exibi-los apenas para prestar o serviço.
        </li>
        <li>
          Você garante que tem os direitos sobre o conteúdo enviado e que ele não viola a lei nem direitos de
          terceiros.
        </li>
      </ul>

      <h2>3. Integrações</h2>
      <p>
        As integrações com Google (Agenda e Drive) e Meta (Instagram e Facebook) são opcionais e só funcionam depois
        que você as autoriza. O uso dos dados obtidos por elas está descrito na{' '}
        <a href="/privacidade">Política de Privacidade</a>. Você pode desconectá-las a qualquer momento.
      </p>

      <h2>4. Uso aceitável</h2>
      <p>
        Não é permitido usar o {LEGAL.product} para enviar conteúdo ilegal, tentar acessar dados de outras contas,
        sobrecarregar ou interferir no funcionamento do serviço.
      </p>

      <h2>5. Planos e pagamento</h2>
      <p>
        Planos pagos são cobrados conforme o plano escolhido, nas condições mostradas na contratação. Você pode
        cancelar a renovação a qualquer momento.
      </p>

      <h2>6. Disponibilidade e responsabilidade</h2>
      <p>
        Trabalhamos para manter o serviço disponível e os dados seguros, mas ele é fornecido no estado em que se
        encontra, podendo passar por manutenções e falhas eventuais. Não respondemos por danos indiretos decorrentes do
        uso ou da indisponibilidade do serviço, nos limites permitidos pela lei.
      </p>

      <h2>7. Encerramento</h2>
      <p>
        Você pode encerrar sua conta quando quiser. Podemos suspender contas que violem estes termos. Após o
        encerramento, os dados são excluídos conforme a <a href="/privacidade">Política de Privacidade</a>.
      </p>

      <h2>8. Alterações e contato</h2>
      <p>
        Podemos atualizar estes termos; a data no topo indica a última versão. Dúvidas:{' '}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>
    </LegalPage>
  )
}
