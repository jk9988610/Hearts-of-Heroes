import type { FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { getMapLayout } from '../map/generator.ts'

export interface ViewportRect {
  scrollLeft: number
  scrollTop: number
  clientWidth: number
  clientHeight: number
}

export function getVisibleTileIds(
  map: GeneratedMap,
  canvas: HTMLCanvasElement,
  viewport: ViewportRect,
): Set<string> {
  const visible = new Set<string>()
  const layout = getMapLayout(canvas, map)
  const { cell, offsetX, offsetY } = layout
  const rect = canvas.getBoundingClientRect()
  const scaleX = rect.width / canvas.width
  const scaleY = rect.height / canvas.height
  const cellW = cell * scaleX
  const cellH = cell * scaleY

  const left = viewport.scrollLeft
  const top = viewport.scrollTop
  const right = left + viewport.clientWidth
  const bottom = top + viewport.clientHeight

  for (const tile of map.tiles) {
    const px = (offsetX + tile.gridX * cell) * scaleX
    const py = (offsetY + tile.gridY * cell) * scaleY
    const margin = cellW

    if (
      px + cellW + margin >= left &&
      px - margin <= right &&
      py + cellH + margin >= top &&
      py - margin <= bottom
    ) {
      visible.add(tile.id)
    }
  }

  return visible
}

export function isFactionInView(
  save: GameSave,
  faction: FactionId,
  visible: Set<string>,
): boolean {
  for (const [tileId, state] of Object.entries(save.tiles)) {
    if (state.owner === faction && visible.has(tileId)) return true
  }

  for (const battalion of save.factions[faction]?.battalions ?? []) {
    if (visible.has(battalion.tileId)) return true
    if (battalion.targetTileId && visible.has(battalion.targetTileId)) return true
  }

  return false
}

export function isBattalionEventVisible(
  battalion: { tileId: string; targetTileId?: string; faction: FactionId },
  visible: Set<string>,
  playerFaction: FactionId,
): boolean {
  if (battalion.faction === playerFaction) return true
  if (visible.has(battalion.tileId)) return true
  if (battalion.targetTileId && visible.has(battalion.targetTileId)) return true
  return false
}

/** @deprecated */
export const isArmyEventVisible = isBattalionEventVisible
