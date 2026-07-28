import { RatingQuestionsView } from '@/components/rating-questions-view'
import { RequireAuth } from '@/components/require-auth'

// Perguntas de avaliação são configuração da conta — exclusivas do owner.
export default function PerguntasPage() {
  return (
    <RequireAuth teamRole="owner">
      <RatingQuestionsView />
    </RequireAuth>
  )
}
