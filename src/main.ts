import { TimeController, type SpeedMultiplier } from './core/time.ts'
import {
  applyKeyCityOwners,
  computeGridNeighbors,
  drawMapPreview,
  generateMap,
  getInitialOwners,
  hitTestTile,
  loadTerrainConfig,
  type TileOverlay,
} from './map/generator.ts'
import {
  createNewGame,
  deleteSave,
  loadGame,
  migrateSave,
  saveGame,
} from './core/save.ts'
import { gameTick, getArmyOnTile, playerCanAct } from './core/game.ts'
import { orderMarch } from './core/combat.ts'
import {
  buildTuntian,
  canBuildTuntian,
  canRecruit,
  recruitOnTile,
  TUNTIAN_COST,
} from './core/economy.ts'
import { DebugLogger, LOG_CATEGORIES, type LogCategory } from './ui/debug.ts'
import type { FactionId, GameSave, GeneratedMap, MapTile } from './types/index.ts'

const PLAYER_FACTION: FactionId = 'wei'

const logEl = document.querySelector<HTMLDivElement>('#log')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const panelInfoEl = document.querySelector<HTMLDivElement>('#panel-info')!
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
  const food = save.factions[PLAYER_FACTION]?.food ?? 0
  statusEl.textContent = `第 ${save.date} 天 · ${paused} · ×${time.getSpeed()} · 魏粮 ${food.toFixed(1)}`
}

function getNeighborTiles(tile: MapTile): MapTile[] {
  if (!map) return []
  return computeGridNeighbors(map, tile)
}

function formatTileBrief(tile: MapTile): string {
  return `${tile.name}(${tile.gridX},${tile.gridY})`
}

function buildOverlays(): Record<string, TileOverlay> {
  const overlays: Record<string, TileOverlay> = {}
  if (!save) return overlays

  for (const faction of Object.values(save.factions)) {
    for (const army of faction.armies) {
      const status = army.inCombat
        ? `战${army.combatDaysLeft ?? 0}`
        : army.marchDaysLeft
          ? `行${army.marchDaysLeft}`
          : undefined
      overlays[army.tileId] = { troops: army.troops, status }
    }
  }
  return overlays
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
  drawMapPreview(canvas, map, owners, selectedTileId, neighborIds, buildOverlays())
}

function updatePanel(): void {
  const recruitBtn = document.querySelector<HTMLButtonElement>('#btn-recruit')!
  const tuntianBtn = document.querySelector<HTMLButtonElement>('#btn-tuntian')!

  if (!save || !selectedTileId || !map) {
    panelInfoEl.textContent = '点击地图选择地块（你操控：魏）'
    recruitBtn.disabled = true
    tuntianBtn.disabled = true
    return
  }

  const tile = map.tileById[selectedTileId]
  const state = save.tiles[selectedTileId]
  if (!tile || !state) return

  const army = getArmyOnTile(save, selectedTileId)
  const isPlayer = playerCanAct(save, selectedTileId, PLAYER_FACTION)
  const food = save.factions[PLAYER_FACTION]?.food ?? 0

  const lines = [
    `${tile.name} · ${state.owner} · 粮产出参考地形`,
    army
      ? `驻军 ${army.troops} 兵${army.marchDaysLeft ? ` · 行军中${army.marchDaysLeft}天` : ''}${army.inCombat ? ` · 战斗中${army.combatDaysLeft}天` : ''}`
      : '无驻军',
    isPlayer ? '己方领地 · 点击邻格可调兵' : '非己方领地',
  ]
  panelInfoEl.textContent = lines.join(' | ')

  recruitBtn.disabled = !isPlayer || !canRecruit(save, PLAYER_FACTION)
  tuntianBtn.disabled =
    !isPlayer || !canBuildTuntian(save, selectedTileId) || food < TUNTIAN_COST
}

