export type AlertType = 'info' | 'warn' | 'battle' | 'success'

export class AlertBanner {
  private readonly el: HTMLElement
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastMessage = ''

  constructor(element: HTMLElement) {
    this.el = element
    this.el.hidden = true
  }

  show(message: string, type: AlertType = 'info', ttlMs = 6000): void {
    if (message === this.lastMessage && !this.el.hidden) return
    this.lastMessage = message
    this.el.textContent = message
    this.el.dataset.type = type
    this.el.hidden = false

    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.hide(), ttlMs)
  }

  hide(): void {
    this.el.hidden = true
    this.lastMessage = ''
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
