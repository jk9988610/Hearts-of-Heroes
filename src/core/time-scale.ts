export const HOURS_PER_DAY = 24

export const MARCH_HOURS = 2 * HOURS_PER_DAY // 48
export const COMBAT_HOURS = 3 * HOURS_PER_DAY // 72

/** 视窗外 AI 决策间隔（游戏小时） */
export const AI_LITE_INTERVAL_HOURS = 6

export interface GameClock {
  day: number
  hour: number
}

export function formatGameTime(day: number, hour: number): string {
  return `第${day}天 ${hour.toString().padStart(2, '0')}时`
}

export function formatHoursBrief(hours: number): string {
  if (hours >= HOURS_PER_DAY && hours % HOURS_PER_DAY === 0) {
    return `${hours / HOURS_PER_DAY}天`
  }
  if (hours >= HOURS_PER_DAY) {
    const d = Math.floor(hours / HOURS_PER_DAY)
    const h = hours % HOURS_PER_DAY
    return `${d}天${h}时`
  }
  return `${hours}时`
}

export function totalHours(day: number, hour: number): number {
  return day * HOURS_PER_DAY + hour
}

export function fromTotalHours(t: number): GameClock {
  return {
    day: Math.floor(t / HOURS_PER_DAY),
    hour: t % HOURS_PER_DAY,
  }
}
