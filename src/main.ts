import { assetUrl } from './core/paths.ts'
import { TimeController, type SpeedMultiplier } from './core/time.ts'
import {
  applyKeyCityOwners,
  computeGridNeighbors,
  generateMap,
  getInitialOwners,
  hitTestTile,
  loadTerrainConfig,
} from './map/generator.ts'
import { buildArmyDisplay, getArmyForUi } from './map/army-display.ts'
import { buildCounterDisplay, hitTestCounter, isAggregatedCounter, renderCounterLayer } from './map/counter-layer.ts'
import { renderLabelLayer } from './map/label-layer.ts'
import { BattleAnimator } from './map/battle-animation.ts'
import { drawMapLayer } from './core/map-layers/renderer.ts'
import { DEFAULT_MAP_LAYER, type MapLayerId } from './core/map-layers/types.ts'
import {
  createNewGame,
  deleteSave,
  loadGame,
  migrateSave,
  saveGame,
} from './core/save.ts'
import { gameHourTick, playerCanAct } from './core/game.ts'
import {
  findBattalionOnTile,
  getCombatHoursLeft,
  getMarchHoursLeft,
  MARCH_HOURS,
  orderMarch,
} from './core/combat.ts'
import { countBattalionTroops, getCorpsLabel } from './core/organization/helpers.ts'
import {
  attachBattalionToCorps,
  appointGeneral,
  createStandbyCorps,
  getSelectedBattalionForCorpsOp,
} from './core/organization/corps-ops.ts'
import {
  cancelCorpsMarch,
  defendCorps,
  trainCorps,
} from './core/organization/corps-commands.ts'
import {
  appointMarshal,
  cancelArmyGroupMarch,
  createArmyGroup,
  defendArmyGroup,
  disbandArmyGroup,
  findArmyGroupById,
  getArmyGroupLabel,
  getCorpsIdsInGroup,
  getFactionArmyGroups,
  getEligibleCorpsForArmyGroup,
  trainArmyGroup,
} from './core/organization/army-group-ops.ts'
import { setHeroRegistry } from './core/organization/hero-assign.ts'
import { findBattalionById, findCorpsById, getStandbyCorps } from './core/organization/queries.ts'
import {
  buildTuntian,
  canBuildTuntian,
  canRecruit,
  recruitOnTile,
  TUNTIAN_COST,
} from './core/economy.ts'
import {
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
import { CorpsCommandBar } from './ui/shell/corps-command-bar.ts'
import { bindMapViewport, type MapViewportController } from './ui/map-viewport.ts'
import { showFactionModal } from './ui/faction-modal.ts'
import { ModalHost } from './ui/modal-host.ts'
import { bindMinimap } from './ui/minimap.ts'
import { bindLayerSwitcher } from './ui/shell/layer-switcher.ts'
import { CorpsBar } from './ui/shell/corps-bar.ts'
import { CorpsDetail } from './ui/shell/corps-detail.ts'
import { ArmyGroupDetail } from './ui/shell/army-group-detail.ts'
import { BattalionDetail } from './ui/shell/battalion-detail.ts'
import { CounterStackFloat } from './ui/shell/counter-stack-float.ts'
import { renderPolicyTree } from './ui/shell/policy-tree.ts'
import type { FactionId, GameSave, GeneratedMap, HeroConfig, MapTile, PolicyConfig } from './types/index.ts'

const logEl = document.querySelector<HTMLDivElement>('#log')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const panelTileEl = document.querySelector<HTMLDivElement>('#panel-tile')!
const panelArmyEl = document.querySelector<HTMLDivElement>('#panel-army')!
const eventsPanelEl = document.querySelector<HTMLDivElement>('#events-panel')!
const policyTreeEl = document.querySelector<HTMLDivElement>('#policy-tree')!
const canvas = document.querySelector<HTMLCanvasElement>('#map')!
const labelLayer = document.querySelector<HTMLDivElement>('#label-layer')!
const counterLayer = document.querySelector<HTMLDivElement>('#counter-layer')!
const mapStack = document.querySelector<HTMLDivElement>('#map-stack')!
const mapViewport = document.querySelector<HTMLDivElement>('#map-viewport')!
const minimapCanvas = document.querySelector<HTMLCanvasElement>('#minimap')!
const logger = new DebugLogger({ container: logEl })
const alerts = new AlertBanner(document.querySelector<HTMLDivElement>('#alert-banner')!)
const battleAnimator = new BattleAnimator(() => renderMap())
let corpsDetail: CorpsDetail | null = null
let armyGroupDetail: ArmyGroupDetail | null = null
let battalionDetail: BattalionDetail | null = null
let counterStackFloat: CounterStackFloat | null = null

const MAX_RECENT_EVENTS = 8
const recentEvents: string[] = []

let map: GeneratedMap | null = null
let save: GameSave | null = null
let time: TimeController | null = null
let policies: PolicyConfig[] = []
let heroes: HeroConfig[] = []
let selectedTileId: string | undefined
let selectedBattalionId: string | undefined
let pendingFaction: FactionId = 'wei'
let gameEnded = false
let mapLayer: MapLayerId = DEFAULT_MAP_LAYER
let corpsBar: CorpsBar | null = null
let corpsCommandBar: CorpsCommandBar | null = null
let mapViewportCtrl: MapViewportController | null = null
let selectedCorpsId: string | null = null
let selectedArmyGroupId: string | null = null
let redrawMinimap: (() => void) | null = null
let modalHost: ModalHost | null = null
let lastCounterItems: ReturnType<typeof buildCounterDisplay> = []

function playerFaction(): FactionId {
  return save?.playerFaction ?? pendingFaction
}

function pushRecentEvent(msg: string): void {
  recentEvents.unshift(msg)
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.length = MAX_RECENT_EVENTS
  if (eventsPanelEl) {
    eventsPanelEl.textContent = recentEvents.length ? recentEvents.join('\n') : '暂无'
  }
}

function selectedPlayerTileName(): string | null {
  if (!save || !map) return null
  const tileId = resolveSelectedPlayerTileId()
  if (!tileId) return null
  return map.tileById[tileId]?.name ?? null
}

function resolveSelectedPlayerTileId(): string | undefined {
  if (!save) return undefined
  const pf = playerFaction()
  if (selectedTileId && playerCanAct(save, selectedTileId, pf)) {
    return selectedTileId
  }
  if (selectedBattalionId) {
    const battalion = findBattalionById(save, selectedBattalionId)
    if (
      battalion &&
      battalion.faction === pf &&
      playerCanAct(save, battalion.tileId, pf)
    ) {
      return battalion.tileId
    }
  }
  return undefined
}

function resolveSelectedPlayerBattalion(): ReturnType<typeof findBattalionById> {
  if (!save) return null
  const pf = playerFaction()
  if (selectedBattalionId) {
    const battalion = findBattalionById(save, selectedBattalionId)
    if (!battalion || battalion.faction !== pf) return null
    if (battalion.inCombat || getMarchHoursLeft(battalion)) return null
    return battalion
  }
  if (selectedTileId) {
    return getSelectedBattalionForCorpsOp(save, selectedTileId, pf)
  }
  return null
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

function syncCorpsCommandBar(): void {
  if (!save) {
    corpsCommandBar?.hide()
    return
  }
  const pf = playerFaction()

  if (selectedArmyGroupId) {
    const group = findArmyGroupById(save, selectedArmyGroupId)
    if (!group || group.faction !== pf) {
      selectedArmyGroupId = null
      corpsCommandBar?.hide()
      return
    }
    corpsCommandBar?.show()
    corpsCommandBar?.refresh()
    return
  }

  if (!selectedCorpsId) {
    corpsCommandBar?.hide()
    return
  }

  const corps = findCorpsById(save, selectedCorpsId)
  if (!corps || corps.faction !== pf) {
    selectedCorpsId = null
    corpsCommandBar?.hide()
    return
  }
  corpsCommandBar?.show()
  corpsCommandBar?.refresh()
}

function renderMap(): void {
  if (!map || !save || !canvas) return
  const owners: Record<string, string> = {}
  for (const [id, tile] of Object.entries(save.tiles)) {
    owners[id] = tile.owner
  }
  const highlightTileId = selectedTileId
  const neighborSourceId =
    selectedBattalionId
      ? findBattalionById(save, selectedBattalionId)?.tileId
      : selectedTileId
  const neighborIds = neighborSourceId
    ? map.tileById[neighborSourceId]
      ? getNeighborTiles(map.tileById[neighborSourceId]).map((t) => t.id)
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

  const useCounters = mapLayer === 'military'
  const scale = mapViewportCtrl?.getScale() ?? 1

  drawMapLayer(mapLayer, {
    canvas,
    map,
    save,
    owners,
    highlightId: highlightTileId,
    neighborIds,
    armyDisplay: useCounters ? armyDisplay : undefined,
    militaryOptions: {
      troopOverrides,
      tileFlashes: battleAnimator.getTileFlashes(),
      skipUnitMarkers: useCounters,
    },
  })

  renderLabelLayer(labelLayer, canvas, map, scale)

  if (useCounters) {
    const group = selectedArmyGroupId ? findArmyGroupById(save, selectedArmyGroupId) : null
    const counters = buildCounterDisplay(save, map, scale, {
      playerFaction: playerFaction(),
      selectedBattalionId: selectedBattalionId ?? undefined,
      selectedCorpsId: selectedCorpsId ?? undefined,
      selectedCorpsIds: group ? getCorpsIdsInGroup(save, group) : undefined,
    })
    lastCounterItems = counters
    renderCounterLayer(counterLayer, canvas, map, counters, scale)
  } else {
    lastCounterItems = []
    counterLayer.replaceChildren()
  }

  redrawMinimap?.()
  syncCounterStackFloat()
}

function syncCounterStackFloat(): void {
  if (!save || !map || mapLayer !== 'military' || !selectedBattalionId) {
    counterStackFloat?.hide()
    return
  }
  const battalionId = selectedBattalionId
  const scale = mapViewportCtrl?.getScale() ?? 1
  const counter = lastCounterItems.find(
    (c) =>
      !c.hidden &&
      (c.battalionId === battalionId || c.mergedBattalionIds?.includes(battalionId)),
  )
  if (counter && isAggregatedCounter(counter)) {
    counterStackFloat?.show(save, map, counter, lastCounterItems, scale)
  } else {
    counterStackFloat?.hide()
  }
}

function renderPolicies(): void {
  if (!save || !policyTreeEl) return
  renderPolicyTree(policyTreeEl, save, policies, playerFaction(), () => {
    logger.log('system', '国策已更新')
    updatePanel()
    renderMap()
  })
}

function updatePanel(): void {
  const recruitBtn = document.querySelector<HTMLButtonElement>('#btn-recruit')!
  const tuntianBtn = document.querySelector<HTMLButtonElement>('#btn-tuntian')!
  const pf = playerFaction()

  corpsBar?.refresh()
  syncCorpsCommandBar()

  if (!save || !map) {
    panelTileEl.textContent = `操控：${getFactionLabel(pf)} · 点击地图选择地块或军棋`
    panelArmyEl.textContent = '—'
    recruitBtn.disabled = true
    tuntianBtn.disabled = true
    return
  }

  if (selectedBattalionId) {
    const battalion = findBattalionById(save, selectedBattalionId)
    if (!battalion) {
      selectedBattalionId = undefined
      updatePanel()
      return
    }
    const tile = map.tileById[battalion.tileId]
    const troops = countBattalionTroops(battalion)
    const marchH = getMarchHoursLeft(battalion)
    const combatH = getCombatHoursLeft(battalion)
    const isPlayer = battalion.faction === pf

    panelTileEl.textContent = tile
      ? `${tile.name} · 军棋 ${battalion.designation}队${isPlayer ? ' · 己方' : ''}`
      : `军棋 ${battalion.designation}队`
    const parts = [`千人队 ×1 · ${troops}人`]
    if (marchH !== undefined && battalion.targetTileId) {
      const dest = map.tileById[battalion.targetTileId]?.name ?? battalion.targetTileId
      parts.push(`→${dest}（${formatHoursBrief(marchH)}）`)
    }
    if (battalion.inCombat && combatH !== undefined) {
      parts.push(`战（${formatHoursBrief(combatH)}）`)
    }
    panelArmyEl.textContent = parts.join(' · ')
    recruitBtn.disabled = true
    tuntianBtn.disabled = true
    return
  }

  if (!selectedTileId) {
    panelTileEl.textContent = `操控：${getFactionLabel(pf)} · 点击地图选择地块或军棋`
    panelArmyEl.textContent = '—'
    recruitBtn.disabled = true
    tuntianBtn.disabled = true
    return
  }

  const tile = map.tileById[selectedTileId]
  const state = save.tiles[selectedTileId]
  if (!tile || !state) return

  const battalion = getArmyForUi(save, selectedTileId)
  const isPlayer = playerCanAct(save, selectedTileId, pf)
  const food = save.factions[pf]?.food ?? 0

  panelTileEl.textContent = `${tile.name} · ${getFactionLabel(state.owner as FactionId)}${isPlayer ? ' · 己方' : ''}`

  if (battalion) {
    const troops = countBattalionTroops(battalion)
    const marchH = getMarchHoursLeft(battalion)
    const combatH = getCombatHoursLeft(battalion)
    const parts = [`${battalion.designation}队 ${troops}人`]
    if (marchH !== undefined && battalion.targetTileId) {
      const dest = map.tileById[battalion.targetTileId]?.name ?? battalion.targetTileId
      parts.push(`→${dest}（${formatHoursBrief(marchH)}）`)
    }
    if (battalion.inCombat && combatH !== undefined) {
      parts.push(`战（${formatHoursBrief(combatH)}）`)
    }
    panelArmyEl.textContent = parts.join(' · ')
  } else {
    panelArmyEl.textContent = isPlayer ? '无驻军' : '—'
  }

  const onMilitary = mapLayer === 'military'
  recruitBtn.disabled = gameEnded || !isPlayer || !canRecruit(save, pf) || !onMilitary
  tuntianBtn.disabled =
    gameEnded || !isPlayer || !canBuildTuntian(save, selectedTileId) || food < TUNTIAN_COST || !onMilitary
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
  eventsPanelEl.textContent = '暂无'
  corpsDetail?.hide()
  armyGroupDetail?.hide()
  battalionDetail?.hide()

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
  selectedBattalionId = undefined
  selectedCorpsId = null
  selectedArmyGroupId = null
  corpsCommandBar?.hide()
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

function bindShell(): void {
  modalHost = new ModalHost(document.querySelector('#modal-root')!)
  modalHost.registerPanels([
    { id: 'debug', title: '调试', element: document.querySelector('#modal-debug')! },
    { id: 'policies', title: '国策', element: document.querySelector('#modal-policies')! },
    { id: 'events', title: '近期事件', element: document.querySelector('#modal-events')! },
  ])

  document.querySelector('#btn-modal-debug')!.addEventListener('click', () => {
    modalHost?.toggle('debug', '调试')
  })
  document.querySelector('#btn-modal-policies')!.addEventListener('click', () => {
    renderPolicies()
    modalHost?.toggle('policies', '国策')
  })
  document.querySelector('#btn-modal-events')!.addEventListener('click', () => {
    modalHost?.toggle('events', '近期事件')
  })

  bindDebugToolbar(logger, {
    onDump: dumpGameState,
    filterButtonSelector: '#modal-debug [data-filter]',
  })

  bindLayerSwitcher(document.querySelector('#layer-switcher')!, (layer) => {
    mapLayer = layer
    logger.log('map', `图层 → ${layer}`)
    updatePanel()
    renderMap()
  })

  corpsDetail = new CorpsDetail(document.querySelector('#corps-float')!, {
    onAppoint: (corpsId, heroId) => {
      if (!save || !map) return
      const pf = playerFaction()
      const result = appointGeneral(save, corpsId, heroId, pf)
      alerts.show(result.message, result.ok ? 'success' : 'warn', 2500)
      if (result.ok) {
        logger.log('system', result.message)
        corpsBar?.refresh()
        corpsDetail?.refresh(save, map, heroes, pf)
        updatePanel()
        renderMap()
      }
    },
    onBattalionClick: (_corpsId, battalionId) => {
      if (!save || !map) return
      battalionDetail?.show(save, map, battalionId)
    },
  })

  battalionDetail = new BattalionDetail(document.querySelector('#battalion-float')!)
  counterStackFloat = new CounterStackFloat(document.querySelector('#counter-stack-float')!, {
    onSelect: (battalionId) => {
      if (!save || !map) return
      selectedBattalionId = battalionId
      selectedTileId = undefined
      updatePanel()
      renderMap()
      const counter = lastCounterItems.find(
        (c) =>
          !c.hidden &&
          (c.battalionId === battalionId || c.mergedBattalionIds?.includes(battalionId)),
      )
      const scale = mapViewportCtrl?.getScale() ?? 1
      if (counter) {
        counterStackFloat?.show(save, map, counter, lastCounterItems, scale)
      }
    },
  })

  corpsCommandBar = new CorpsCommandBar(document.querySelector('#corps-command-bar')!, {
    getCorpsLabel: () => {
      if (!save) return '编制'
      if (selectedArmyGroupId) {
        const group = findArmyGroupById(save, selectedArmyGroupId)
        return group ? getArmyGroupLabel(group, heroes) : '集团军'
      }
      if (!selectedCorpsId) return '将军队'
      const corps = findCorpsById(save, selectedCorpsId)
      return corps ? getCorpsLabel(corps, heroes) : '将军队'
    },
    onTrain: () => {
      if (!save) return
      const pf = playerFaction()
      const result = selectedArmyGroupId
        ? trainArmyGroup(save, selectedArmyGroupId, pf)
        : selectedCorpsId
          ? trainCorps(save, selectedCorpsId, pf)
          : { ok: false, message: '未选中编制' }
      alerts.show(result.message, result.ok ? 'success' : 'warn', 2500)
      if (result.ok) {
        updatePanel()
        renderMap()
      }
    },
    onDefend: () => {
      if (!save) return
      const pf = playerFaction()
      const result = selectedArmyGroupId
        ? defendArmyGroup(save, selectedArmyGroupId, pf)
        : selectedCorpsId
          ? defendCorps(save, selectedCorpsId, pf)
          : { ok: false, message: '未选中编制' }
      alerts.show(result.message, result.ok ? 'success' : 'warn', 2500)
      if (result.ok) {
        updatePanel()
        renderMap()
      }
    },
    onCancelMarch: () => {
      if (!save) return
      const pf = playerFaction()
      const result = selectedArmyGroupId
        ? cancelArmyGroupMarch(save, selectedArmyGroupId, pf)
        : selectedCorpsId
          ? cancelCorpsMarch(save, selectedCorpsId, pf)
          : { ok: false, message: '未选中编制' }
      alerts.show(result.message, result.ok ? 'success' : 'warn', 2500)
      if (result.ok) {
        updatePanel()
        renderMap()
      }
    },
  })

  armyGroupDetail = new ArmyGroupDetail(document.querySelector('#army-group-float')!, {
    onAppointMarshal: (groupId, heroId) => {
      if (!save) return
      const pf = playerFaction()
      const result = appointMarshal(save, groupId, heroId, pf)
      alerts.show(result.message, result.ok ? 'success' : 'warn', 2500)
      if (result.ok) {
        armyGroupDetail?.refresh(save, heroes, pf)
        corpsBar?.refresh()
        renderMap()
      }
    },
    onDisband: (groupId) => {
      if (!save) return
      const pf = playerFaction()
      const result = disbandArmyGroup(save, groupId, pf)
      alerts.show(result.message, result.ok ? 'success' : 'warn', 2500)
      if (result.ok) {
        selectedArmyGroupId = null
        armyGroupDetail?.hide()
        corpsBar?.refresh()
        syncCorpsCommandBar()
        renderMap()
      }
    },
    onCorpsClick: (corpsId) => {
      if (!save || !map) return
      selectedArmyGroupId = null
      selectedCorpsId = corpsId
      corpsDetail?.show(save, map, corpsId, heroes, playerFaction())
      armyGroupDetail?.hide()
      corpsBar?.refresh()
      syncCorpsCommandBar()
      renderMap()
    },
  })

  corpsBar = new CorpsBar(
    {
      canCreateCorps: () => selectedPlayerTileName() !== null,
      getStandbyCorps: () => {
        if (!save || !map) return []
        const pf = playerFaction()
        return getStandbyCorps(save, pf).map((c) => ({
          id: c.id,
          label: getCorpsLabel(c, heroes),
          tileName: map!.tileById[c.tileId]?.name ?? c.tileId,
        }))
      },
      getArmyGroups: () => {
        if (!save) return []
        return getFactionArmyGroups(save, playerFaction()).map((g) => ({
          id: g.id,
          label: getArmyGroupLabel(g, heroes),
          anchorCorpsId: g.anchorCorpsId ?? g.corpsIds[0] ?? '',
        }))
      },
      getSelectedArmyGroupId: () => selectedArmyGroupId,
      canShowCreateArmyGroup: () => {
        if (!save || !selectedCorpsId) return false
        const corps = findCorpsById(save, selectedCorpsId)
        return Boolean(corps?.standby && !corps.armyGroupId)
      },
      onArmyGroupClick: (groupId) => {
        if (!save) return
        selectedArmyGroupId = groupId
        selectedCorpsId = null
        corpsDetail?.hide()
        armyGroupDetail?.show(save, groupId, heroes, playerFaction())
        corpsBar?.refresh()
        syncCorpsCommandBar()
        renderMap()
      },
      onCreateArmyGroup: () => {
        if (!selectedCorpsId) return
        openArmyGroupModal(selectedCorpsId)
      },
      getSelectedCorpsId: () => selectedCorpsId,
      onNewCorps: () => {
        if (!save || !map) return
        const pf = playerFaction()
        const tileId = resolveSelectedPlayerTileId()
        if (!tileId) return
        const tileName = map.tileById[tileId]?.name ?? tileId
        const { corps, attachedBattalion } = createStandbyCorps(save, pf, tileId)
        selectedCorpsId = corps.id
        selectedArmyGroupId = null
        armyGroupDetail?.hide()
        logger.log('system', `新编将军队（待命）@${tileName}`)
        const attachMsg = attachedBattalion ? `，收纳 ${attachedBattalion.designation}队` : ''
        alerts.show(`已登记待命将军队 @${tileName}${attachMsg}`, 'info', 3000)
        corpsBar?.refresh()
        updatePanel()
        renderMap()
      },
      onStandbyClick: (corpsId) => {
        if (!save || !map) return
        selectedCorpsId = corpsId
        selectedArmyGroupId = null
        armyGroupDetail?.hide()
        corpsDetail?.show(save, map, corpsId, heroes, playerFaction())
        corpsBar?.refresh()
        syncCorpsCommandBar()
        renderMap()
      },
      onStandbyLongPress: (corpsId) => {
        if (!save || !map) return
        const pf = playerFaction()
        const battalion = resolveSelectedPlayerBattalion()
        if (!battalion) {
          alerts.show('请先在地图上选中己方千人队', 'warn', 2500)
          return
        }
        const result = attachBattalionToCorps(save, corpsId, battalion.id, pf)
        alerts.show(result.message, result.ok ? 'success' : 'warn', 2500)
        if (result.ok) {
          logger.log('system', result.message)
          corpsBar?.refresh()
          if (corpsDetail?.getCurrentCorpsId() === corpsId) {
            corpsDetail.refresh(save, map, heroes, pf)
          }
          updatePanel()
          renderMap()
        }
      },
    },
    document.querySelector('#corps-grid')!,
  )
}

function openArmyGroupModal(anchorCorpsId?: string): void {
  if (!save) return
  const modal = document.querySelector<HTMLDivElement>('#army-group-modal')!
  const listEl = document.querySelector<HTMLDivElement>('#army-group-pick-list')!
  const confirmBtn = document.querySelector<HTMLButtonElement>('#army-group-confirm')!
  const cancelBtn = document.querySelector<HTMLButtonElement>('#army-group-cancel')!
  const hintEl = modal.querySelector('.corps-float-hint')
  const pf = playerFaction()
  const corps = getEligibleCorpsForArmyGroup(save, pf)
  const selected = new Set<string>()
  if (anchorCorpsId) selected.add(anchorCorpsId)

  if (hintEl) {
    hintEl.textContent = anchorCorpsId
      ? '已锚定选中的待命将军队，再勾选至少 1 个其它将军队'
      : '勾选 ≥2 个将军队'
  }

  listEl.innerHTML = corps.length
    ? corps
        .map((c) => {
          const locked = c.id === anchorCorpsId
          const checked = selected.has(c.id) ? 'checked' : ''
          const disabled = locked ? 'disabled' : ''
          return `<label class="ag-pick-item"><input type="checkbox" value="${c.id}" ${checked} ${disabled} /> ${getCorpsLabel(c, heroes)}${locked ? '（锚定）' : ''}</label>`
        })
        .join('')
    : '<p class="corps-float-hint">无可编入的将军队</p>'

  const syncConfirm = () => {
    confirmBtn.disabled = selected.size < 2
  }

  listEl.querySelectorAll('input[type=checkbox]').forEach((input) => {
    input.addEventListener('change', () => {
      const el = input as HTMLInputElement
      if (el.checked) selected.add(el.value)
      else selected.delete(el.value)
      syncConfirm()
    })
  })
  syncConfirm()
  modal.hidden = false

  const close = () => {
    modal.hidden = true
  }

  confirmBtn.onclick = () => {
    const result = createArmyGroup(save!, pf, [...selected], anchorCorpsId)
    alerts.show(result.message, result.ok ? 'success' : 'warn', 3000)
    if (result.ok && result.group) {
      selectedArmyGroupId = result.group.id
      selectedCorpsId = anchorCorpsId ?? null
      armyGroupDetail?.show(save!, result.group.id, heroes, pf)
      corpsBar?.refresh()
      syncCorpsCommandBar()
      renderMap()
    }
    close()
  }
  cancelBtn.onclick = close
}

async function bootstrap(): Promise<void> {
  document.querySelector('#app-version')!.textContent = `v${LOCAL_VERSION.version}`

  policies = await loadPoliciesConfig()
  const heroRes = await fetch(assetUrl('config/heroes.json'))
  heroes = (await heroRes.json()) as HeroConfig[]
  setHeroRegistry(heroes)
  const terrainConfig = await loadTerrainConfig()
  map = generateMap(terrainConfig)

  logger.log('map', `指挥台 v0.9 · 集团军 · 国策树 · 粮尽溃散`)

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
      for (const s of events.starvation) {
        pushRecentEvent(s)
        if (s.includes(playerFaction())) {
          alerts.show(s, 'warn', 5000)
        }
      }
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

  bindShell()
  bindUi()
  updateStatus()
  updatePanel()
  renderMap()
  logger.log('system', `就绪 v${LOCAL_VERSION.version} · v0.9`)
}

function tryMoveArmy(fromTileId: string, toTileId: string): boolean {
  if (!save || !map || gameEnded || mapLayer !== 'military') return false
  const pf = playerFaction()
  const fromTile = map.tileById[fromTileId]
  if (!fromTile || !fromTile.neighbors.includes(toTileId)) {
    logger.log('system', '只能移动到邻接格')
    return false
  }

  const battalion = findBattalionOnTile(save, fromTileId)
  if (!battalion || battalion.faction !== pf) {
    logger.log('system', '该地块无可用己方驻军')
    return false
  }
  if (battalion.inCombat || getMarchHoursLeft(battalion)) {
    logger.log('system', '军队行军中或战斗中')
    return false
  }

  if (orderMarch(save, battalion, toTileId, MARCH_HOURS)) {
    const dest = map.tileById[toTileId]?.name ?? toTileId
    const hours = getMarchHoursLeft(battalion)!
    const msg = `${getFactionLabel(pf)} ${battalion.designation}队 ${fromTile.name} → ${dest}（${formatHoursBrief(hours)}）`
    logger.log('battle', msg)
    pushRecentEvent(msg)
    alerts.show(`军队前往 ${dest}，${formatHoursBrief(hours)}后抵达`, 'info', 4000)
    updatePanel()
    renderMap()
    return true
  }
  return false
}

function onMapCommand(clientX: number, clientY: number): void {
  if (!map || !save || mapLayer !== 'military') return
  const battalion = resolveSelectedPlayerBattalion()
  if (!battalion) return

  const tile = hitTestTile(canvas, map, clientX, clientY)
  if (!tile) return

  const fromTileId = battalion.tileId
  if (
    fromTileId !== tile.id &&
    map.tileById[fromTileId]?.neighbors.includes(tile.id)
  ) {
    tryMoveArmy(fromTileId, tile.id)
  }
}

function onMapTap(clientX: number, clientY: number): void {
  if (!map || !save) return

  if (mapLayer === 'military' && lastCounterItems.length > 0) {
    const counter = hitTestCounter(counterLayer, canvas, map, lastCounterItems, mapViewportCtrl?.getScale() ?? 1, clientX, clientY)
    if (counter) {
      selectedBattalionId = counter.battalionId
      selectedTileId = undefined
      selectedCorpsId = null
      selectedArmyGroupId = null
      corpsDetail?.hide()
      armyGroupDetail?.hide()
      corpsCommandBar?.hide()

      const battalion = findBattalionById(save, counter.battalionId)
      if (battalion) {
        const tile = map.tileById[battalion.tileId]
        logger.log(
          'tile',
          `选中军棋 ${battalion.designation}队 @${tile?.name ?? battalion.tileId}`,
        )
      }
      updatePanel()
      renderMap()
      return
    }
  }

  counterStackFloat?.hide()

  const tile = hitTestTile(canvas, map, clientX, clientY)
  if (!tile) return

  selectedTileId = tile.id
  selectedBattalionId = undefined
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

  mapViewportCtrl = bindMapViewport({
    viewport: mapViewport,
    interactionRoot: mapStack,
    canvas: canvas!,
    overlayElements: [labelLayer, counterLayer],
    onTap: onMapTap,
    onLongPress: onMapCommand,
    onContextMenu: onMapCommand,
    onScaleChange: () => renderMap(),
  })

  redrawMinimap = bindMinimap({
    canvas: minimapCanvas,
    mainCanvas: canvas,
    viewport: mapViewport,
    map: map!,
    getSave: () => save,
    getHighlightTileId: () => selectedTileId,
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
    if (recruitOnTile(save, selectedTileId, pf)) {
      logger.log('system', `募兵 ${selectedTileId} +100`)
      alerts.show('募兵成功 +100（填入缺编百人队）', 'success', 3000)
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
    eventsPanelEl.textContent = '暂无'
    corpsDetail?.hide()
    battalionDetail?.hide()
    selectedTileId = undefined
    selectedBattalionId = undefined
    selectedCorpsId = null
    corpsCommandBar?.hide()
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
