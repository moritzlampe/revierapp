export interface ToastDetail {
  message: string
  type: 'success' | 'warning' | 'info'
  subtext?: string
}

export function showToast(message: string, type: ToastDetail['type'] = 'success', subtext?: string) {
  window.dispatchEvent(new CustomEvent('quickhunt:toast', {
    detail: { message, type, subtext } satisfies ToastDetail,
  }))
}
