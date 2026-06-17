import type { Corps, FactionId, GameSave, GeneratedMap, HeroConfig } from '../../types/index.ts'
import { getAssignedHeroIds } from '../../core/organization/hero-assign.ts'
import { countCorpsTroops, getCorpsLabel } from '../../core/organization/helpers.ts'
import { getCorpsBattalions } from '../../core/organization/queries.ts'

export interface CorpsDetailCallbacks {
  onAppoint: (corpsId: string, heroId: string | null) => void
  onBattalionClick: (corpsId: string, battalionId: string) => void
}

export class CorpsDetail {
  private readonly el: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly bodyEl: HTMLElement
  private readonly callbacks: CorpsDetailCallbacks
  private currentCorpsId: string | null = null

  constructor(host: HTMLElement, callbacks: CorpsDetailCallbacks) {
    this.el = host
    this.titleEl = host.querySelector('.corps-float-title')!
    this.bodyEl = host.querySelector('.corps-float-body')!
    this.callbacks = callbacks
    host.querySelector('.corps-float-close')?.addEventListener('click', () => this.hide())
  }

  show(
    save: GameSave,
    map: GeneratedMap,
    corpsId: string,
    heroes: HeroConfig[],
    playerFaction: FactionId,
  ): void {
    const faction = save.factions[playerFaction]
    const corps = faction?.corps.find((c) => c.id === corpsId)
    if (!corps) return

    this.currentCorpsId = corpsId
    const tileName = map.tileById[corps.tileId]?.name ?? corps.tileId
    const totalTroops = countCorpsTroops(save, corps)
    const battalions = getCorpsBattalions(save, corps)
    const heroName = corps.heroId
      ? heroes.find((h) => h.id === corps.heroId)?.name ?? corps.heroId
      : null

    this.titleEl.textContent = getCorpsLabel(corps, heroes)

    const heroSection = corps.heroId
      ? `<p class="corps-float-hint">将军：${heroName}</p>
         <button type="button" class="corps-float-btn" data-action="dismiss">卸任</button>`
      : `<button type="button" class="corps-float-btn" data-action="appoint">任命将军</button>`

    const battalionTags = battalions.length
      ? battalions
          .map(
            (b) =>
              `<button type="button" class="tag corps-battalion-tag" data-battalion="${b.id}">${b.designation}队 · ${b.centuries.reduce((s, c) => s + c.troops, 0)}人</button>`,
          )
          .join('')
      : '<span class="tag muted">暂无千人队</span>'

    this.bodyEl.innerHTML = `
      <div class="corps-float-section">
        <strong>将领</strong>
        ${heroSection}
        <p class="corps-float-hint">驻地：${tileName} · 总兵力 ${totalTroops}${corps.standby ? ' · 待命' : ''}</p>
      </div>
      <div class="corps-float-section">
        <strong>千人队</strong>（${battalions.length}/10 · 番号自动）
        <div class="battalion-tags">${battalionTags}</div>
      </div>
    `

    this.bodyEl.querySelector('[data-action="appoint"]')?.addEventListener('click', () => {
      this.showAppointDialog(save, corps, heroes, playerFaction)
    })
    this.bodyEl.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
      this.callbacks.onAppoint(corps.id, null)
    })

    this.bodyEl.querySelectorAll('[data-battalion]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.battalion
        if (id) this.callbacks.onBattalionClick(corps.id, id)
      })
    })

    this.el.hidden = false
  }

  private showAppointDialog(
    save: GameSave,
    corps: Corps,
    heroes: HeroConfig[],
    playerFaction: FactionId,
  ): void {
    const faction = save.factions[playerFaction]
    if (!faction) return

    const assigned = getAssignedHeroIds(save, playerFaction)
    const available = heroes.filter((h) => h.faction === playerFaction && faction.heroes.includes(h.id))
    if (available.length === 0) {
      this.bodyEl.insertAdjacentHTML(
        'beforeend',
        '<p class="corps-float-hint">暂无可用武将</p>',
      )
      return
    }

    const list = available
      .map(
        (h) => {
          const tag = assigned.has(h.id) && corps.heroId !== h.id ? '（已任命）' : ''
          return `<button type="button" class="corps-float-btn corps-hero-pick" data-hero="${h.id}">${h.name}${tag}（攻${h.attack}/防${h.defense}）</button>`
        },
      )
      .join('')

    const dialog = document.createElement('div')
    dialog.className = 'corps-float-section'
    dialog.innerHTML = `<strong>选择将军</strong>${list}`
    this.bodyEl.appendChild(dialog)

    dialog.querySelectorAll('[data-hero]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const heroId = (btn as HTMLElement).dataset.hero
        if (heroId) this.callbacks.onAppoint(corps.id, heroId)
      })
    })
  }

  hide(): void {
    this.el.hidden = true
    this.currentCorpsId = null
  }

  isVisible(): boolean {
    return !this.el.hidden
  }

  getCurrentCorpsId(): string | null {
    return this.currentCorpsId
  }

  refresh(
    save: GameSave,
    map: GeneratedMap,
    heroes: HeroConfig[],
    playerFaction: FactionId,
  ): void {
    if (this.currentCorpsId) {
      this.show(save, map, this.currentCorpsId, heroes, playerFaction)
    }
  }
}
