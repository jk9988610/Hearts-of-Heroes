export type LogCategory = 'tick' | 'tile' | 'system' | 'map' | 'debug' | 'battle'

export const LOG_CATEGORIES: LogCategory[] = [
  'tick',
  'tile',
  'system',
  'map',
  'debug',
  'battle',
]

export interface DebugLoggerOptions {
  container: HTMLElement
  maxLines?: number
}

export class DebugLogger {
  private readonly container: HTMLElement
  private readonly maxLines: number
  private entries: { time: string; category: LogCategory; message: string }[] = []
  private enabledCategories = new Set<LogCategory>(LOG_CATEGORIES)

  constructor(options: DebugLoggerOptions) {
    this.container = options.container
    this.maxLines = options.maxLines ?? 500
  }

  isCategoryEnabled(category: LogCategory): boolean {
    return this.enabledCategories.has(category)
  }

  toggleCategory(category: LogCategory): boolean {
    if (this.enabledCategories.has(category)) {
      this.enabledCategories.delete(category)
    } else {
      this.enabledCategories.add(category)
    }
    this.render()
    return this.enabledCategories.has(category)
  }

  log(category: LogCategory, message: string): void {
    const time = new Date().toLocaleTimeString()
    this.entries.unshift({ time, category, message })
    if (this.entries.length > this.maxLines) {
      this.entries.length = this.maxLines
    }
    console.log(`[${category}] ${message}`)
    this.render()
  }

  clear(): void {
    this.entries = []
    this.render()
  }

  dump(title: string, lines: string[]): void {
    this.log('debug', `── ${title} ──`)
    for (const line of lines) {
      this.log('debug', line)
    }
  }

  private render(): void {
    const filtered = this.entries.filter((e) => this.enabledCategories.has(e.category))
    this.container.textContent = filtered
      .map((e) => `[${e.time}] [${e.category}] ${e.message}`)
      .join('\n')
  }
}
