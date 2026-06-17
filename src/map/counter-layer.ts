import type { Battalion, FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { getMarchHoursLeft } from '../core/combat.ts'
import {
  countBattalionTroops,
  isBattalionUnderstrength,
} from '../core/organization/helpers.ts'
import { listAllBattalions } from '../core/organization/queries.ts'
import { getFactionMarkerColor } from './army-display.ts'
import { getMapLayout } from './generator.ts'

/** 屏幕空间固定军棋尺寸（px），不随地图缩放变化 */
export const COUNTER_WIDTH_PX = 52
export const COUNTER_HEIGHT_PX = 22
export const COUNTER_STACK_GAP_PX = 2
export const COUNTER_TILE_PADDING_PX = 4

export interface CounterDisplayItem {
  battalionId: string
  tileId: string
  faction: FactionId
  designation: number
  /** 显示的千人队（军队）数量，非兵力 */
  displayBattalionCount: number
  hidden: boolean
  dugIn: boolean
  organization: number
  equipment: number
  selected: boolean
  status?: string
  stackIndex: number
}

export interface CounterBounds {
  battalionId: string
  tileId: string
  x: number
  y: number
  w: number
  h: number
}

function aggregationKey(b: Battalion): string {
  const understrength = isBattalionUnderstrength(b) ? 'u' : 'f'
  return `${b.faction}|${b.corpsId ?? '_'}|${b.designation}|${understrength}`
}

function gridDistance(
  map: GeneratedMap,
  tileA: string,
  tileB: string,
): number {
  const a = map.tileById[tileA]
  const b = map.tileById[tileB]
  if (!a || !b) return Infinity
  return Math.abs(a.gridX - b.gridX) + Math.abs(a.gridY - b.gridY)
}

/** 视口缩放越小，聚合范围越大（格数） */
export function aggregationDistanceForScale(viewportScale: number): number {
  if (viewportScale >= 1.0) return 0
  if (viewportScale >= 0.85) return 1
  if (viewportScale >= 0.75) return 2
  return 3
}

export function computeCounterBounds(
  map: GeneratedMap,
  layout: ReturnType<typeof getMapLayout>,
  item: CounterDisplayItem,
  viewportScale: number,
): CounterBounds | null {
  const tile = map.tileById[item.tileId]
  if (!tile) return null

  const { cell, offsetX, offsetY } = layout
  const cx = (offsetX + tile.gridX * cell + cell / 2) * viewportScale
  const tileBottom = (offsetY + tile.gridY * cell + cell) * viewportScale
  const stackOffset = item.stackIndex * (COUNTER_HEIGHT_PX + COUNTER_STACK_GAP_PX)

  const x = cx - COUNTER_WIDTH_PX / 2
  const y = tileBottom - COUNTER_TILE_PADDING_PX - COUNTER_HEIGHT_PX - stackOffset

  return {
    battalionId: item.battalionId,
    tileId: item.tileId,
    x,
    y,
    w: COUNTER_WIDTH_PX,
    h: COUNTER_HEIGHT_PX,
  }
}

export function hitTestCounter(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  items: CounterDisplayItem[],
  viewportScale: number,
  clientX: number,
  clientY: number,
): CounterDisplayItem | null {
  const rect = container.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  const layout = getMapLayout(canvas, map)
  const visible = items.filter((i) => !i.hidden)

  for (let i = visible.length - 1; i >= 0; i--) {
    const item = visible[i]!
    const bounds = computeCounterBounds(map, layout, item, viewportScale)
    if (!bounds) continue
    if (
      x >= bounds.x &&
      x <= bounds.x + bounds.w &&
      y >= bounds.y &&
      y <= bounds.y + bounds.h
    ) {
      return item
    }
  }

  return null
}

export function buildCounterDisplay(
  save: GameSave,
  map: GeneratedMap,
  viewportScale: number,
  options: {
    selectedBattalionId?: string
    selectedCorpsId?: string
    selectedCorpsIds?: string[]
  } = {},
): CounterDisplayItem[] {
  const battalionById = new Map(listAllBattalions(save).map((b) => [b.id, b]))
  const items: CounterDisplayItem[] = []

  for (const battalion of listAllBattalions(save)) {
    const marchH = getMarchHoursLeft(battalion)
    const isMarching = marchH !== undefined && marchH > 0 && battalion.targetTileId
    const displayTileId = isMarching ? battalion.targetTileId! : battalion.tileId
    const troops = countBattalionTroops(battalion)
    if (troops <= 0 && !isMarching) continue

    const org = battalion.organization ?? Math.min(100, Math.round((troops / 1000) * 100))
    const equip = battalion.equipment ?? org

    items.push({
      battalionId: battalion.id,
      tileId: displayTileId,
      faction: battalion.faction,
      designation: battalion.designation,
      displayBattalionCount: 1,
      hidden: false,
      dugIn: Boolean(battalion.dugIn) && !isMarching,
      organization: org,
      equipment: equip,
      selected:
        options.selectedBattalionId === battalion.id ||
        (options.selectedCorpsId !== undefined && battalion.corpsId === options.selectedCorpsId) ||
        (battalion.corpsId !== undefined &&
          (options.selectedCorpsIds?.includes(battalion.corpsId) ?? false)),
      status: isMarching
        ? `→${marchH}h`
        : battalion.inCombat
          ? '战'
          : undefined,
      stackIndex: 0,
    })
  }

  const aggDist = aggregationDistanceForScale(viewportScale)
  if (aggDist > 0) {
    aggregateCounters(items, map, battalionById, aggDist)
  }

  const perTile = new Map<string, number>()
  for (const item of items) {
    if (item.hidden) continue
    const n = perTile.get(item.tileId) ?? 0
    item.stackIndex = n
    perTile.set(item.tileId, n + 1)
  }

  return items
}

function aggregateCounters(
  items: CounterDisplayItem[],
  map: GeneratedMap,
  battalionById: Map<string, Battalion>,
  maxDistance: number,
): void {
  const visible = items.filter((i) => !i.hidden)
  const processed = new Set<string>()

  for (const seed of visible) {
    if (processed.has(seed.battalionId)) continue
    const battalion = battalionById.get(seed.battalionId)
    if (!battalion) continue
    const key = aggregationKey(battalion)

    const cluster: CounterDisplayItem[] = []
    const queue = [seed]
    processed.add(seed.battalionId)
    cluster.push(seed)

    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const other of visible) {
        if (processed.has(other.battalionId)) continue
        const ob = battalionById.get(other.battalionId)
        if (!ob || aggregationKey(ob) !== key) continue
        if (gridDistance(map, cur.tileId, other.tileId) > maxDistance) continue
        processed.add(other.battalionId)
        cluster.push(other)
        queue.push(other)
      }
    }

    if (cluster.length <= 1) continue

    const rep = cluster.reduce((a, b) =>
      a.battalionId < b.battalionId ? a : b,
    )
    let sum = 0
    for (const c of cluster) {
      sum += c.displayBattalionCount
      if (c.battalionId !== rep.battalionId) {
        c.hidden = true
      }
    }
    rep.displayBattalionCount = sum
  }
}

