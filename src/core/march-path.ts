import type { Battalion, GameSave, GeneratedMap } from '../types/index.ts'
import { canMarchToTile } from './diplomacy.ts'
import { findTilePath } from '../map/pathfinding.ts'
import { getMarchHoursLeft, orderMarch, MARCH_HOURS } from './combat.ts'

export function clearBattalionMarchRoute(battalion: Battalion): void {
  battalion.marchPath = undefined
  battalion.marchRoute = undefined
}

export function tryContinueMarchRoute(save: GameSave, battalion: Battalion): boolean {
  if (battalion.inCombat) {
    clearBattalionMarchRoute(battalion)
    return false
  }
  if (!battalion.marchPath?.length) {
    clearBattalionMarchRoute(battalion)
    return false
  }

  const next = battalion.marchPath[0]!
  battalion.marchPath = battalion.marchPath.slice(1)
  return orderMarch(save, battalion, next, MARCH_HOURS)
}

export function orderMarchToTile(
  save: GameSave,
  map: GeneratedMap,
  battalion: Battalion,
  targetTileId: string,
): { ok: boolean; message: string } {
  if (battalion.inCombat) {
    return { ok: false, message: '军队战斗中' }
  }
  if (getMarchHoursLeft(battalion)) {
    return { ok: false, message: '军队已在行军中' }
  }
  if (battalion.tileId === targetTileId) {
    return { ok: false, message: '已在目标格' }
  }

  const path = findTilePath(map, battalion.tileId, targetTileId)
  if (!path || path.length < 2) {
    return { ok: false, message: '无法到达该格' }
  }

  for (let i = 1; i < path.length; i++) {
    if (!canMarchToTile(save, battalion.faction, path[i]!)) {
      return { ok: false, message: '和平时不可进入敌国领土，请先宣战' }
    }
  }

  battalion.marchRoute = path
  battalion.marchPath = path.slice(2)
  const nextTileId = path[1]!

  if (!orderMarch(save, battalion, nextTileId, MARCH_HOURS)) {
    clearBattalionMarchRoute(battalion)
    return { ok: false, message: '无法出发' }
  }

  return { ok: true, message: 'ok' }
}
