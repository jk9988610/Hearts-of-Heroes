export type LogCategory = 'tick' | 'tile' | 'system' | 'map' | 'debug' | 'battle'

export const LOG_CATEGORIES: LogCategory[] = [
  'tick',
  'tile',
  'system',
  'map',
  'debug',
  'battle',
]

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  tick: 'Tick',
  tile: '地块',
  system: '系统',
  map: '地图',
  debug: '详情',
  battle: '战斗',
}

export interface LogEntry {
  time: string
  category: LogCategory
  message: string
}

export interface DebugLoggerOptions {
  container: HTMLElement
  maxLines?: number
}

export function formatLogLine(entry: LogEntry): string {
  const label = LOG_CATEGORY_LABELS[entry.category]
  return `[${entry.time}] [${label}] ${entry.message}`
}

export class DebugLogger {
  private readonly container: HTMLElement
  private readonly maxLines: number
  private entries: LogEntry[] = []
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
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString(),
      category,
      message,
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxLines) {
      this.entries.shift()
    }
    console.log(formatLogLine(entry))
    this.render()
  }

  /** 结构化报告：从上到下顺序输出 */
  report(category: LogCategory, title: string, lines: string[]): void {
    this.log(category, `── ${title} ──`)
    for (const line of lines) {
      this.log(category, `  ${line}`)
    }
  }

  clear(): void {
    this.entries = []
    this.render()
  }

  getFilteredEntries(): LogEntry[] {
    return this.entries.filter((e) => this.enabledCategories.has(e.category))
  }

  getFilteredText(): string {
    return this.getFilteredEntries().map(formatLogLine).join('\n')
  }

  getAllText(): string {
    return this.entries.map(formatLogLine).join('\n')
  }

  async copyVisible(): Promise<boolean> {
    const text = this.getFilteredText()
    if (!text) return false
    return copyText(text)
  }

  private render(): void {
    this.container.textContent = this.getFilteredText()
    this.container.scrollTop = this.container.scrollHeight
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}
