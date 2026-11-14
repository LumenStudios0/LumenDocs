import { inject, onScopeDispose, shallowRef, type InjectionKey } from 'vue'

interface DialogOptions {
  title?: string
  confirmText?: string
  danger?: boolean
  requiredText?: string
}
interface DialogRequest extends DialogOptions {
  id: symbol
  message: string
  resolve: (accepted: boolean) => void
}

export function createSiteDialog() {
  const current = shallowRef<DialogRequest | null>(null)
  function close(accepted = false) {
    const request = current.value
    current.value = null
    request?.resolve(accepted)
  }
  function ask(message: string, options: DialogOptions = {}) {
    close()
    return new Promise<boolean>(resolve => {
      current.value = { ...options, id: Symbol(), message, resolve }
    })
  }
  return { current, ask, close }
}

export const siteDialogKey: InjectionKey<ReturnType<typeof createSiteDialog>> = Symbol('site-dialog')

export function useSiteDialog() {
  const dialog = inject(siteDialogKey)
  if (!dialog) throw new Error('Website dialogs are not available in this layout.')
  let ownedRequest: symbol | undefined
  onScopeDispose(() => { if (dialog.current.value?.id === ownedRequest) dialog.close() })
  return {
    confirm(message: string, options?: DialogOptions) {
      const result = dialog.ask(message, options)
      ownedRequest = dialog.current.value?.id
      return result
    },
  }
}