export function renderCounterLayer(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  items: CounterDisplayItem[],
  viewportScale: number,
): void {
  const layout = getMapLayout(canvas, map)
  container.replaceChildren()

  for (const item of items) {
    if (item.hidden) continue
    const bounds = computeCounterBounds(map, layout, item, viewportScale)
    if (!bounds) continue

    const el = document.createElement('div')
    el.className = 'map-counter'
    if (item.selected) el.classList.add('map-counter--selected')
    el.dataset.faction = item.faction
    el.dataset.battalionId = item.battalionId
    el.style.left = `${bounds.x}px`
    el.style.top = `${bounds.y}px`
    el.style.backgroundColor = getFactionMarkerColor(item.faction)

    const left = document.createElement('div')
    left.className = 'map-counter-left'
    left.innerHTML = `<span class="map-counter-type">步</span><span class="map-counter-des">${item.designation}</span>`

    const mid = document.createElement('div')
    mid.className = 'map-counter-mid'
    const count = document.createElement('span')
    count.className = 'map-counter-count'
    count.textContent = String(item.displayBattalionCount)
    const orgTrack = document.createElement('div')
    orgTrack.className = 'map-counter-bar-track'
    const orgFill = document.createElement('div')
    orgFill.className = 'map-counter-bar-fill map-counter-bar-fill--org'
    orgFill.style.width = `${Math.max(0, Math.min(100, item.organization))}%`
    orgTrack.append(orgFill)
    const equipTrack = document.createElement('div')
    equipTrack.className = 'map-counter-bar-track'
    const equipFill = document.createElement('div')
    equipFill.className = 'map-counter-bar-fill map-counter-bar-fill--equip'
    equipFill.style.width = `${Math.max(0, Math.min(100, item.equipment))}%`
    equipTrack.append(equipFill)
    mid.append(count, orgTrack, equipTrack)

    const right = document.createElement('div')
    right.className = 'map-counter-right'
    const trench = document.createElement('span')
    trench.className = item.dugIn
      ? 'map-counter-trench map-counter-trench--filled'
      : 'map-counter-trench'
    right.append(trench)

    el.append(left, mid, right)

    if (item.status) {
      const status = document.createElement('span')
      status.className = 'map-counter-status'
      status.textContent = item.status
      el.append(status)
    }

    container.appendChild(el)
  }
}
