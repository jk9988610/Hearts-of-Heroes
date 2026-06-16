import { TimeController, type SpeedMultiplier } from './core/time.ts'
import {
  applyKeyCityOwners,
  computeGridNeighbors,
  drawMapPreview,
  generateMap,
  getInitialOwners,
  hitTestTile,
  loadTerrainConfig,
} from './map/generator.ts'
import {
  createNewGame,
  deleteSave,
  loadGame,
  saveGame,
} from './core/save.ts'
import { DebugLogger, type LogCategory } from './ui/debug.ts'
import type { GameSave, GeneratedMap, MapTile } from './types/index.ts'

const logEl = document.querySelector<HTMLDivElement>('#log')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const canvas = document.querySelector<HTMLCanvasElement>('#map')!

const logger = new DebugLogger({ container: logEl })

let map: GeneratedMap | null = null
let save: GameSave | null = null
let time: TimeController | null = null
let selectedTileId: string | undefined

function log(category: LogCategory, message: string): void {
  logger.log(category, message)
}

function updateStatus(): void {
  if (!time || !save) return
  const paused = time.isPaused() ? '已暂停' : '运行中'
  statusEl.textContent = `第 ${save.date} 天 · ${paused} · 速度 ×${time.getSpeed()}`
}

function getNeighborTiles(tile: MapTile): MapTile[] {
  if (!map) return []
  return computeGridNeighbors(map, tile)
}

function formatTileBrief(tile: MapTile): string {
  return `${tile.name}(${tile.gridX},${tile.gridY})`
}

function renderMap(): void {
  if (!map || !save || !canvas) return
  const owners: Record<string, string> = {}
  for (const [id, tile] of Object.entries(save.tiles)) {
    owners[id] = tile.owner
  }
  const neighborIds = selectedTileId
    ? map.tileById[selectedTileId]
      ? getNeighborTiles(map.tileById[selectedTileId]).map((t) => t.id)
      : []
    : undefined
  drawMapPreview(canvas, map, owners, selectedTileId, neighborIds)
}

function dumpGameState(): void {
  if (!map || !save) return

  const lines: string[] = [
    `游戏日: ${save.date}`,
    `地图: ${map.gridSize}×${map.gridSize} = ${map.tiles.length} 地块`,
    `规则: 格 = 地块，邻接 = 上下左右四向（最多 4 格）`,
  ]

  if (selectedTileId && map.tileById[selectedTileId]) {
    const tile = map.tileById[selectedTileId]
    const neighbors = getNeighborTiles(tile)
    const owner = save.tiles[tile.id]?.owner ?? 'neutral'
    lines.push(
      `选中: ${tile.name} id=${tile.id} 格坐标=(${tile.gridX},${tile.gridY})`,
      `地形=${tile.type} 归属=${owner} 关键城=${tile.isKeyCity}`,
      `邻接 ${neighbors.length} 格: ${neighbors.map(formatTileBrief).join('、') || '无'}`,
    )
  } else {
    lines.push('选中: 无（点击地图选地块）')
  }

  for (const [fid, faction] of Object.entries(save.factions)) {
    lines.push(`势力 ${fid}: 粮=${faction.food} 军=${faction.armies.length} 策=${faction.policies.length}`)
  }

  logger.dump('游戏状态快照', lines)
}

async function bootstrap(): Promise<void> {
  const terrainConfig = await loadTerrainConfig()
  map = generateMap(terrainConfig)

  log(
    'map',
    `地图生成：${map.tiles.length} 地块，关键城 ${terrainConfig.keyTiles.length} 座，邻接按网格四向计算`,
  )

  const existing = await loadGame()
  if (existing) {
    save = existing
    log('system', `读档成功：第 ${save.date} 天`)
  } else {
    const owners = getInitialOwners(map)
    applyKeyCityOwners(terrainConfig, owners)
    const heroRes = await fetch('/config/heroes.json')
    const heroes = (await heroRes.json()) as { id: string; faction: string }[]
    const heroIdsByFaction: Record<string, string[]> = { wei: [], shu: [], wu: [] }
    for (const h of heroes) {
      if (heroIdsByFaction[h.faction]) heroIdsByFaction[h.faction].push(h.id)
    }
    save = createNewGame(owners, heroIdsByFaction)
    await saveGame(save)
    log('system', '无存档，已创建新游戏并写入 IndexedDB')
  }

  time = new TimeController({
    onTick: (day) => {
      if (!save) return
      save.date = day
      if (day % 5 === 0) {
        log('tick', `gameTick → 第 ${day} 天`)
      }
      updateStatus()
      renderMap()
    },
    onPauseChange: (paused) => {
      log('system', paused ? '游戏暂停' : '游戏继续')
      updateStatus()
    },
  })
  time.setGameDay(save.date)
  time.start()

  bindUi()
  updateStatus()
  renderMap()
  log('system', '就绪。空格暂停；点击地块见邻接（绿框=邻接格）')
}

