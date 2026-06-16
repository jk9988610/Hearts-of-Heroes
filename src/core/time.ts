export type SpeedMultiplier = 1 | 2 | 5

export interface TimeControllerOptions {
  /** 每真实秒对应的游戏日数（基准 ×1 时为 1） */
  daysPerRealSecond?: number
  onTick: (gameDay: number) => void
  onPauseChange?: (paused: boolean) => void
}

const MS_PER_REAL_SECOND = 1000

export class TimeController {
  private readonly daysPerRealSecond: number
  private readonly onTick: (gameDay: number) => void
  private readonly onPauseChange?: (paused: boolean) => void

  private gameDay = 0
  private speed: SpeedMultiplier = 1
  private paused = false
  private accumulatorMs = 0
  private lastFrameMs = 0
  private rafId: number | null = null
  private running = false

  constructor(options: TimeControllerOptions) {
    this.daysPerRealSecond = options.daysPerRealSecond ?? 1
    this.onTick = options.onTick
    this.onPauseChange = options.onPauseChange
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

  /** 单步推进（测试用，不依赖 rAF） */
  step(deltaMs: number): void {
    if (this.paused) return

    const msPerGameDay =
      MS_PER_REAL_SECOND / (this.daysPerRealSecond * this.speed)
    this.accumulatorMs += deltaMs

    while (this.accumulatorMs >= msPerGameDay) {
      this.accumulatorMs -= msPerGameDay
      this.gameDay += 1
      this.onTick(this.gameDay)
    }
  }
}
