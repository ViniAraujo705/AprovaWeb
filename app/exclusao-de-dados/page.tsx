import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = { title: `Exclusão de dados · ${LEGAL.product}` }

/**
 * URL de instruções de exclusão de dados exigida pela Meta. Quando a pessoa
 * remove o app no Facebook, a Meta chama POST /integrations/meta/data-deletion
 * no backend, que apaga a conexão na hora e devolve este endereço com
 * `?codigo=` para ela acompanhar.
 */
export default async function ExclusaoDeDadosPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>
}) {
  const { codigo } = await searchParams
  return (
    <LegalPage title="Exclusão de dados" updatedAt={LEGAL.updatedAt}>
      {codigo && (
        <div className="rounded-2xl border border-border bg-success-soft p-4 text-success-ink">
          <p className="font-semibold">Pedido de exclusão concluído.</p>
          <p className="mt-1 text-sm">
            Os dados da sua conta do Facebook e do Instagram foram removidos do {LEGAL.product}. Código de
            confirmação: <span className="font-mono font-semibold">{codigo}</span>
          </p>
        </div>
      )}

      <p>
        Você pode apagar a qualquer momento os dados que o {LEGAL.product} recebeu da Meta (Facebook e Instagram).
        Escolha uma das formas abaixo.
      </p>

      <h2>Pelo Check</h2>
      <p>
        Entre na sua conta, abra <strong>Configurações → Integrações</strong> e clique em <strong>Desconectar</strong>{' '}
        no card “Instagram e Facebook”. Apagamos na hora os tokens de acesso e a lista de Páginas e perfis do
        Instagram, revogamos a permissão na Meta e cancelamos as publicações que ainda não saíram.
      </p>

      <h2>Pelo Facebook</h2>
      <p>
        No Facebook, vá em <strong>Configurações e privacidade → Configurações → Integrações comerciais</strong> (ou
        “Apps e sites”), encontre o {LEGAL.product} e clique em <strong>Remover</strong>. A Meta nos avisa e apagamos
        os mesmos dados automaticamente.
      </p>

      <h2>Por e-mail</h2>
      <p>
        Escreva para <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> com o e-mail da sua conta pedindo a exclusão.
        Respondemos em até 15 dias. Para excluir a conta inteira do {LEGAL.product}, use o mesmo e-mail.
      </p>

      <p className="text-sm text-muted-foreground">
        As publicações que já foram ao ar ficam no Instagram e no Facebook. Para removê-las, apague direto nas redes.
        Mais detalhes na <a href="/privacidade">Política de Privacidade</a>.
      </p>
    </LegalPage>
  )
}