function bindUi(): void {
  const pauseBtn = document.querySelector<HTMLButtonElement>('#btn-pause')!
  const saveBtn = document.querySelector<HTMLButtonElement>('#btn-save')!
  const loadBtn = document.querySelector<HTMLButtonElement>('#btn-load')!
  const newBtn = document.querySelector<HTMLButtonElement>('#btn-new')!
  const clearBtn = document.querySelector<HTMLButtonElement>('#btn-log-clear')!
  const dumpBtn = document.querySelector<HTMLButtonElement>('#btn-log-dump')!

  pauseBtn.addEventListener('click', () => time?.togglePause())

  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed) as SpeedMultiplier
      time?.setSpeed(speed)
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      log('system', `速度切换为 ×${speed}`)
      updateStatus()
    })
  })
  document.querySelector<HTMLButtonElement>('[data-speed="1"]')?.classList.add('active')

  clearBtn.addEventListener('click', () => {
    logger.clear()
  })

  dumpBtn.addEventListener('click', () => dumpGameState())

  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter as LogCategory | 'all'
      logger.setFilter(filter)
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  saveBtn.addEventListener('click', async () => {
    if (!save) return
    await saveGame(save)
    log('system', `手动存档：第 ${save.date} 天`)
  })

  loadBtn.addEventListener('click', async () => {
    const loaded = await loadGame()
    if (!loaded) {
      log('system', '读档失败：本地无存档')
      return
    }
    save = loaded
    time?.setGameDay(save.date)
    log('system', `读档：第 ${save.date} 天`)
    updateStatus()
    renderMap()
  })

  newBtn.addEventListener('click', async () => {
    if (!map) return
    if (!confirm('确定新开游戏？当前进度将被覆盖。')) return
    await deleteSave()
    const terrainConfig = await loadTerrainConfig()
    const owners = getInitialOwners(map)
    applyKeyCityOwners(terrainConfig, owners)
    const heroRes = await fetch('/config/heroes.json')
    const heroes = (await heroRes.json()) as { id: string; faction: string }[]
    const heroIdsByFaction: Record<string, string[]> = { wei: [], shu: [], wu: [] }
    for (const h of heroes) {
      if (heroIdsByFaction[h.faction]) heroIdsByFaction[h.faction].push(h.id)
    }
    save = createNewGame(owners, heroIdsByFaction)
    await saveGame(save)
    time?.setGameDay(0)
    selectedTileId = undefined
    log('system', '新游戏已开始')
    updateStatus()
    renderMap()
  })

  canvas?.addEventListener('click', (e) => {
    if (!map) return
    const tile = hitTestTile(canvas, map, e.clientX, e.clientY)
    if (!tile) return
    selectedTileId = tile.id
    const owner = save?.tiles[tile.id]?.owner ?? 'neutral'
    const neighbors = getNeighborTiles(tile)
    log(
      'tile',
      `选中 ${tile.name} 格(${tile.gridX},${tile.gridY}) ${tile.type} 归属${owner}`,
    )
    log(
      'tile',
      `邻接 ${neighbors.length} 格: ${neighbors.map(formatTileBrief).join('、')}`,
    )
    renderMap()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault()
      time?.togglePause()
    }
  })

  window.addEventListener('beforeunload', () => {
    if (save) {
      void saveGame(save)
    }
  })
}

bootstrap().catch((err) => {
  log('system', `启动失败：${err instanceof Error ? err.message : String(err)}`)
  statusEl.textContent = '启动失败，见日志'
})
