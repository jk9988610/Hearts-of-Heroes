import type { FactionId, GameSave } from '../types/index.ts'
import {
  ceaseFire,
  declareWar,
  getRelation,
  type DiplomaticStatus,
} from '../core/diplomacy.ts'
import { getFactionLabel } from '../core/factions.ts'

export interface DiplomacyModalOptions {
  root: HTMLElement
  getSave: () => GameSave | null
  getPlayerFaction: () => FactionId
  onChanged?: () => void
}

export class DiplomacyModal {
  private readonly root: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly declareBtn: HTMLButtonElement
  private readonly ceaseBtn: HTMLButtonElement
  private readonly closeBtn: HTMLButtonElement
  private readonly getSave: () => GameSave | null
  private readonly getPlayerFaction: () => FactionId
  private readonly onChanged?: () => void
  private targetFaction: FactionId | null = null

  constructor(options: DiplomacyModalOptions) {
    this.root = options.root
    this.getSave = options.getSave
    this.getPlayerFaction = options.getPlayerFaction
    this.onChanged = options.onChanged
    this.titleEl = this.root.querySelector('.diplomacy-title')!
    this.statusEl = this.root.querySelector('.diplomacy-status')!
    this.declareBtn = this.root.querySelector('#diplomacy-declare')!
    this.ceaseBtn = this.root.querySelector('#diplomacy-cease')!
    this.closeBtn = this.root.querySelector('.diplomacy-close')!

    this.declareBtn.addEventListener('click', () => this.onDeclare())
    this.ceaseBtn.addEventListener('click', () => this.onCease())
    this.closeBtn.addEventListener('click', () => this.hide())
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root.querySelector('.diplomacy-backdrop')) this.hide()
    })
    this.root.hidden = true
  }

  show(target: FactionId): void {
    const save = this.getSave()
    if (!save) return
    const pf = this.getPlayerFaction()
    this.targetFaction = target
    const status = getRelation(save, pf, target)
    this.titleEl.textContent = `与${getFactionLabel(target)}互动`
    this.statusEl.textContent = `当前关系：${statusLabel(status)}`
    this.updateButtons(status)
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
    this.targetFaction = null
  }

  private updateButtons(status: DiplomaticStatus): void {
    this.declareBtn.disabled = status === 'war'
    this.ceaseBtn.disabled = status === 'peace'
  }

  private onDeclare(): void {
    const save = this.getSave()
    if (!save || !this.targetFaction) return
    const result = declareWar(save, this.getPlayerFaction(), this.targetFaction)
    if (result.ok) {
      this.statusEl.textContent = `当前关系：${statusLabel('war')}`
      this.updateButtons('war')
      this.onChanged?.()
    }
    alert(result.message)
  }

  private onCease(): void {
    const save = this.getSave()
    if (!save || !this.targetFaction) return
    const result = ceaseFire(save, this.getPlayerFaction(), this.targetFaction)
    if (result.ok) {
      this.statusEl.textContent = `当前关系：${statusLabel('peace')}`
      this.updateButtons('peace')
      this.onChanged?.()
    }
    alert(result.message)
  }
}

function statusLabel(status: DiplomaticStatus): string {
  return status === 'war' ? '交战' : '和平'
}
