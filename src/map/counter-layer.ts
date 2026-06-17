import type { Battalion, FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { getMarchHoursLeft } from '../core/combat.ts'
import {
  countBattalionTroops,
  isBattalionUnderstrength,
} from '../core/organization/helpers.ts'
import { listAllBattalions } from '../core/organization/queries.ts'
import { getFactionMarkerColor } from './army-display.ts'
import { getMapLayout } from './generator.ts'

/** 低于此视口缩放时启用相邻同类军棋聚合 */
export const COUNTER_AGGREGATE_SCALE = 1.0

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

function areAdjacent(
  map: GeneratedMap,
  tileA: string,
  tileB: string,
): boolean {
  const a = map.tileById[tileA]
  const b = map.tileById[tileB]
  if (!a || !b) return false
  return Math.abs(a.gridX - b.gridX) + Math.abs(a.gridY - b.gridY) === 1
}

export function computeCounterBounds(
  map: GeneratedMap,
  layout: ReturnType<typeof getMapLayout>,
  item: CounterDisplayItem,
): CounterBounds | null {
  const tile = map.tileById[item.tileId]
  if (!tile) return null

  const { cell, offsetX, offsetY } = layout
  const px = offsetX + tile.gridX * cell
  const py = offsetY + tile.gridY * cell

  const w = Math.max(52, cell * 0.88)
  const h = Math.max(22, cell * 0.32)
  const stackOffset = item.stackIndex * (h + 2)
  const x = px + (cell - w) / 2
  const y = py + cell - h - 4 - stackOffset

  return { battalionId: item.battalionId, tileId: item.tileId, x, y, w, h }
}

export function hitTestCounter(
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  items: CounterDisplayItem[],
  clientX: number,
  clientY: number,
): CounterDisplayItem | null {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (clientX - rect.left) * scaleX
  const y = (clientY - rect.top) * scaleY

  const layout = getMapLayout(canvas, map)
  const visible = items.filter((i) => !i.hidden)

  for (let i = visible.length - 1; i >= 0; i--) {
    const item = visible[i]!
    const bounds = computeCounterBounds(map, layout, item)
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

  if (viewportScale < COUNTER_AGGREGATE_SCALE) {
    aggregateAdjacentCounters(items, map, battalionById)
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

function aggregateAdjacentCounters(
  items: CounterDisplayItem[],
  map: GeneratedMap,
  battalionById: Map<string, Battalion>,
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
        if (!areAdjacent(map, cur.tileId, other.tileId)) continue
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

export function drawCounterLayer(
  canvas: HTMLCanvasElement,
  map: GeneratedMap,
  items: CounterDisplayItem[],
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const layout = getMapLayout(canvas, map)
  for (const item of items) {
    if (item.hidden) continue
    drawSingleCounter(ctx, map, layout, item)
  }
}

function drawSingleCounter(
  ctx: CanvasRenderingContext2D,
  map: GeneratedMap,
  layout: ReturnType<typeof getMapLayout>,
  item: CounterDisplayItem,
): void {
  const bounds = computeCounterBounds(map, layout, item)
  if (!bounds) return

  const { x, y, w, h } = bounds
  const baseColor = getFactionMarkerColor(item.faction)

  ctx.fillStyle = baseColor
  ctx.globalAlpha = 0.92
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1

  if (item.selected) {
    ctx.strokeStyle = '#ffd700'
    ctx.lineWidth = 2
  } else {
    ctx.strokeStyle = '#2a2010'
    ctx.lineWidth = 1
  }
  ctx.strokeRect(x, y, w, h)

  const leftW = w * 0.22
  const rightW = w * 0.14

  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(x, y, leftW, h)
  ctx.fillRect(x + w - rightW, y, rightW, h)

  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.max(8, h * 0.38)}px ui-monospace, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('步', x + leftW / 2, y + h * 0.35)
  ctx.font = `bold ${Math.max(7, h * 0.32)}px ui-monospace, monospace`
  ctx.fillText(`${item.designation}`, x + leftW / 2, y + h * 0.72)

  const midX = x + leftW + 4
  const midW = w - leftW - rightW - 8

  ctx.fillStyle = '#1a1208'
  ctx.font = `bold ${Math.max(9, h * 0.45)}px ui-monospace, monospace`
  ctx.textAlign = 'left'
  ctx.fillText(String(item.displayBattalionCount), midX, y + h * 0.38)

  drawBar(ctx, midX, y + h * 0.55, midW, h * 0.14, item.organization, '#4a7c59')
  drawBar(ctx, midX, y + h * 0.74, midW, h * 0.14, item.equipment, '#6a5a8a')

  const trenchX = x + w - rightW / 2
  const trenchY = y + h / 2
  const trenchR = Math.min(rightW, h) * 0.28
  ctx.beginPath()
  ctx.arc(trenchX, trenchY, trenchR, 0, Math.PI * 2)
  if (item.dugIn) {
    ctx.fillStyle = '#e8dcc8'
    ctx.fill()
  } else {
    ctx.strokeStyle = '#e8dcc8'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  if (item.status) {
    ctx.fillStyle = '#8b0000'
    ctx.font = `bold ${Math.max(7, h * 0.3)}px ui-monospace, monospace`
    ctx.textAlign = 'right'
    ctx.fillText(item.status, x + w - rightW - 2, y + 2)
  }
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: string,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct / 100)), h)
}
