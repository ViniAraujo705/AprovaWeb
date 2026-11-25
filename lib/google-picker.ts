/**
 * Google Picker: a janela oficial do Google para escolher arquivos do Drive.
 *
 * Com ela o app pede só o escopo `drive.file` (acesso apenas ao que o usuário
 * escolhe), que não é restrito na verificação do app OAuth do Google — ao
 * contrário de listar o Drive inteiro pela API (`drive.readonly`), que exige
 * auditoria de segurança paga.
 */
import type { GoogleDriveItem } from '@/lib/types'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: any
    google?: any
  }
}

let loading: Promise<void> | null = null

function loadPickerApi(): Promise<void> {
  if (window.google?.picker) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const done = () => window.gapi.load('picker', { callback: () => resolve(), onerror: reject })
    if (window.gapi) return done()
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.onload = done
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Drive.'))
    document.head.appendChild(script)
  }).catch((err) => {
    loading = null
    throw err
  })
  return loading
}

export function pickerConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY && process.env.NEXT_PUBLIC_GOOGLE_APP_ID)
}

/**
 * Abre o Picker e resolve com os itens escolhidos (lista vazia = cancelou).
 * `videoMimeTypes` restringe a vídeos (pastas só navegam); sem ele, pastas e
 * arquivos podem ser escolhidos.
 */
export async function openGooglePicker(opts: {
  accessToken: string
  title: string
  videoMimeTypes?: string[]
  parentId?: string
}): Promise<GoogleDriveItem[]> {
  await loadPickerApi()
  const gp = window.google.picker
  const view = new gp.DocsView(gp.ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(!opts.videoMimeTypes)
    .setMode(gp.DocsViewMode.LIST)
  if (opts.videoMimeTypes) view.setMimeTypes(opts.videoMimeTypes.join(','))
  if (opts.parentId) view.setParent(opts.parentId)

  return new Promise((resolve) => {
    const picker = new gp.PickerBuilder()
      .addView(view)
      .enableFeature(gp.Feature.MULTISELECT_ENABLED)
      .enableFeature(gp.Feature.SUPPORT_DRIVES)
      .setOAuthToken(opts.accessToken)
      .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY)
      .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID)
      .setLocale('pt-BR')
      .setTitle(opts.title)
      .setCallback((data: any) => {
        const action = data?.[gp.Response.ACTION]
        if (action === gp.Action.PICKED) {
          const docs: any[] = data[gp.Response.DOCUMENTS] ?? []
          resolve(
            docs.map((d) => {
              const mimeType = String(d[gp.Document.MIME_TYPE] ?? '')
              const size = Number(d.sizeBytes)
              return {
                id: String(d[gp.Document.ID]),
                name: String(d[gp.Document.NAME] ?? 'Arquivo do Drive'),
                mimeType,
                isFolder: mimeType === FOLDER_MIME,
                iconLink: d[gp.Document.ICON_URL] ?? null,
                webViewLink: d[gp.Document.URL] ?? null,
                sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
              }
            }),
          )
        } else if (action === gp.Action.CANCEL) {
          resolve([])
        }
      })
      .build()
    picker.setVisible(true)
  })
}
