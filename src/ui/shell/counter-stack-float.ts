import type { GameSave, GeneratedMap } from '../../types/index.ts'
import { countBattalionTroops } from '../../core/organization/helpers.ts'
import { findBattalionById } from '../../core/organization/queries.ts'
import { getFactionLabel } from '../../core/factions.ts'
import type { CounterDisplayItem } from '../../map/counter-layer.ts'
import { collectCounterGroupMembers } from '../../map/counter-layer.ts'

export class CounterStackFloat {
  private readonly el: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly bodyEl: HTMLElement
  private onSelect?: (battalionId: string) => void

  constructor(host: HTMLElement, options?: { onSelect?: (battalionId: string) => void }) {
    this.el = host
    this.titleEl = host.querySelector('.counter-stack-float-title')!
    this.bodyEl = host.querySelector('.counter-stack-float-body')!
    this.onSelect = options?.onSelect
    host.querySelector('.counter-stack-float-close')?.addEventListener('click', () => this.hide())
  }

  show(
    save: GameSave,
    map: GeneratedMap,
    counter: CounterDisplayItem,
    allItems: CounterDisplayItem[],
    viewportScale: number,
  ): void {
    const memberIds = collectCounterGroupMembers(counter, allItems, map, viewportScale)
    if (memberIds.length <= 1) {
      this.hide()
      return
    }

    const tileName = map.tileById[counter.tileId]?.name ?? counter.tileId
    this.titleEl.textContent = `军棋编队 · ${tileName}（${memberIds.length}队）`

    const rows = memberIds
      .map((id) => {
        const battalion = findBattalionById(save, id)
        if (!battalion) return ''
        const loc = map.tileById[battalion.tileId]?.name ?? battalion.tileId
        const troops = countBattalionTroops(battalion)
        const selected = counter.battalionId === id ? ' counter-stack-item--active' : ''
        return `<button type="button" class="counter-stack-item${selected}" data-battalion-id="${id}">
          <span class="counter-stack-item-name">${battalion.designation}队 · 步</span>
          <span class="counter-stack-item-meta">${getFactionLabel(battalion.faction)} · ${troops}人 · ${loc}</span>
        </button>`
      })
      .join('')

    this.bodyEl.innerHTML = rows || '<p class="corps-float-hint">暂无编队</p>'

    this.bodyEl.querySelectorAll<HTMLButtonElement>('.counter-stack-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.battalionId
        if (id) this.onSelect?.(id)
      })
    })

    this.el.hidden = false
  }

  hide(): void {
    this.el.hidden = true
  }
}
