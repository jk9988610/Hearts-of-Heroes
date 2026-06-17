import type { FactionId, GameSave, GeneratedMap, MapTile, TileState } from '../types/index.ts'
import { getFoodPolicyMultiplier } from './policies.ts'
import { HOURS_PER_DAY } from './time-scale.ts'

const BASE_YIELD: Record<MapTile['type'], number> = {
  plain: 2,
  mountain: 1,
  river: 1.5,
}

export const ARMY_FOOD_PER_DAY = 0.5
export const ARMY_FOOD_PER_HOUR = ARMY_FOOD_PER_DAY / HOURS_PER_DAY
export const RECRUIT_COST = 20
export const RECRUIT_TROOPS = 1000
export const TUNTIAN_COST = 10

export function getTileFoodYield(tile: MapTile, tileState: TileState): number {
  let yield_ = BASE_YIELD[tile.type]
  if (tileState.hasTuntian) yield_ *= 2
  if ((tileState.occupationDays ?? 99) < 3) yield_ *= 0.5
  return yield_
}

/** 每小时经济结算 */
export function processEconomyHour(save: GameSave, map: GeneratedMap, isNewDay: boolean): void {
  const hourlyYields: Partial<Record<FactionId, number>> = {
    wei: 0,
    shu: 0,
    wu: 0,
  }

  for (const tile of map.tiles) {
    const state = save.tiles[tile.id]
    if (!state || state.owner === 'neutral') continue

    const daily = getTileFoodYield(tile, state) * getFoodPolicyMultiplier(save, state.owner)
    hourlyYields[state.owner] = (hourlyYields[state.owner] ?? 0) + daily / HOURS_PER_DAY

    if (isNewDay && state.occupationDays !== undefined && state.occupationDays < 3) {
      state.occupationDays += 1
    }
  }

  for (const [faction, amount] of Object.entries(hourlyYields)) {
    if (save.factions[faction]) {
      save.factions[faction].food += amount ?? 0
    }
  }

  for (const faction of Object.values(save.factions)) {
    const armyCount = faction.armies.length
    if (armyCount > 0) {
      faction.food -= armyCount * ARMY_FOOD_PER_HOUR
    }
  }
}

export function canBuildTuntian(save: GameSave, tileId: string): boolean {
  const tile = save.tiles[tileId]
  return Boolean(tile && !tile.hasTuntian)
}

export function buildTuntian(save: GameSave, tileId: string, faction: FactionId): boolean {
  const f = save.factions[faction]
  if (!f || f.food < TUNTIAN_COST || !canBuildTuntian(save, tileId)) return false
  f.food -= TUNTIAN_COST
  save.tiles[tileId]!.hasTuntian = true
  return true
}

export function canRecruit(save: GameSave, faction: FactionId): boolean {
  return (save.factions[faction]?.food ?? 0) >= RECRUIT_COST
}

export function recruitOnTile(
  save: GameSave,
  tileId: string,
  faction: FactionId,
  armyId: string,
): boolean {
  const f = save.factions[faction]
  if (!f || !canRecruit(save, faction)) return false
  f.food -= RECRUIT_COST

  const existing = f.armies.find((a) => a.id === armyId)
  if (existing) {
    existing.troops += RECRUIT_TROOPS
  } else {
    f.armies.push({
      id: armyId,
      faction,
      troops: RECRUIT_TROOPS,
      tileId,
    })
    save.tiles[tileId]!.armyId = armyId
  }
  return true
}

export function markTileCaptured(save: GameSave, tileId: string, newOwner: FactionId): void {
  const tile = save.tiles[tileId]
  if (!tile) return
  if (tile.owner !== newOwner) {
    tile.owner = newOwner
    tile.occupationDays = 0
  }
}
