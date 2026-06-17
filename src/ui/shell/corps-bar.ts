const LONG_PRESS_MS = 500

export interface CorpsBarItem {
  id: string
  label: string
  tileName: string
}

export interface ArmyGroupBarItem {
  id: string
  label: string
  anchorCorpsId: string
}

export interface CorpsBarCallbacks {
  onNewCorps: () => void
  onStandbyClick: (corpsId: string) => void
  onStandbyLongPress: (corpsId: string) => void
  onArmyGroupClick: (groupId: string) => void
  onCreateArmyGroup: () => void
  canCreateCorps: () => boolean
  canShowCreateArmyGroup: () => boolean
  getStandbyCorps: () => CorpsBarItem[]
  getArmyGroups: () => ArmyGroupBarItem[]
  getSelectedCorpsId: () => string | null
  getSelectedArmyGroupId: () => string | null
}

export class CorpsBar {
  private readonly gridEl: HTMLElement
  private readonly callbacks: CorpsBarCallbacks
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressFired = false

  constructor(callbacks: CorpsBarCallbacks, gridEl: HTMLElement) {
    this.callbacks = callbacks
    this.gridEl = gridEl
    this.render()
  }

  private render(): void {
    const standby = this.callbacks.getStandbyCorps()
    const groups = this.callbacks.getArmyGroups()
    this.gridEl.innerHTML = ''

    const track = document.createElement('div')
    track.className = 'corps-bar-track'

    if (this.callbacks.canShowCreateArmyGroup()) {
      track.appendChild(this.createArmyGroupNewBtn())
    }

    for (const corps of standby) {
      const group = groups.find((g) => g.anchorCorpsId === corps.id)
      if (group) {
        track.appendChild(this.createArmyGroupBtn(group))
      }
      track.appendChild(this.createStandbyBtn(corps))
    }

    track.appendChild(this.createNewBtn())
    this.gridEl.appendChild(track)
  }

  private createArmyGroupNewBtn(): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'corps-btn corps-btn-ag-new'
    btn.textContent = '组建集团军'
    btn.addEventListener('click', () => this.callbacks.onCreateArmyGroup())
    return btn
  }

  private createArmyGroupBtn(group: ArmyGroupBarItem): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'corps-btn corps-btn-ag'
    if (this.callbacks.getSelectedArmyGroupId() === group.id) {
      btn.classList.add('selected')
    }
    btn.textContent = group.label
    btn.title = '单击集团军详情'
    btn.addEventListener('click', () => this.callbacks.onArmyGroupClick(group.id))
    return btn
  }

  private createNewBtn(): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'corps-btn corps-btn-new'
    btn.textContent = '新编军队'
    btn.disabled = !this.callbacks.canCreateCorps()
    btn.addEventListener('click', () => {
      if (!this.callbacks.canCreateCorps()) return
      this.callbacks.onNewCorps()
    })
    return btn
  }

  private createStandbyBtn(corps: CorpsBarItem): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'corps-btn corps-btn-standby'
    if (this.callbacks.getSelectedCorpsId() === corps.id) {
      btn.classList.add('selected')
    }
    btn.textContent = `${corps.label}\n@${corps.tileName}`
    btn.title = '单击详情 · 长按编入'

    btn.addEventListener('click', () => {
      if (this.longPressFired) {
        this.longPressFired = false
        return
      }
      this.callbacks.onStandbyClick(corps.id)
    })

    btn.addEventListener('pointerdown', () => {
      this.longPressFired = false
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null
        this.longPressFired = true
        this.callbacks.onStandbyLongPress(corps.id)
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
