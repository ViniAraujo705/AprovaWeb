import { Suspense } from 'react'
import { UploadView } from '@/components/upload-view'

export default function UploadPage() {
  return (
    // UploadView usa useSearchParams (?projectId= do botão "Novo vídeo" na
    // tela do projeto) — o App Router exige um limite de Suspense em volta.
    <Suspense fallback={null}>
      <UploadView />
    </Suspense>
  )
}
