import type { DebugLogger } from './debug.ts'
import { LOG_CATEGORIES, type LogCategory } from './debug.ts'
import { formatTickEvents, type TickLogInput } from './debug-reports.ts'
import {
  LOCAL_VERSION,
  buildVersionReport,
  fetchRemoteVersion,
} from '../core/version.ts'

/** 将 gameTick 事件写入日志（统一入口） */
export function logTickEvents(logger: DebugLogger, input: TickLogInput): void {
  const { tick, battle } = formatTickEvents(input)
  if (tick) logger.log('tick', tick)
  for (const msg of battle) logger.log('battle', msg)
}

async function runVersionCheck(logger: DebugLogger): Promise<void> {
  const online = location.protocol.startsWith('http')
  const remote = online ? await fetchRemoteVersion(3000) : null
  const lines = buildVersionReport(LOCAL_VERSION, remote, online)
  logger.report('debug', '版本检查', lines)
}

/** 绑定调试工具栏按钮 */
export function bindDebugToolbar(
  logger: DebugLogger,
  options: {
    onDump: () => void
    filterButtonSelector: string
  },
): void {
  const clearBtn = document.querySelector<HTMLButtonElement>('#btn-log-clear')
  const dumpBtn = document.querySelector<HTMLButtonElement>('#btn-log-dump')
  const copyBtn = document.querySelector<HTMLButtonElement>('#btn-log-copy')
  const versionBtn = document.querySelector<HTMLButtonElement>('#btn-version-check')

  clearBtn?.addEventListener('click', () => logger.clear())

  dumpBtn?.addEventListener('click', () => options.onDump())

  copyBtn?.addEventListener('click', async () => {
    const ok = await logger.copyVisible()
    logger.log('system', ok ? '已复制当前可见日志' : '复制失败：无可见日志')
  })

  versionBtn?.addEventListener('click', () => {
    void runVersionCheck(logger)
  })

  document.querySelectorAll<HTMLButtonElement>(options.filterButtonSelector).forEach((btn) => {
    const category = btn.dataset.filter as LogCategory | undefined
    if (!category || !LOG_CATEGORIES.includes(category)) return
    btn.addEventListener('click', () => {
      const enabled = logger.toggleCategory(category)
      btn.classList.toggle('active', enabled)
    })
  })
}
