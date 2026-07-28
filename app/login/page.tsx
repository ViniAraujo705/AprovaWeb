import { Suspense } from 'react'
import { LoginView } from '@/components/login-view'
import { LoadingState } from '@/components/states'

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center">
          <LoadingState label="Carregando…" />
        </div>
      }
    >
      <LoginView />
    </Suspense>
  )
}
