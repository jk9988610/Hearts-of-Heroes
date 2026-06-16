export type LogCategory = 'tick' | 'tile' | 'system' | 'map' | 'debug'

export interface DebugLoggerOptions {
  container: HTMLElement
  maxLines?: number
}

export class DebugLogger {
  private readonly container: HTMLElement
  private readonly maxLines: number
  private entries: { time: string; category: LogCategory; message: string }[] = []
  private activeFilter: LogCategory | 'all' = 'all'

  constructor(options: DebugLoggerOptions) {
    this.container = options.container
    this.maxLines = options.maxLines ?? 500
  }

  setFilter(filter: LogCategory | 'all'): void {
    this.activeFilter = filter
    this.render()
  }

  getFilter(): LogCategory | 'all' {
    return this.activeFilter
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
    const filtered =
      this.activeFilter === 'all'
        ? this.entries
        : this.entries.filter((e) => e.category === this.activeFilter)

    this.container.textContent = filtered
      .map((e) => `[${e.time}] [${e.category}] ${e.message}`)
      .join('\n')
  }
}
