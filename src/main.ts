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
import { buildArmyDisplay, getArmyForUi } from './map/army-display.ts'
import {
  createNewGame,
  deleteSave,
  loadGame,
  migrateSave,
  saveGame,
} from './core/save.ts'
import { gameTick, playerCanAct } from './core/game.ts'
import { MARCH_DAYS, findArmyOnTile, orderMarch } from './core/combat.ts'
import {
  buildTuntian,
  canBuildTuntian,
  canRecruit,
  recruitOnTile,
  TUNTIAN_COST,
} from './core/economy.ts'
import {
  activatePolicy,
  canActivatePolicy,
  getMarchDays,
  loadPoliciesConfig,
} from './core/policies.ts'
import { checkVictory } from './core/victory.ts'
import { LOCAL_VERSION } from './core/version.ts'
import { DebugLogger } from './ui/debug.ts'
import { bindDebugToolbar, logTickEvents } from './ui/debug-toolbar.ts'
import { buildGameSnapshot, formatTileSelect } from './ui/debug-reports.ts'
import type { FactionId, GameSave, GeneratedMap, MapTile, PolicyConfig } from './types/index.ts'

const PLAYER_FACTION: FactionId = 'wei'

const logEl = document.querySelector<HTMLDivElement>('#log')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const panelInfoEl = document.querySelector<HTMLDivElement>('#panel-info')!
const policyListEl = document.querySelector<HTMLDivElement>('#policy-list')!
const canvas = document.querySelector<HTMLCanvasElement>('#map')!

const logger = new DebugLogger({ container: logEl })

let map: GeneratedMap | null = null
let save: GameSave | null = null
let time: TimeController | null = null
let policies: PolicyConfig[] = []
let selectedTileId: string | undefined
let gameEnded = false

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
  drawMapPreview(
    canvas,
    map,
    owners,
    selectedTileId,
    neighborIds,
    buildArmyDisplay(save),
  )
}

function renderPolicies(): void {
  if (!save || !policyListEl) return
  policyListEl.innerHTML = ''

  for (const policy of policies) {
    const btn = document.createElement('button')
    const owned = save.factions[PLAYER_FACTION]?.policies.includes(policy.id)
    btn.type = 'button'
    btn.textContent = owned
      ? `✓ ${policy.name}`
      : `${policy.name} (${policy.cost}粮)`
    btn.disabled = owned || !canActivatePolicy(save, PLAYER_FACTION, policy)
    btn.addEventListener('click', () => {
      if (!save || activatePolicy(save, PLAYER_FACTION, policy)) {
        logger.log('system', `国策 ${policy.name} 已激活`)
        updatePanel()
        renderPolicies()
        renderMap()
      }
    })
    policyListEl.appendChild(btn)
  }
}

function updatePanel(): void {
  const recruitBtn = document.querySelector<HTMLButtonElement>('#btn-recruit')!
  const tuntianBtn = document.querySelector<HTMLButtonElement>('#btn-tuntian')!

  if (!save || !selectedTileId || !map) {
    panelInfoEl.textContent = '点击地图选择地块（你操控：魏）'
    recruitBtn.disabled = true
    tuntianBtn.disabled = true
    renderPolicies()
    return
  }

  const tile = map.tileById[selectedTileId]
  const state = save.tiles[selectedTileId]
  if (!tile || !state) return

  const army = getArmyForUi(save, selectedTileId)
  const isPlayer = playerCanAct(save, selectedTileId, PLAYER_FACTION)
  const food = save.factions[PLAYER_FACTION]?.food ?? 0

  const lines = [
    `${tile.name} · ${state.owner}`,
    army
      ? `驻军 ${army.troops} 兵${army.marchDaysLeft ? ` · 行→${army.targetTileId}(${army.marchDaysLeft}天)` : ''}${army.inCombat ? ` · 战${army.combatDaysLeft}天` : ''}`
      : '无驻军',
    isPlayer ? '己方 · 选中有兵地块后点邻格调兵' : '非己方',
  ]
  panelInfoEl.textContent = lines.join(' | ')

  recruitBtn.disabled = gameEnded || !isPlayer || !canRecruit(save, PLAYER_FACTION)
  tuntianBtn.disabled =
    gameEnded ||
    !isPlayer ||
    !canBuildTuntian(save, selectedTileId) ||
    food < TUNTIAN_COST

  renderPolicies()
}

function dumpGameState(): void {
  if (!map || !save) return
  const lines = buildGameSnapshot({
    save,
    map,
    playerFaction: PLAYER_FACTION,
    selectedTileId,
    getNeighborTiles,
    formatTileBrief,
  })
  logger.report('debug', '游戏状态快照', lines)
}

function handleVictory(): void {
  if (!save || !map || gameEnded) return
  const result = checkVictory(save, map, PLAYER_FACTION)
  if (result.outcome === 'playing') return

  gameEnded = true
  time?.pause()
  logger.report('system', result.outcome === 'win' ? '胜利' : '失败', [
    result.reason ?? '游戏结束',
  ])
  alert(result.outcome === 'win' ? `胜利！${result.reason}` : `失败：${result.reason}`)
}