function dumpGameState(): void {
  if (!map || !save) return

  const lines: string[] = [
    `游戏日: ${save.date}`,
    `地图: ${map.gridSize}×${map.gridSize} = ${map.tiles.length} 地块`,
    `玩家势力: ${PLAYER_FACTION}`,
  ]

  if (selectedTileId && map.tileById[selectedTileId]) {
    const tile = map.tileById[selectedTileId]
    const neighbors = getNeighborTiles(tile)
    const owner = save.tiles[tile.id]?.owner ?? 'neutral'
    const army = getArmyOnTile(save, tile.id)
    lines.push(
      `选中: ${tile.name} (${tile.gridX},${tile.gridY}) 归属=${owner}`,
      `邻接 ${neighbors.length} 格: ${neighbors.map(formatTileBrief).join('、')}`,
      army ? `驻军: ${army.troops} 兵` : '驻军: 无',
    )
  }

  for (const [fid, faction] of Object.entries(save.factions)) {
    const troops = faction.armies.reduce((s, a) => s + a.troops, 0)
    lines.push(`势力 ${fid}: 粮=${faction.food.toFixed(1)} 军=${faction.armies.length}支/${troops}兵`)
  }

  logger.dump('游戏状态快照', lines)
}

async function startNewGame(): Promise<void> {
  if (!map) return
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
}

async function bootstrap(): Promise<void> {
  const terrainConfig = await loadTerrainConfig()
  map = generateMap(terrainConfig)

  log('map', `地图：${map.tiles.length} 地块，邻接=网格四向`)

  const existing = await loadGame()
  if (existing) {
    save = migrateSave(existing)
    log('system', `读档：第 ${save.date} 天 (v${save.version})`)
  } else {
    await startNewGame()
    log('system', '新游戏：魏蜀吴各 1500 兵于都城')
  }

  time = new TimeController({
    onTick: (day) => {
      if (!save || !map) return
      save.date = day

      const events = gameTick(save, map)

      if (events.ai && events.ai.type !== 'idle') {
        log('battle', `AI[${events.ai.faction}] ${events.ai.type}: ${events.ai.detail}`)
      }
      for (const m of events.marches) log('battle', m)
      for (const b of events.battles) log('battle', b)

      if (day % 5 === 0) log('tick', `第 ${day} 天`)
      if (day % 10 === 0) void saveGame(save)

      updateStatus()
      updatePanel()
      renderMap()
    },
    onPauseChange: (paused) => {
      log('system', paused ? '游戏暂停' : '游戏继续')
      updateStatus()
    },
  })
  time.setGameDay(save!.date)
  time.start()

  bindUi()
  updateStatus()
  updatePanel()
  renderMap()
  log('system', 'Sprint 2：募兵/屯田/点击邻格调兵；绿框=邻接')
}

function tryMoveArmy(fromTileId: string, toTileId: string): boolean {
  if (!save || !map) return false
  const fromTile = map.tileById[fromTileId]
  if (!fromTile || !fromTile.neighbors.includes(toTileId)) {
    log('system', '只能移动到邻接格')
    return false
  }

  const army = getArmyOnTile(save, fromTileId)
  if (!army || army.faction !== PLAYER_FACTION) {
    log('system', '该地块无己方驻军')
    return false
  }
  if (army.inCombat || army.marchDaysLeft) {
    log('system', '军队行军中或战斗中')
    return false
  }

  if (orderMarch(army, toTileId)) {
    const dest = map.tileById[toTileId]?.name ?? toTileId
    log('battle', `魏军 ${fromTile.name} → ${dest}（2天）`)
    updatePanel()
    renderMap()
    return true
  }
  return false
}

