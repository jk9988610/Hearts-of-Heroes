import type { AdvisorConfig, FactionId, GameSave, HeroConfig } from '../types/index.ts'
import { getFactionLabel } from '../core/factions.ts'
import { getHeroById } from '../core/organization/hero-assign.ts'

const SLOT_COUNT = 7

export interface NationPanelOptions {
  root: HTMLElement
  policyTreeEl: HTMLElement
  renderPolicies: () => void
  getSave: () => GameSave | null
  getPlayerFaction: () => FactionId
  getHeroes: () => HeroConfig[]
  getAdvisors: () => AdvisorConfig[]
  onChanged?: () => void
}

export class NationPanel {
  private readonly root: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly policySection: HTMLElement
  private readonly strategistGrid: HTMLElement
  private readonly officerGrid: HTMLElement
  private readonly policyTreeEl: HTMLElement
  private readonly renderPolicies: () => void
  private readonly getSave: () => GameSave | null
  private readonly getPlayerFaction: () => FactionId
  private readonly getHeroes: () => HeroConfig[]
  private readonly getAdvisors: () => AdvisorConfig[]
  private readonly onChanged?: () => void

  constructor(options: NationPanelOptions) {
    this.root = options.root
    this.policyTreeEl = options.policyTreeEl
    this.renderPolicies = options.renderPolicies
    this.getSave = options.getSave
    this.getPlayerFaction = options.getPlayerFaction
    this.getHeroes = options.getHeroes
    this.getAdvisors = options.getAdvisors
    this.onChanged = options.onChanged

    this.titleEl = this.root.querySelector('.nation-title')!
    this.policySection = this.root.querySelector('#nation-policy-tree')!
    this.strategistGrid = this.root.querySelector('#strategist-slots')!
    this.officerGrid = this.root.querySelector('#officer-slots')!

    this.root.querySelector('#nation-open-policies')!.addEventListener('click', () => {
      this.renderPolicies()
      this.policySection.hidden = !this.policySection.hidden
    })
    this.root.querySelector('.nation-close')!.addEventListener('click', () => this.hide())
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root.querySelector('.nation-backdrop')) this.hide()
    })
    this.root.hidden = true
  }

  show(): void {
    const save = this.getSave()
    if (!save) return
    const pf = this.getPlayerFaction()
    this.titleEl.textContent = getFactionLabel(pf)
    this.policySection.replaceChildren()
    this.policySection.appendChild(this.policyTreeEl)
    this.policySection.hidden = true
    this.renderSlotGrids(save, pf)
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
  }

  toggle(): void {
    if (this.root.hidden) this.show()
    else this.hide()
  }

  private renderSlotGrids(save: GameSave, pf: FactionId): void {
    const f = save.factions[pf]
    if (!f) return

    f.strategistSlots = f.strategistSlots ?? Array.from({ length: SLOT_COUNT }, () => undefined)
    f.officerSlots = f.officerSlots ?? Array.from({ length: SLOT_COUNT }, () => undefined)

    this.strategistGrid.replaceChildren()
    for (let i = 0; i < SLOT_COUNT; i++) {
      this.strategistGrid.appendChild(
        this.makeSlotButton('strategist', i, f.strategistSlots[i], save, pf),
      )
    }

    this.officerGrid.replaceChildren()
    for (let i = 0; i < SLOT_COUNT; i++) {
      this.officerGrid.appendChild(
        this.makeSlotButton('officer', i, f.officerSlots[i], save, pf),
      )
    }
  }

  private makeSlotButton(
    kind: 'strategist' | 'officer',
    index: number,
    assignedId: string | undefined,
    save: GameSave,
    pf: FactionId,
  ): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'slot-btn'
    btn.textContent = assignedId
      ? kind === 'strategist'
        ? this.getAdvisors().find((a) => a.id === assignedId)?.name ?? assignedId
        : getHeroById(assignedId)?.name ?? assignedId
      : `槽位 ${index + 1}`

    btn.addEventListener('click', () => {
      this.pickForSlot(kind, index, save, pf, assignedId)
    })
    return btn
  }

  private pickForSlot(
    kind: 'strategist' | 'officer',
    index: number,
    save: GameSave,
    pf: FactionId,
    currentId: string | undefined,
  ): void {
    const f = save.factions[pf]
    if (!f) return

    const slots = kind === 'strategist' ? f.strategistSlots! : f.officerSlots!
    const pool =
      kind === 'strategist'
        ? this.getAdvisors().filter(
            (a) => a.faction === pf && (f.advisors ?? []).includes(a.id),
          )
        : this.getHeroes().filter((h) => h.faction === pf)

    const used = new Set(
      slots.filter((id, i) => id && i !== index) as string[],
    )
    const options = pool.filter((p) => !used.has(p.id))
    const names = options.map((p) => p.name).join('、')
    const hint = currentId
      ? `当前：${kind === 'strategist' ? this.getAdvisors().find((a) => a.id === currentId)?.name : getHeroById(currentId)?.name}\n可选：${names || '无'}\n输入谋士/将领姓名，留空卸下`
      : `可选：${names || '无'}\n输入姓名任命，留空取消`

    const input = prompt(hint, currentId ? (kind === 'strategist' ? this.getAdvisors().find((a) => a.id === currentId)?.name : getHeroById(currentId)?.name) ?? '' : '')
    if (input === null) return

    const trimmed = input.trim()
    if (!trimmed) {
      slots[index] = undefined
    } else {
      const match = pool.find((p) => p.name === trimmed || p.id === trimmed)
      if (!match) {
        alert('未找到该人物')
        return
      }
      slots[index] = match.id
    }

    this.renderSlotGrids(save, pf)
    this.onChanged?.()
  }
}
