import type { GameSave, GeneratedMap, MapTile, TerrainType } from '../../types/index.ts'
import { getTileFoodYield } from '../economy.ts'
import { getFoodPolicyMultiplier } from '../policies.ts'
import {
  drawMapPreview,
  getMapLayout,
  type DrawMapPreviewOptions,
} from '../../map/generator.ts'
import type { ArmyDisplayState } from '../../map/army-display.ts'
import type { MapLayerId } from './types.ts'

const TERRAIN_COLORS: Record<TerrainType, string> = {
  plain: '#c8e6a0',
  mountain: '#8a7b6a',
  river: '#7eb8d8',
}

const TERRAIN_LABELS: Record<TerrainType, string> = {
  plain: '原野',
  mountain: '山地',
  river: '河畔',
}

export interface MapDrawContext {
  canvas: HTMLCanvasElement
  map: GeneratedMap
  save: GameSave
  owners: Record<string, string>
  highlightId?: string
  neighborIds?: string[]
  armyDisplay?: ArmyDisplayState
  militaryOptions?: DrawMapPreviewOptions
}

function drawTerrainLayer(ctx: CanvasRenderingContext2D, map: GeneratedMap, layout: ReturnType<typeof getMapLayout>, highlightId?: string, neighborIds?: string[]): void {
  const { cell, offsetX, offsetY } = layout

  for (const tile of map.tiles) {
    const px = offsetX + tile.gridX * cell
    const py = offsetY + tile.gridY * cell

    ctx.fillStyle = TERRAIN_COLORS[tile.type]
    ctx.fillRect(px, py, cell, cell)

    if (neighborIds?.includes(tile.id)) {
      ctx.strokeStyle = '#2d6a4f'
      ctx.lineWidth = 3
      ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4)
    }

    ctx.strokeStyle = tile.id === highlightId ? '#ffd700' : '#4a4030'
    ctx.lineWidth = tile.id === highlightId ? 3 : 1
    ctx.strokeRect(px, py, cell, cell)

    ctx.fillStyle = '#1a1208'
    ctx.font = `bold ${Math.max(9, cell * 0.2)}px "Noto Serif SC", serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(TERRAIN_LABELS[tile.type], px + cell / 2, py + cell / 2)
  }
}

function formatFoodLabel(tile: MapTile, save: GameSave): string {
  const state = save.tiles[tile.id]
  if (!state || state.owner === 'neutral') return '—'

  const daily = getTileFoodYield(tile, state) * getFoodPolicyMultiplier(save, state.owner)
  const suffix = state.hasTuntian ? '(屯田)' : ''
  return `粮 ${daily.toFixed(1)}/日${suffix}`
}

function drawResourceLayer(
  ctx: CanvasRenderingContext2D,
  map: GeneratedMap,
  save: GameSave,
  layout: ReturnType<typeof getMapLayout>,
  highlightId?: string,
  neighborIds?: string[],
): void {
  const { cell, offsetX, offsetY } = layout

  for (const tile of map.tiles) {
    const px = offsetX + tile.gridX * cell
    const py = offsetY + tile.gridY * cell
    const state = save.tiles[tile.id]
    const daily =
      state && state.owner !== 'neutral'
        ? getTileFoodYield(tile, state) * getFoodPolicyMultiplier(save, state.owner)
        : 0

    const intensity = Math.min(1, daily / 4)
    const g = Math.floor(180 + intensity * 60)
    ctx.fillStyle = `rgb(230, ${g}, 180)`
    ctx.fillRect(px, py, cell, cell)

    if (neighborIds?.includes(tile.id)) {
      ctx.strokeStyle = '#2d6a4f'
      ctx.lineWidth = 3
      ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4)
    }

    ctx.strokeStyle = tile.id === highlightId ? '#ffd700' : '#5c4f3a'
    ctx.lineWidth = tile.id === highlightId ? 3 : 1
    ctx.strokeRect(px, py, cell, cell)

    const label = formatFoodLabel(tile, save)
    ctx.fillStyle = '#1a1208'
    ctx.font = `bold ${Math.max(8, cell * 0.17)}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lines = label.split('/')
    if (lines.length === 2) {
      ctx.fillText(lines[0] + '/', px + cell / 2, py + cell / 2 - 4)
      ctx.fillText(lines[1]!, px + cell / 2, py + cell / 2 + 6)
    } else {
      ctx.fillText(label, px + cell / 2, py + cell / 2)
    }
  }
}

export function drawMapLayer(layer: MapLayerId, ctx: MapDrawContext): void {
  const c = ctx.canvas.getContext('2d')
  if (!c) return

  if (layer === 'military') {
    drawMapPreview(
      ctx.canvas,
      ctx.map,
      ctx.owners,
      ctx.highlightId,
      ctx.neighborIds,
      ctx.armyDisplay,
      ctx.militaryOptions,
    )
    return
  }

  const layout = getMapLayout(ctx.canvas, ctx.map)
  c.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  if (layer === 'terrain') {
    drawTerrainLayer(c, ctx.map, layout, ctx.highlightId, ctx.neighborIds)
  } else {
    drawResourceLayer(c, ctx.map, ctx.save, layout, ctx.highlightId, ctx.neighborIds)
  }
}
