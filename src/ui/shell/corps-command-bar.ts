export interface CorpsCommandBarCallbacks {
  onTrain: () => void
  onDefend: () => void
  onCancelMarch: () => void
  getCorpsLabel: () => string
}

export class CorpsCommandBar {
  private readonly el: HTMLElement
  private readonly labelEl: HTMLElement
  private readonly callbacks: CorpsCommandBarCallbacks

  constructor(host: HTMLElement, callbacks: CorpsCommandBarCallbacks) {
    this.el = host
    this.callbacks = callbacks
    this.labelEl = host.querySelector('.corps-cmd-label')!

    host.querySelector('[data-cmd="train"]')?.addEventListener('click', () => {
      this.callbacks.onTrain()
    })
    host.querySelector('[data-cmd="defend"]')?.addEventListener('click', () => {
      this.callbacks.onDefend()
    })
    host.querySelector('[data-cmd="cancel-march"]')?.addEventListener('click', () => {
      this.callbacks.onCancelMarch()
    })
  }

  show(): void {
    this.el.hidden = false
    this.labelEl.textContent = this.callbacks.getCorpsLabel()
  }

  hide(): void {
    this.el.hidden = true
  }

  refresh(): void {
    if (!this.el.hidden) {
      this.labelEl.textContent = this.callbacks.getCorpsLabel()
    }
  }
}
