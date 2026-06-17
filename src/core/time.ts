import type { GameClock } from './time-scale.ts'
import { fromTotalHours, HOURS_PER_DAY, totalHours } from './time-scale.ts'

export type SpeedMultiplier = 1 | 2 | 5

export interface TimeControllerOptions {
  /** 每真实秒对应的游戏日数（基准 ×1 时为 1） */
  daysPerRealSecond?: number
  onHourTick: (clock: GameClock) => void
  onPauseChange?: (paused: boolean) => void
}

const MS_PER_REAL_SECOND = 1000

export class TimeController {
  private readonly daysPerRealSecond: number
  private readonly onHourTick: (clock: GameClock) => void
  private readonly onPauseChange?: (paused: boolean) => void

  private gameDay = 0
  private gameHour = 0
  private speed: SpeedMultiplier = 1
  private paused = false
  private accumulatorMs = 0
  private lastFrameMs = 0
  private rafId: number | null = null
  private running = false

  constructor(options: TimeControllerOptions) {
    this.daysPerRealSecond = options.daysPerRealSecond ?? 1
    this.onHourTick = options.onHourTick
    this.onPauseChange = options.onPauseChange
  }

  getClock(): GameClock {
    return { day: this.gameDay, hour: this.gameHour }
  }

  getGameDay(): number {
    return this.gameDay
  }

  getSpeed(): SpeedMultiplier {
    return this.speed
  }

  isPaused(): boolean {
    return this.paused
  }

  setClock(day: number, hour: number): void {
    this.gameDay = Math.max(0, Math.floor(day))
    this.gameHour = Math.max(0, Math.min(HOURS_PER_DAY - 1, Math.floor(hour)))
  }

  setGameDay(day: number): void {
    this.gameDay = Math.max(0, Math.floor(day))
  }

  setSpeed(speed: SpeedMultiplier): void {
    this.speed = speed
  }

  togglePause(): void {
    this.paused = !this.paused
    this.onPauseChange?.(this.paused)
  }

  pause(): void {
    if (!this.paused) {
      this.paused = true
      this.onPauseChange?.(true)
    }
  }

  resume(): void {
    if (this.paused) {
      this.paused = false
      this.onPauseChange?.(false)
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrameMs = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const deltaMs = now - this.lastFrameMs
      this.lastFrameMs = now
      this.step(deltaMs)
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  step(deltaMs: number): void {
    if (this.paused) return

    const msPerGameDay = MS_PER_REAL_SECOND / (this.daysPerRealSecond * this.speed)
    const msPerGameHour = msPerGameDay / HOURS_PER_DAY
    this.accumulatorMs += deltaMs

    while (this.accumulatorMs >= msPerGameHour) {
      this.accumulatorMs -= msPerGameHour
      this.gameHour += 1
      if (this.gameHour >= HOURS_PER_DAY) {
        this.gameHour = 0
        this.gameDay += 1
      }
      this.onHourTick({ day: this.gameDay, hour: this.gameHour })
    }
  }

  /** 从总小时数恢复时钟 */
  setTotalHours(hours: number): void {
    const clock = fromTotalHours(Math.max(0, hours))
    this.gameDay = clock.day
    this.gameHour = clock.hour
  }

  getTotalHours(): number {
    return totalHours(this.gameDay, this.gameHour)
  }
}
