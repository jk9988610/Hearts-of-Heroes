import { assetUrl } from './core/paths.ts'
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
import { BattleAnimator } from './map/battle-animation.ts'
import {
  createNewGame,
  deleteSave,
  loadGame,
  migrateSave,
  saveGame,
} from './core/save.ts'
import { gameHourTick, playerCanAct } from './core/game.ts'
import {
  findArmyOnTile,
  getCombatHoursLeft,
  getMarchHoursLeft,
  MARCH_HOURS,
  orderMarch,
} from './core/combat.ts'
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
  loadPoliciesConfig,
} from './core/policies.ts'
import { checkVictory, getPlayerStatusHints } from './core/victory.ts'
import { LOCAL_VERSION } from './core/version.ts'
import { getFactionLabel } from './core/factions.ts'
import { formatGameTime, formatHoursBrief } from './core/time-scale.ts'
import { getVisibleTileIds } from './core/visibility.ts'
import { DebugLogger } from './ui/debug.ts'
import { bindDebugToolbar, logTickEvents } from './ui/debug-toolbar.ts'
import { buildGameSnapshot, formatTileSelect } from './ui/debug-reports.ts'
import { AlertBanner } from './ui/alerts.ts'
import { bindMapViewport } from './ui/map-viewport.ts'
import { showFactionModal } from './ui/faction-modal.ts'
import type { FactionId, GameSave, GeneratedMap, MapTile, PolicyConfig } from './types/index.ts'

const logEl = document.querySelector<HTMLDivElement>('#log')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const panelTileEl = document.querySelector<HTMLDivElement>('#panel-tile')!
const panelArmyEl = document.querySelector<HTMLDivElement>('#panel-army')!
const panelEventsEl = document.querySelector<HTMLDivElement>('#panel-events')!
const policyListEl = document.querySelector<HTMLDivElement>('#policy-list')!
const canvas = document.querySelector<HTMLCanvasElement>('#map')!
const mapViewport = document.querySelector<HTMLDivElement>('#map-viewport')!

const logger = new DebugLogger({ container: logEl })
const alerts = new AlertBanner(document.querySelector<HTMLDivElement>('#alert-banner')!)
const battleAnimator = new BattleAnimator(() => renderMap())

const MAX_RECENT_EVENTS = 5
const recentEvents: string[] = []

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

function pushRecentEvent(msg: string): void {
  recentEvents.unshift(msg)
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.length = MAX_RECENT_EVENTS
  if (panelEventsEl) {
    panelEventsEl.textContent = recentEvents.length ? recentEvents.join('\n') : '暂无'
  }
}

