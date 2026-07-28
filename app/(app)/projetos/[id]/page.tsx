import { ProjectDetailView } from '@/components/project-detail-view'

export default async function ProjetoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProjectDetailView id={id} />
}
