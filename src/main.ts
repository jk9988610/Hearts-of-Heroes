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
import { checkVictory, getPlayerStatusHints } from './core/victory.ts'
import { LOCAL_VERSION } from './core/version.ts'
import { getFactionLabel, PLAYABLE_FACTIONS } from './core/factions.ts'
import { DebugLogger } from './ui/debug.ts'
import { bindDebugToolbar, logTickEvents } from './ui/debug-toolbar.ts'
import { buildGameSnapshot, formatTileSelect } from './ui/debug-reports.ts'
import { AlertBanner } from './ui/alerts.ts'
import { bindMapViewport } from './ui/map-viewport.ts'
import type { FactionId, GameSave, GeneratedMap, MapTile, PolicyConfig } from './types/index.ts'

const logEl = document.querySelector<HTMLDivElement>('#log')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const panelInfoEl = document.querySelector<HTMLDivElement>('#panel-info')!
const policyListEl = document.querySelector<HTMLDivElement>('#policy-list')!
const canvas = document.querySelector<HTMLCanvasElement>('#map')!
const mapViewport = document.querySelector<HTMLDivElement>('#map-viewport')!

const logger = new DebugLogger({ container: logEl })
const alerts = new AlertBanner(document.querySelector<HTMLDivElement>('#alert-banner')!)

let map: GeneratedMap | null = null
let save: GameSave | null = null
let time: TimeController | null = null
let policies: PolicyConfig[] = []
let selectedTileId: string | undefined
let pendingFaction: FactionId = 'wei'
let gameEnded = false

function playerFaction(): FactionId {
  return save?.playerFaction ?? pendingFaction
}

function updateStatus(): void {
  if (!time || !save) return
  const pf = playerFaction()
  const paused = time.isPaused() ? '已暂停' : '运行中'
  const food = save.factions[pf]?.food ?? 0
  const keys = map
    ? Object.values(map.tileById).filter(
        (t) => t.isKeyCity && save!.tiles[t.id]?.owner === pf,
      ).length
    : 0
  statusEl.textContent = `第 ${save.date} 天 · ${getFactionLabel(pf)} · ${paused} · ×${time.getSpeed()} · 粮${food.toFixed(0)} · 关键城${keys}/6`
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

function syncFactionButtons(): void {
  const pf = playerFaction()
  document.querySelectorAll<HTMLButtonElement>('[data-faction]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.faction === pf)
  })
}

