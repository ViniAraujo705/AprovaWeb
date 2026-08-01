/** Toca um som curto. Falha silenciosa se o navegador bloquear autoplay (sem interação prévia do usuário). */
function playSound(src: string, volume = 0.6) {
  try {
    const audio = new Audio(src)
    audio.volume = volume
    void audio.play().catch(() => {})
  } catch {
    // ambiente sem suporte a Audio — ignora.
  }
}

/** Som tocado sempre que a tela de vídeo aprovado é exibida (cliente ou agência). */
export function playApproveSound() {
  playSound('/sounds/approve.mp3')
}
