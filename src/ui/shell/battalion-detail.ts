import type { GameSave, GeneratedMap } from '../../types/index.ts'
import { countBattalionTroops } from '../../core/organization/helpers.ts'
import { findBattalionById } from '../../core/organization/queries.ts'
import { TROOPS_PER_CENTURY } from '../../core/organization/constants.ts'

export class BattalionDetail {
  private readonly el: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly bodyEl: HTMLElement

  constructor(host: HTMLElement) {
    this.el = host
    this.titleEl = host.querySelector('.battalion-float-title')!
    this.bodyEl = host.querySelector('.battalion-float-body')!
    host.querySelector('.battalion-float-close')?.addEventListener('click', () => this.hide())
  }

  show(save: GameSave, map: GeneratedMap, battalionId: string): void {
    const battalion = findBattalionById(save, battalionId)
    if (!battalion) return

    const tileName = map.tileById[battalion.tileId]?.name ?? battalion.tileId
    const total = countBattalionTroops(battalion)
    const fullCenturies = battalion.centuries.filter((c) => c.troops >= TROOPS_PER_CENTURY).length
    const emptyCenturies = battalion.centuries.filter((c) => c.troops <= 0).length

    this.titleEl.textContent = `${battalion.designation}队 · 编队详情`

    const blocks = battalion.centuries
      .map((c) => {
        const cls =
          c.troops <= 0 ? 'century-block empty' : c.troops >= TROOPS_PER_CENTURY ? 'century-block full' : 'century-block partial'
        return `<div class="${cls}" title="第${c.index + 1}百人队">${c.troops}<span class="century-cap">/${TROOPS_PER_CENTURY}</span></div>`
      })
      .join('')

    this.bodyEl.innerHTML = `
      <div class="battalion-detail-layout">
        <div class="century-grid">${blocks}</div>
        <div class="battalion-stats">
          <p><strong>总兵力</strong> ${total}</p>
          <p><strong>满编队</strong> ${fullCenturies}/10</p>
          <p><strong>溃散队</strong> ${emptyCenturies}</p>
          <p><strong>驻地</strong> ${tileName}</p>
          <p class="corps-float-hint">战损从接战百人队起向后扣除；&lt;500 人行军 +20%</p>
        </div>
      </div>
    `

    this.el.hidden = false
  }

  hide(): void {
    this.el.hidden = true
  }

  isVisible(): boolean {
    return !this.el.hidden
  }
}