function renderPolicies(): void {
  if (!save || !policyListEl) return
  const pf = playerFaction()
  policyListEl.innerHTML = ''

  for (const policy of policies) {
    const btn = document.createElement('button')
    const owned = save.factions[pf]?.policies.includes(policy.id)
    btn.type = 'button'
    btn.textContent = owned
      ? `✓ ${policy.name}`
      : `${policy.name} (${policy.cost}粮)`
    btn.disabled = gameEnded || owned || !canActivatePolicy(save, pf, policy)
    btn.addEventListener('click', () => {
      if (!save || activatePolicy(save, pf, policy)) {
        logger.log('system', `国策 ${policy.name} 已激活`)
        alerts.show(`国策「${policy.name}」已生效`, 'success')
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
  const pf = playerFaction()

  if (!save || !selectedTileId || !map) {
    panelInfoEl.textContent = `操控：${getFactionLabel(pf)} · 点击地图选择地块（可拖拽平移）`
    recruitBtn.disabled = true
    tuntianBtn.disabled = true
    renderPolicies()
    return
  }

  const tile = map.tileById[selectedTileId]
  const state = save.tiles[selectedTileId]
  if (!tile || !state) return

  const army = getArmyForUi(save, selectedTileId)
  const isPlayer = playerCanAct(save, selectedTileId, pf)
  const food = save.factions[pf]?.food ?? 0

  const lines = [
    `${tile.name} · ${getFactionLabel(state.owner as FactionId)}`,
    army
      ? `驻军 ${army.troops}${army.marchDaysLeft ? ` · 行→${army.targetTileId}(${army.marchDaysLeft}天)` : ''}${army.inCombat ? ` · 战${army.combatDaysLeft}天` : ''}`
      : '无驻军',
    isPlayer ? '己方 · 点邻格调兵' : '非己方',
  ]
  panelInfoEl.textContent = lines.join(' | ')

  recruitBtn.disabled = gameEnded || !isPlayer || !canRecruit(save, pf)
  tuntianBtn.disabled =
    gameEnded || !isPlayer || !canBuildTuntian(save, selectedTileId) || food < TUNTIAN_COST

  renderPolicies()
}

function updateAlertsFromTick(battles: string[]): void {
  if (!save) return
  const pf = playerFaction()
  const hints = getPlayerStatusHints(save, pf, battles)

  if (hints.foodWarning) {
    alerts.show(hints.foodWarning, hints.foodWarning.includes('粮尽') ? 'warn' : 'info', 8000)
  }
  if (battles.length > 0) {
    const relevant = battles.filter(
      (b) =>
        b.includes(pf) ||
        b.includes(getFactionLabel(pf)) ||
        b.includes('攻克') ||
        b.includes('守住'),
    )
    if (relevant.length > 0) {
      alerts.show(relevant[relevant.length - 1]!, 'battle', 5000)
    }
  }
}

function dumpGameState(): void {
  if (!map || !save) return
  const lines = buildGameSnapshot({
    save,
    map,
    playerFaction: playerFaction(),
    getNeighborTiles,
    formatTileBrief,
    selectedTileId,
  })
  logger.report('debug', '游戏状态快照', lines)
}

async function startNewGame(): Promise<void> {
  if (!map) return
  gameEnded = false
  alerts.hide()
  const terrainConfig = await loadTerrainConfig()
  const owners = getInitialOwners(map)
  applyKeyCityOwners(terrainConfig, owners)
  const heroRes = await fetch('/config/heroes.json')
  const heroes = (await heroRes.json()) as { id: string; faction: string }[]
  const heroIdsByFaction: Record<string, string[]> = { wei: [], shu: [], wu: [] }
  for (const h of heroes) {
    if (heroIdsByFaction[h.faction]) heroIdsByFaction[h.faction].push(h.id)
  }
  save = createNewGame(owners, heroIdsByFaction, pendingFaction)
  await saveGame(save)
  time?.setGameDay(0)
  time?.resume()
  selectedTileId = undefined
  syncFactionButtons()
  alerts.show(`新游戏开始，你操控${getFactionLabel(pendingFaction)}`, 'success', 4000)
}

function handleVictory(): void {
  if (!save || !map || gameEnded) return
  const pf = playerFaction()
  const result = checkVictory(save, map, pf)
  if (result.outcome === 'playing') return

  gameEnded = true
  time?.pause()
  const title = result.outcome === 'win' ? '胜利' : '失败'
  logger.report('system', title, [result.reason ?? '游戏结束'])
  alerts.show(`${title}：${result.reason}`, result.outcome === 'win' ? 'success' : 'warn', 15000)
  alert(`${title}！${result.reason}`)
}

async function bootstrap(): Promise<void> {
  document.querySelector('#app-version')!.textContent = `v${LOCAL_VERSION.version}`

  policies = await loadPoliciesConfig()
  const terrainConfig = await loadTerrainConfig()
  map = generateMap(terrainConfig)

  logger.log('map', `地图 ${map.tiles.length} 格 · 拖拽平移 · 驻军箭头可视化`)

  const existing = await loadGame()
  if (existing) {
    save = migrateSave(existing)
    pendingFaction = save.playerFaction
    logger.log('system', `读档 第${save.date}天 · 操控${getFactionLabel(save.playerFaction)}`)
  } else {
    await startNewGame()
    logger.log('system', `新游戏 · 操控${getFactionLabel(pendingFaction)}`)
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

      updateAlertsFromTick(events.battles)

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
  syncFactionButtons()
  updateStatus()
  updatePanel()
  renderMap()
  logger.log('system', `就绪 v${LOCAL_VERSION.version}`)
}

function tryMoveArmy(fromTileId: string, toTileId: string): boolean {
  if (!save || !map || gameEnded) return false
  const pf = playerFaction()
  const fromTile = map.tileById[fromTileId]
  if (!fromTile || !fromTile.neighbors.includes(toTileId)) {
    logger.log('system', '只能移动到邻接格')
    return false
  }

  const army = findArmyOnTile(save, fromTileId)
  if (!army || army.faction !== pf) {
    logger.log('system', '该地块无可用己方驻军')
    return false
  }
  if (army.inCombat || army.marchDaysLeft) {
    logger.log('system', '军队行军中或战斗中')
    return false
  }

  const days = getMarchDays(save, pf, MARCH_DAYS)
  if (orderMarch(army, toTileId, days)) {
    const dest = map.tileById[toTileId]?.name ?? toTileId
    logger.log('battle', `${getFactionLabel(pf)}军 ${fromTile.name} → ${dest}（${days}天）`)
    alerts.show(`军队前往 ${dest}，${days} 天后抵达`, 'info', 4000)
    updatePanel()
    renderMap()
    return true
  }
  return false
}

function onMapTap(clientX: number, clientY: number): void {
  if (!map || !save) return
  const tile = hitTestTile(canvas, map, clientX, clientY)
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

  bindMapViewport({
    viewport: mapViewport,
    canvas: canvas!,
    onTap: onMapTap,
  })

  for (const faction of PLAYABLE_FACTIONS) {
    const btn = document.querySelector<HTMLButtonElement>(`[data-faction="${faction}"]`)
    btn?.addEventListener('click', () => {
      pendingFaction = faction
      syncFactionButtons()
      logger.log('system', `已选势力 ${getFactionLabel(faction)}（下次新游戏生效）`)
      if (!save) return
      alerts.show(
        `已选${getFactionLabel(faction)}，点「新游戏」切换操控势力`,
        'info',
        4000,
      )
    })
  }

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
    const pf = playerFaction()
    const armyId = `army_${pf}_${selectedTileId}`
    if (recruitOnTile(save, selectedTileId, pf, armyId)) {
      logger.log('system', `募兵 ${selectedTileId} +1000`)
      alerts.show('募兵成功 +1000', 'success', 3000)
      updatePanel()
      renderMap()
    }
  })

  tuntianBtn.addEventListener('click', () => {
    if (!save || !selectedTileId) return
    const pf = playerFaction()
    if (buildTuntian(save, selectedTileId, pf)) {
      logger.log('system', `屯田 ${selectedTileId}`)
      alerts.show('屯田建成，产出×2', 'success', 3000)
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
    pendingFaction = save.playerFaction
    gameEnded = false
    time?.setGameDay(save.date)
    time?.resume()
    syncFactionButtons()
    logger.log('system', `读档 第${save.date}天`)
    updateStatus()
    updatePanel()
    renderMap()
  })

  newBtn.addEventListener('click', async () => {
    if (!confirm(`以${getFactionLabel(pendingFaction)}开新局？当前进度将被覆盖。`)) return
    await deleteSave()
    await startNewGame()
    logger.log('system', '新游戏已开始')
    updateStatus()
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
