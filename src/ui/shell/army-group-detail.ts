import type { FactionId, GameSave, HeroConfig } from '../../types/index.ts'
import {
  getArmyGroupLabel,
  getCorpsIdsInGroup,
} from '../../core/organization/army-group-ops.ts'
import { getCorpsLabel } from '../../core/organization/helpers.ts'
import { findCorpsById } from '../../core/organization/queries.ts'
import { getAssignedHeroIds } from '../../core/organization/hero-assign.ts'

export interface ArmyGroupDetailCallbacks {
  onAppointMarshal: (groupId: string, heroId: string | null) => void
  onDisband: (groupId: string) => void
  onCorpsClick: (corpsId: string) => void
}

export class ArmyGroupDetail {
  private readonly el: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly bodyEl: HTMLElement
  private readonly callbacks: ArmyGroupDetailCallbacks
  private currentGroupId: string | null = null

  constructor(host: HTMLElement, callbacks: ArmyGroupDetailCallbacks) {
    this.el = host
    this.titleEl = host.querySelector('.army-group-float-title')!
    this.bodyEl = host.querySelector('.army-group-float-body')!
    this.callbacks = callbacks
    host.querySelector('.army-group-float-close')?.addEventListener('click', () => this.hide())
  }

  show(
    save: GameSave,
    groupId: string,
    heroes: HeroConfig[],
    playerFaction: FactionId,
  ): void {
    const f = save.factions[playerFaction]
    const group = f?.armyGroups?.find((g) => g.id === groupId)
    if (!group) return

    this.currentGroupId = groupId
    this.titleEl.textContent = getArmyGroupLabel(group, heroes)

    const marshalName = group.heroId
      ? heroes.find((h) => h.id === group.heroId)?.name
      : null

    const marshalSection = group.heroId
      ? `<p class="corps-float-hint">元帅：${marshalName}</p>
         <button type="button" class="corps-float-btn" data-action="dismiss-marshal">卸任元帅</button>`
      : `<button type="button" class="corps-float-btn" data-action="appoint-marshal">任命元帅</button>`

    const corpsIds = getCorpsIdsInGroup(save, group)
    const corpsTags = corpsIds
      .map((id) => {
        const corps = findCorpsById(save, id)
        if (!corps) return ''
        return `<button type="button" class="tag corps-battalion-tag" data-corps="${id}">${getCorpsLabel(corps, heroes)}</button>`
      })
      .join('')

    this.bodyEl.innerHTML = `
      <div class="corps-float-section">
        <strong>元帅</strong>
        ${marshalSection}
        <p class="corps-float-hint">辖 ${corpsIds.length} 个将军队</p>
      </div>
      <div class="corps-float-section">
        <strong>下辖将军队</strong>
        <div class="battalion-tags">${corpsTags || '<span class="tag muted">无</span>'}</div>
        <button type="button" class="corps-float-btn" data-action="disband">解散集团军</button>
      </div>
    `

    this.bodyEl.querySelector('[data-action="appoint-marshal"]')?.addEventListener('click', () => {
      this.showMarshalDialog(save, group, heroes, playerFaction)
    })
    this.bodyEl.querySelector('[data-action="dismiss-marshal"]')?.addEventListener('click', () => {
      this.callbacks.onAppointMarshal(group.id, null)
    })
    this.bodyEl.querySelector('[data-action="disband"]')?.addEventListener('click', () => {
      this.callbacks.onDisband(group.id)
    })
    this.bodyEl.querySelectorAll('[data-corps]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.corps
        if (id) this.callbacks.onCorpsClick(id)
      })
    })

    this.el.hidden = false
  }

  private showMarshalDialog(
    save: GameSave,
    group: { id: string },
    heroes: HeroConfig[],
    playerFaction: FactionId,
  ): void {
    const faction = save.factions[playerFaction]
    if (!faction) return

    const assigned = getAssignedHeroIds(save, playerFaction)
    const available = heroes.filter(
      (h) => h.faction === playerFaction && faction.heroes.includes(h.id),
    )

    const list = available
      .map((h) => {
        const tag = assigned.has(h.id) ? '（已任命）' : ''
        return `<button type="button" class="corps-float-btn corps-hero-pick" data-hero="${h.id}">${h.name}${tag}（攻${h.attack}/防${h.defense}）</button>`
      })
      .join('')

    const dialog = document.createElement('div')
    dialog.className = 'corps-float-section'
    dialog.innerHTML = `<strong>选择元帅</strong>${list}`
    this.bodyEl.appendChild(dialog)

    dialog.querySelectorAll('[data-hero]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const heroId = (btn as HTMLElement).dataset.hero
        if (heroId) this.callbacks.onAppointMarshal(group.id, heroId)
      })
    })
  }

  hide(): void {
    this.el.hidden = true
    this.currentGroupId = null
  }

  getCurrentGroupId(): string | null {
    return this.currentGroupId
  }

  refresh(save: GameSave, heroes: HeroConfig[], playerFaction: FactionId): void {
    if (this.currentGroupId) {
      this.show(save, this.currentGroupId, heroes, playerFaction)
    }
  }
}
