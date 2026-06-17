const COLS_PER_ROW = 4
const LONG_PRESS_MS = 500

export interface StandbyCorps {
  id: string
  label: string
  tileName: string
}

export interface CorpsBarCallbacks {
  onNewCorps: (tileName: string) => void
  onStandbyClick: (corps: StandbyCorps) => void
  onStandbyLongPress: (corps: StandbyCorps) => void
  canCreateCorps: () => boolean
  getSelectedTileName: () => string | null
}

export class CorpsBar {
  private readonly gridEl: HTMLElement
  private readonly callbacks: CorpsBarCallbacks
  private standby: StandbyCorps[] = []
  private nextId = 1
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressFired = false

  constructor(callbacks: CorpsBarCallbacks, gridEl: HTMLElement) {
    this.callbacks = callbacks
    this.gridEl = gridEl
    this.render()
  }

  addStandby(tileName: string): void {
    const id = `standby_${this.nextId++}`
    this.standby.push({
      id,
      label: `将军队·待命${this.standby.length + 1}`,
      tileName,
    })
    this.render()
  }

  getStandbyList(): StandbyCorps[] {
    return [...this.standby]
  }

  private render(): void {
    this.gridEl.innerHTML = ''
    const rows: StandbyCorps[][] = []
    for (let i = 0; i < this.standby.length; i += COLS_PER_ROW) {
      rows.push(this.standby.slice(i, i + COLS_PER_ROW))
    }

    const lastRow = rows[rows.length - 1]
    const lastRowFull = lastRow && lastRow.length >= COLS_PER_ROW

    if (lastRowFull) {
      const newRow = document.createElement('div')
      newRow.className = 'corps-row'
      newRow.appendChild(this.createNewBtn())
      this.gridEl.appendChild(newRow)
    }

    for (const row of rows) {
      const rowEl = document.createElement('div')
      rowEl.className = 'corps-row'
      for (const corps of [...row].reverse()) {
        rowEl.appendChild(this.createStandbyBtn(corps))
      }
      if (row === lastRow && !lastRowFull) {
        rowEl.appendChild(this.createNewBtn())
      }
      this.gridEl.appendChild(rowEl)
    }

    if (rows.length === 0) {
      const rowEl = document.createElement('div')
      rowEl.className = 'corps-row'
      rowEl.appendChild(this.createNewBtn())
      this.gridEl.appendChild(rowEl)
    }
  }

  private createNewBtn(): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'corps-btn corps-btn-new'
    btn.textContent = '新编军队'
    btn.disabled = !this.callbacks.canCreateCorps()
    btn.addEventListener('click', () => {
      const name = this.callbacks.getSelectedTileName()
      if (!name) return
      this.callbacks.onNewCorps(name)
      this.addStandby(name)
    })
    return btn
  }

  private createStandbyBtn(corps: StandbyCorps): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'corps-btn corps-btn-standby'
    btn.textContent = `${corps.label}\n@${corps.tileName}`
    btn.title = '单击详情 · 长按编入（v0.8）'

    btn.addEventListener('click', () => {
      if (this.longPressFired) {
        this.longPressFired = false
        return
      }
      this.callbacks.onStandbyClick(corps)
    })

    btn.addEventListener('pointerdown', () => {
      this.longPressFired = false
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null
        this.longPressFired = true
        this.callbacks.onStandbyLongPress(corps)
      }, LONG_PRESS_MS)
    })

    const cancel = () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer)
        this.longPressTimer = null
      }
    }
    btn.addEventListener('pointerup', cancel)
    btn.addEventListener('pointerleave', cancel)
    btn.addEventListener('pointercancel', cancel)

    return btn
  }

  refresh(): void {
    this.render()
  }
}
