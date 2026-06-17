import type { ArmyDisplayState } from './army-display.ts'

export type BattleFlashKind = 'capture' | 'defend' | 'stalemate'

export interface TileFlash {
  kind: BattleFlashKind
  /** 0～1 动画进度 */
  progress: number
}

const FLASH_MS = 900
const LERP = 0.18

export class BattleAnimator {
  private displayed = new Map<string, number>()
  private flashes = new Map<string, { kind: BattleFlashKind; startMs: number }>()
  private rafId: number | null = null
  private readonly onNeedsRender: () => void

  constructor(onNeedsRender: () => void) {
    this.onNeedsRender = onNeedsRender
  }

  syncTargets(armyDisplay: ArmyDisplayState): void {
    const active = new Set<string>()
    for (const [tileId, overlay] of Object.entries(armyDisplay.overlays)) {
      if (overlay.troops <= 0 && overlay.kind !== 'combat') continue
      active.add(tileId)
      if (!this.displayed.has(tileId)) {
        this.displayed.set(tileId, overlay.troops)
      }
    }
    for (const id of this.displayed.keys()) {
      if (!active.has(id)) this.displayed.delete(id)
    }
  }

  triggerFlash(tileId: string, kind: BattleFlashKind): void {
    this.flashes.set(tileId, { kind, startMs: performance.now() })
    this.ensureLoop()
  }

  getDisplayTroops(tileId: string, actual: number): number {
    const d = this.displayed.get(tileId)
    return d !== undefined ? Math.round(d) : actual
  }

  getTileFlashes(nowMs = performance.now()): Record<string, TileFlash> {
    const out: Record<string, TileFlash> = {}
    for (const [tileId, flash] of this.flashes) {
      const progress = Math.min(1, (nowMs - flash.startMs) / FLASH_MS)
      if (progress >= 1) {
        this.flashes.delete(tileId)
        continue
      }
      out[tileId] = { kind: flash.kind, progress }
    }
    return out
  }

  tick(armyDisplay: ArmyDisplayState): boolean {
    this.syncTargets(armyDisplay)
    let animating = false
    for (const [tileId, overlay] of Object.entries(armyDisplay.overlays)) {
      if (overlay.troops <= 0 && overlay.kind !== 'combat') continue
      const target = overlay.troops
      const current = this.displayed.get(tileId) ?? target
      const diff = target - current
      if (Math.abs(diff) < 0.5) {
        this.displayed.set(tileId, target)
      } else {
        this.displayed.set(tileId, current + diff * LERP)
        animating = true
      }
    }
    if (this.flashes.size > 0) animating = true
    return animating
  }

  private ensureLoop(): void {
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(this.loop)
  }

  private loop = (): void => {
    this.rafId = null
    this.onNeedsRender()
  }

  startContinuousLoop(getArmyDisplay: () => ArmyDisplayState): void {
    if (this.rafId !== null) return
    const run = () => {
      const animating = this.tick(getArmyDisplay())
      if (animating || this.flashes.size > 0) {
        this.onNeedsRender()
        this.rafId = requestAnimationFrame(run)
      } else {
        this.rafId = null
      }
    }
    this.rafId = requestAnimationFrame(run)
  }
}
