import type { FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { computeGridNeighbors } from '../map/generator.ts'
import { FACTION_CAPITAL, PLAYABLE_FACTIONS } from './factions.ts'
import {
  findArmyOnTile,
  MARCH_HOURS,
  orderMarch,
  totalFactionTroops,
} from './combat.ts'
import {
  buildTuntian,
  canBuildTuntian,
  canRecruit,
  recruitOnTile,
} from './economy.ts'

function ownedTiles(save: GameSave, faction: FactionId): string[] {
  return Object.entries(save.tiles)
    .filter(([, t]) => t.owner === faction)
    .map(([id]) => id)
}

function keyCityWithoutTuntian(save: GameSave, map: GeneratedMap, faction: FactionId): string | null {
  for (const tile of map.tiles) {
    if (!tile.isKeyCity) continue
    if (save.tiles[tile.id]?.owner !== faction) continue
    if (canBuildTuntian(save, tile.id)) return tile.id
  }
  return null
}

function weakestEnemyNeighbor(
  save: GameSave,
  map: GeneratedMap,
  faction: FactionId,
): { from: string; to: string; enemyTroops: number } | null {
  let best: { from: string; to: string; enemyTroops: number } | null = null

  for (const tileId of ownedTiles(save, faction)) {
    const army = findArmyOnTile(save, tileId)
    if (!army || army.inCombat || army.marchHoursLeft || army.marchDaysLeft) continue

    const mapTile = map.tileById[tileId]
    if (!mapTile) continue

    for (const neighbor of computeGridNeighbors(map, mapTile)) {
      const nState = save.tiles[neighbor.id]
      if (!nState || nState.owner === faction || nState.owner === 'neutral') continue

      const enemy = findArmyOnTile(save, neighbor.id)
      const enemyTroops = enemy?.troops ?? 0
      if (enemyTroops < army.troops) {
        if (!best || enemyTroops < best.enemyTroops) {
          best = { from: tileId, to: neighbor.id, enemyTroops }
        }
      }
    }
  }

  return best
}

export type AiMode = 'full' | 'lite'

export interface AiAction {
  faction: FactionId
  type: 'tuntian' | 'attack' | 'recruit' | 'idle'
  detail: string
  mode: AiMode
}

function runAiFaction(
  save: GameSave,
  map: GeneratedMap,
  faction: FactionId,
  mode: AiMode,
): AiAction {
  const f = save.factions[faction]
  if (!f) return { faction, type: 'idle', detail: '势力不存在', mode }

  const totalTroops = totalFactionTroops(save, faction)

  if (f.food < 50) {
    const cityId = keyCityWithoutTuntian(save, map, faction)
    if (cityId && f.food >= 10 && buildTuntian(save, cityId, faction)) {
      return { faction, type: 'tuntian', detail: `${cityId} 建造屯田`, mode }
    }
  }

  if (totalTroops < 2000 && canRecruit(save, faction)) {
    const capital = FACTION_CAPITAL[faction]
    const armyId = `army_${faction}_${capital}`
    if (recruitOnTile(save, capital, faction, armyId)) {
      return { faction, type: 'recruit', detail: `${capital} 募兵 +1000`, mode }
    }
  }

  // 视窗外精简：不发起进攻，仅经济/募兵
  if (mode === 'lite') {
    return { faction, type: 'idle', detail: '视窗外待机', mode }
  }

  if (f.food > 80 && totalTroops >= 2000) {
    const target = weakestEnemyNeighbor(save, map, faction)
    if (target) {
      const army = findArmyOnTile(save, target.from)
      if (army && orderMarch(save, army, target.to, MARCH_HOURS)) {
        return {
          faction,
          type: 'attack',
          detail: `${target.from} → ${target.to}（敌${target.enemyTroops}）`,
          mode,
        }
      }
    }
  }

  return { faction, type: 'idle', detail: '无行动', mode }
}

/** 所有非玩家势力 AI（玩家势力完全由玩家操控） */
export function runAiTurn(
  save: GameSave,
  map: GeneratedMap,
  playerFaction: FactionId,
  hour: number,
  isFactionInView: (faction: FactionId) => boolean,
  liteIntervalHours: number,
): AiAction[] {
  const actions: AiAction[] = []

  for (const faction of PLAYABLE_FACTIONS) {
    if (faction === playerFaction) continue

    const inView = isFactionInView(faction)
    const mode: AiMode = inView ? 'full' : 'lite'

    if (!inView && hour % liteIntervalHours !== 0) continue

    const action = runAiFaction(save, map, faction, mode)
    if (action.type !== 'idle') actions.push(action)
  }

  return actions
}