function bindUi(): void {
  const pauseBtn = document.querySelector<HTMLButtonElement>('#btn-pause')!
  const saveBtn = document.querySelector<HTMLButtonElement>('#btn-save')!
  const loadBtn = document.querySelector<HTMLButtonElement>('#btn-load')!
  const newBtn = document.querySelector<HTMLButtonElement>('#btn-new')!
  const clearBtn = document.querySelector<HTMLButtonElement>('#btn-log-clear')!
  const dumpBtn = document.querySelector<HTMLButtonElement>('#btn-log-dump')!
  const recruitBtn = document.querySelector<HTMLButtonElement>('#btn-recruit')!
  const tuntianBtn = document.querySelector<HTMLButtonElement>('#btn-tuntian')!

  pauseBtn.addEventListener('click', () => time?.togglePause())

  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed) as SpeedMultiplier
      time?.setSpeed(speed)
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      log('system', `速度 ×${speed}`)
      updateStatus()
    })
  })
  document.querySelector<HTMLButtonElement>('[data-speed="1"]')?.classList.add('active')

  clearBtn.addEventListener('click', () => logger.clear())

  dumpBtn.addEventListener('click', () => dumpGameState())

  for (const category of LOG_CATEGORIES) {
    const btn = document.querySelector<HTMLButtonElement>(`[data-filter="${category}"]`)
    btn?.addEventListener('click', () => {
      const enabled = logger.toggleCategory(category)
      btn.classList.toggle('active', enabled)
    })
  }

  recruitBtn.addEventListener('click', () => {
    if (!save || !selectedTileId) return
    const armyId = `army_${PLAYER_FACTION}_${selectedTileId}`
    if (recruitOnTile(save, selectedTileId, PLAYER_FACTION, armyId)) {
      log('system', `${selectedTileId} 募兵 +1000`)
      updatePanel()
      renderMap()
    }
  })

  tuntianBtn.addEventListener('click', () => {
    if (!save || !selectedTileId) return
    if (buildTuntian(save, selectedTileId, PLAYER_FACTION)) {
      log('system', `${selectedTileId} 建造屯田`)
      updatePanel()
      renderMap()
    }
  })

  saveBtn.addEventListener('click', async () => {
    if (!save) return
    await saveGame(save)
    log('system', `存档：第 ${save.date} 天`)
  })

  loadBtn.addEventListener('click', async () => {
    const loaded = await loadGame()
    if (!loaded) {
      log('system', '读档失败')
      return
    }
    save = migrateSave(loaded)
    time?.setGameDay(save.date)
    log('system', `读档：第 ${save.date} 天`)
    updateStatus()
    updatePanel()
    renderMap()
  })

  newBtn.addEventListener('click', async () => {
    if (!confirm('新开游戏？当前进度将被覆盖。')) return
    await deleteSave()
    await startNewGame()
    log('system', '新游戏已开始')
    updateStatus()
    updatePanel()
    renderMap()
  })

  canvas?.addEventListener('click', (e) => {
    if (!map || !save) return
    const tile = hitTestTile(canvas, map, e.clientX, e.clientY)
    if (!tile) return

    if (
      selectedTileId &&
      selectedTileId !== tile.id &&
      map.tileById[selectedTileId]?.neighbors.includes(tile.id)
    ) {
      if (tryMoveArmy(selectedTileId, tile.id)) return
    }

    selectedTileId = tile.id
    const owner = save.tiles[tile.id]?.owner ?? 'neutral'
    const neighbors = getNeighborTiles(tile)
    const army = getArmyOnTile(save, tile.id)
    log('tile', `选中 ${tile.name}(${tile.gridX},${tile.gridY}) 归属${owner}${army ? ` 兵${army.troops}` : ''}`)
    log('tile', `邻接 ${neighbors.length} 格: ${neighbors.map(formatTileBrief).join('、')}`)
    updatePanel()
    renderMap()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault()
      time?.togglePause()
    }
  })

  window.addEventListener('beforeunload', () => {
    if (save) void saveGame(save)
  })
}

bootstrap().catch((err) => {
  log('system', `启动失败：${err instanceof Error ? err.message : String(err)}`)
  statusEl.textContent = '启动失败'
})
