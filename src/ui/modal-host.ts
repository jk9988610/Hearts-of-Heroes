export interface ModalPanelDef {
  id: string
  title: string
  element: HTMLElement
}

export class ModalHost {
  private readonly root: HTMLElement
  private readonly backdrop: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly bodyEl: HTMLElement
  private readonly closeBtn: HTMLButtonElement
  private openId: string | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.backdrop = root.querySelector('.modal-backdrop')!
    this.titleEl = root.querySelector('.modal-title')!
    this.bodyEl = root.querySelector('.modal-body')!
    this.closeBtn = root.querySelector('.modal-close')!

    this.closeBtn.addEventListener('click', () => this.close())
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close()
    })
    root.hidden = true
  }

  registerPanels(panels: ModalPanelDef[]): void {
    for (const panel of panels) {
      panel.element.hidden = true
      panel.element.dataset.modalPanel = panel.id
      this.bodyEl.appendChild(panel.element)
    }
  }

  open(panelId: string, title?: string): void {
    const panel = this.bodyEl.querySelector<HTMLElement>(`[data-modal-panel="${panelId}"]`)
    if (!panel) return

    for (const el of this.bodyEl.querySelectorAll<HTMLElement>('[data-modal-panel]')) {
      el.hidden = el !== panel
    }

    const defTitle = panel.dataset.modalTitle
    this.titleEl.textContent = title ?? defTitle ?? panelId
    this.openId = panelId
    this.root.hidden = false
  }

  close(): void {
    this.root.hidden = true
    this.openId = null
    for (const el of this.bodyEl.querySelectorAll<HTMLElement>('[data-modal-panel]')) {
      el.hidden = true
    }
  }

  isOpen(): boolean {
    return !this.root.hidden
  }

  getOpenId(): string | null {
    return this.openId
  }

  toggle(panelId: string, title?: string): void {
    if (this.openId === panelId) this.close()
    else this.open(panelId, title)
  }
}