async function startNewGame(): Promise<void> {
  if (!map) return
  gameEnded = false
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
  document.querySelector('#app-version')!.textContent = `v${LOCAL_VERSION.version}`

  policies = await loadPoliciesConfig()
  const terrainConfig = await loadTerrainConfig()
  map = generateMap(terrainConfig)

  logger.log('map', `地图 ${map.tiles.length} 地块 · 驻军显示=色点+兵力+行军箭头`)

  const existing = await loadGame()
  if (existing) {
    save = migrateSave(existing)
    logger.log('system', `读档 第${save.date}天 v${save.version}`)
  } else {
    await startNewGame()
    logger.log('system', '新游戏 魏蜀吴各1500兵于都城')
  }

  time = new TimeController({
    onTick: (day) => {
      if (!save || !map || gameEnded) return
      save.date = day

      const events = gameTick(save, map)
      logTickEvents(logger, {
        day,
        ai: events.ai,
        marches: events.marches,
        battles: events.battles,
      })

      if (day % 10 === 0) void saveGame(save)
      handleVictory()

      updateStatus()
      updatePanel()
      renderMap()
    },
    onPauseChange: (paused) => {
      logger.log('system', paused ? '暂停' : '继续')
      updateStatus()
    },
  })
  time.setGameDay(save!.date)
  time.start()

  bindUi()
  updateStatus()
  updatePanel()
  renderMap()
  logger.log('system', `就绪 v${LOCAL_VERSION.version} · 日志从上到下 · 行军见箭头`)
}

function tryMoveArmy(fromTileId: string, toTileId: string): boolean {
  if (!save || !map || gameEnded) return false
  const fromTile = map.tileById[fromTileId]
  if (!fromTile || !fromTile.neighbors.includes(toTileId)) {
    logger.log('system', '只能移动到邻接格')
    return false
  }

  const army = findArmyOnTile(save, fromTileId)
  if (!army || army.faction !== PLAYER_FACTION) {
    logger.log('system', '该地块无可用己方驻军')
    return false
  }
  if (army.inCombat || army.marchDaysLeft) {
    logger.log('system', '军队战斗中')
    return false
  }

  const days = getMarchDays(save, PLAYER_FACTION, MARCH_DAYS)
  if (orderMarch(army, toTileId, days)) {
    const dest = map.tileById[toTileId]?.name ?? toTileId
    logger.log('battle', `魏军 ${fromTile.name} → ${dest}（${days}天，见箭头）`)
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
  const recruitBtn = document.querySelector<HTMLButtonElement>('#btn-recruit')!
  const tuntianBtn = document.querySelector<HTMLButtonElement>('#btn-tuntian')!

  bindDebugToolbar(logger, {
    onDump: dumpGameState,
    filterButtonSelector: '[data-filter]',
  })

  pauseBtn.addEventListener('click', () => time?.togglePause())

  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed) as SpeedMultiplier
      time?.setSpeed(speed)
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      logger.log('system', `速度 ×${speed}`)
      updateStatus()
    })
  })
  document.querySelector<HTMLButtonElement>('[data-speed="1"]')?.classList.add('active')

  recruitBtn.addEventListener('click', () => {
    if (!save || !selectedTileId) return
    const armyId = `army_${PLAYER_FACTION}_${selectedTileId}`
    if (recruitOnTile(save, selectedTileId, PLAYER_FACTION, armyId)) {
      logger.log('system', `募兵 ${selectedTileId} +1000`)
      updatePanel()
      renderMap()
    }
  })

  tuntianBtn.addEventListener('click', () => {
    if (!save || !selectedTileId) return
    if (buildTuntian(save, selectedTileId, PLAYER_FACTION)) {
      logger.log('system', `屯田 ${selectedTileId}`)
      updatePanel()
      renderMap()
    }
  })

  saveBtn.addEventListener('click', async () => {
    if (!save) return
    await saveGame(save)
    logger.log('system', `存档 第${save.date}天`)
  })

  loadBtn.addEventListener('click', async () => {
    const loaded = await loadGame()
    if (!loaded) {
      logger.log('system', '读档失败')
      return
    }
    save = migrateSave(loaded)
    gameEnded = false
    time?.setGameDay(save.date)
    logger.log('system', `读档 第${save.date}天`)
    updateStatus()
    updatePanel()
    renderMap()
  })

  newBtn.addEventListener('click', async () => {
    if (!confirm('新开游戏？当前进度将被覆盖。')) return
    await deleteSave()
    await startNewGame()
    logger.log('system', '新游戏已开始')
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
    const lines = formatTileSelect({
      tile,
      owner: save.tiles[tile.id]?.owner ?? 'neutral',
      army: getArmyForUi(save, tile.id),
      neighbors: getNeighborTiles(tile),
      formatTileBrief,
    })
    for (const line of lines) logger.log('tile', line)
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
  logger.log('system', `启动失败: ${err instanceof Error ? err.message : String(err)}`)
  statusEl.textContent = '启动失败'
})