function updateStatus(): void {
  if (!time || !save) return
  const pf = playerFaction()
  const paused = time.isPaused() ? '已暂停' : '运行中'
  const food = save.factions[pf]?.food ?? 0
  const clock = time.getClock()
  const keys = map
    ? Object.values(map.tileById).filter(
        (t) => t.isKeyCity && save!.tiles[t.id]?.owner === pf,
      ).length
    : 0
  statusEl.textContent = `${formatGameTime(clock.day, clock.hour)} · ${getFactionLabel(pf)} · ${paused} · ×${time.getSpeed()} · 粮${food.toFixed(0)} · 城${keys}/6`
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

  const armyDisplay = buildArmyDisplay(save)
  battleAnimator.syncTargets(armyDisplay)

  const troopOverrides: Record<string, number> = {}
  for (const [tileId, overlay] of Object.entries(armyDisplay.overlays)) {
    if (overlay.troops > 0) {
      troopOverrides[tileId] = battleAnimator.getDisplayTroops(tileId, overlay.troops)
    }
  }

  drawMapPreview(
    canvas,
    map,
    owners,
    selectedTileId,
    neighborIds,
    armyDisplay,
    {
      troopOverrides,
      tileFlashes: battleAnimator.getTileFlashes(),
    },
  )
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
    panelTileEl.textContent = `操控：${getFactionLabel(pf)} · 点击地图选择地块`
    panelArmyEl.textContent = '—'
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

  panelTileEl.textContent = `${tile.name} · ${getFactionLabel(state.owner as FactionId)}${isPlayer ? ' · 己方' : ' · 非己方'}`

  if (army) {
    const marchH = getMarchHoursLeft(army)
    const combatH = getCombatHoursLeft(army)
    const parts = [`驻军 ${army.troops}`]
    if (marchH !== undefined && army.targetTileId) {
      const dest = map.tileById[army.targetTileId]?.name ?? army.targetTileId
      parts.push(`行军→${dest}（${formatHoursBrief(marchH)}）`)
    }
    if (army.inCombat && combatH !== undefined) {
      parts.push(`战斗中（${formatHoursBrief(combatH)}）`)
    }
    panelArmyEl.textContent = parts.join(' · ')
  } else {
    panelArmyEl.textContent = '无驻军 · 点邻格调兵'
  }

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

async function startNewGame(faction: FactionId): Promise<void> {
  if (!map) return
  pendingFaction = faction
  gameEnded = false
  alerts.hide()
  recentEvents.length = 0
  panelEventsEl.textContent = '暂无'

  const terrainConfig = await loadTerrainConfig()
  const owners = getInitialOwners(map)
  applyKeyCityOwners(terrainConfig, owners)
  const heroRes = await fetch(assetUrl('config/heroes.json'))
  const heroes = (await heroRes.json()) as { id: string; faction: string }[]
  const heroIdsByFaction: Record<string, string[]> = { wei: [], shu: [], wu: [] }
  for (const h of heroes) {
    if (heroIdsByFaction[h.faction]) heroIdsByFaction[h.faction].push(h.id)
  }
  save = createNewGame(owners, heroIdsByFaction, faction)
  await saveGame(save)
  time?.setClock(0, 0)
  time?.resume()
  selectedTileId = undefined
  alerts.show(`新游戏开始，你操控${getFactionLabel(faction)}`, 'success', 4000)
}

async function promptNewGame(overwrite: boolean): Promise<void> {
  const faction = await showFactionModal({
    title: overwrite ? '开新局 · 选择势力' : '选择操控势力',
    confirmLabel: overwrite ? '覆盖并开始' : '开始游戏',
  })
  if (!faction) return
  if (overwrite) await deleteSave()
  await startNewGame(faction)
  logger.log('system', `新游戏 · 操控${getFactionLabel(faction)}`)
  updateStatus()
  updatePanel()
  renderMap()
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
  pushRecentEvent(`${title}：${result.reason ?? ''}`)
  alert(`${title}！${result.reason}`)
}

async function bootstrap(): Promise<void> {
  document.querySelector('#app-version')!.textContent = `v${LOCAL_VERSION.version}`

  policies = await loadPoliciesConfig()
  const terrainConfig = await loadTerrainConfig()
  map = generateMap(terrainConfig)

  logger.log('map', `地图 ${map.tiles.length} 格 · 拖拽平移 · 滚轮/双指缩放`)

  const existing = await loadGame()
  if (existing) {
    save = migrateSave(existing)
    pendingFaction = save.playerFaction
    logger.log(
      'system',
      `读档 ${formatGameTime(save.date, save.hour ?? 0)} · 操控${getFactionLabel(save.playerFaction)}`,
    )
  } else {
    const faction = await showFactionModal({ title: '选择操控势力' })
    if (!faction) {
      pendingFaction = 'wei'
      await startNewGame('wei')
    } else {
      await startNewGame(faction)
    }
    logger.log('system', `新游戏 · 操控${getFactionLabel(pendingFaction)}`)
  }

  time = new TimeController({
    onHourTick: (clock) => {
      if (!save || !map || gameEnded) return

      const visible = getVisibleTileIds(map, canvas!, {
        scrollLeft: mapViewport.scrollLeft,
        scrollTop: mapViewport.scrollTop,
        clientWidth: mapViewport.clientWidth,
        clientHeight: mapViewport.clientHeight,
      })

      const events = gameHourTick(save, map, {
        playerFaction: playerFaction(),
        visibleTileIds: visible,
        clock,
      })

      logTickEvents(logger, {
        day: clock.day,
        hour: clock.hour,
        ai: events.ai.map((a) => ({
          faction: a.faction,
          type: a.type,
          detail: a.detail,
          mode: a.mode,
        })),
        marches: events.marches,
        battles: events.battles,
      })

      for (const m of events.marches) pushRecentEvent(m)
      for (const b of events.battles) pushRecentEvent(b)
      for (const flash of events.battleFlashes) {
        battleAnimator.triggerFlash(flash.tileId, flash.kind)
      }

      updateAlertsFromTick(events.battles)

      if (clock.hour === 0 && clock.day % 5 === 0) void saveGame(save)

      handleVictory()
      updateStatus()
      updatePanel()
      renderMap()
      battleAnimator.startContinuousLoop(() => buildArmyDisplay(save!))
    },
    onPauseChange: (paused) => {
      logger.log('system', paused ? '暂停' : '继续')
      updateStatus()
    },
  })
  time.setClock(save!.date, save!.hour ?? 0)
  time.start()

  bindUi()
  updateStatus()
  updatePanel()
  renderMap()
  logger.log('system', `就绪 v${LOCAL_VERSION.version} · Sprint A 体验打磨`)
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
  if (army.inCombat || getMarchHoursLeft(army)) {
    logger.log('system', '军队行军中或战斗中')
    return false
  }

  if (orderMarch(save, army, toTileId, MARCH_HOURS)) {
    const dest = map.tileById[toTileId]?.name ?? toTileId
    const hours = getMarchHoursLeft(army)!
    const msg = `${getFactionLabel(pf)}军 ${fromTile.name} → ${dest}（${formatHoursBrief(hours)}）`
    logger.log('battle', msg)
    pushRecentEvent(msg)
    alerts.show(`军队前往 ${dest}，${formatHoursBrief(hours)}后抵达`, 'info', 4000)
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
    logger.log('system', `存档 ${formatGameTime(save.date, save.hour ?? 0)}`)
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
    recentEvents.length = 0
    panelEventsEl.textContent = '暂无'
    time?.setClock(save.date, save.hour ?? 0)
    time?.resume()
    logger.log('system', `读档 ${formatGameTime(save.date, save.hour ?? 0)}`)
    updateStatus()
    updatePanel()
    renderMap()
  })

  newBtn.addEventListener('click', () => {
    void promptNewGame(true)
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
