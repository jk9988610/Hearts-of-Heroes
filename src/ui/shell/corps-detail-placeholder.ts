import type { StandbyCorps } from './corps-bar.ts'

export class CorpsDetailPlaceholder {
  private readonly el: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly bodyEl: HTMLElement

  constructor(host: HTMLElement) {
    this.el = host
    this.titleEl = host.querySelector('.corps-float-title')!
    this.bodyEl = host.querySelector('.corps-float-body')!
    host.querySelector('.corps-float-close')?.addEventListener('click', () => this.hide())
  }

  show(corps: StandbyCorps): void {
    this.titleEl.textContent = corps.label
    this.bodyEl.innerHTML = `
      <div class="corps-float-section">
        <strong>将领</strong>（v0.8）
        <button type="button" class="corps-float-btn" disabled>任命将军</button>
        <p class="corps-float-hint">驻地：${corps.tileName} · 待命编制</p>
      </div>
      <div class="corps-float-section">
        <strong>千人队</strong>（番号自动 · 占位）
        <div class="battalion-tags">
          <span class="tag">1队 · 编队详情</span>
          <span class="tag muted">2队 · —</span>
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
