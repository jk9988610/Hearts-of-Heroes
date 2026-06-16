import type { FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { computeGridNeighbors } from '../map/generator.ts'
import {
  findArmyOnTile,
  MARCH_DAYS,
  orderMarch,
  totalFactionTroops,
} from './combat.ts'
import {
  buildTuntian,
  canBuildTuntian,
  canRecruit,
  recruitOnTile,
} from './economy.ts'
import { getMarchDays } from './policies.ts'

const FACTION_ORDER: FactionId[] = ['wei', 'shu', 'wu']

const CAPITAL: Record<FactionId, string> = {
  wei: 'xuchang',
  shu: 'chengdu',
  wu: 'jianye',
  neutral: '',
}

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
    if (!army || army.inCombat || army.marchDaysLeft) continue

    const mapTile = map.tileById[tileId]
    if (!mapTile) continue

    for (const neighbor of computeGridNeighbors(map, mapTile)) {
      const nState = save.tiles[neighbor.id]
      if (!nState || nState.owner === faction || nState.owner === 'neutral') continue

      const enemy = findArmyOnTile(save, neighbor.id)
      const enemyTroops = enemy?.troops ?? 0
      const myTroops = army.troops

      if (enemyTroops < myTroops) {
        if (!best || enemyTroops < best.enemyTroops) {
          best = { from: tileId, to: neighbor.id, enemyTroops }
        }
      }
    }
  }

  return best
}

export interface AiAction {
  faction: FactionId
  type: 'tuntian' | 'attack' | 'recruit' | 'idle'
  detail: string
}

export function runAiTurn(
  save: GameSave,
  map: GeneratedMap,
  day: number,
): AiAction {
  const faction = FACTION_ORDER[day % FACTION_ORDER.length]!
  const f = save.factions[faction]
  if (!f) return { faction, type: 'idle', detail: '势力不存在' }

  const totalTroops = totalFactionTroops(save, faction)

  if (f.food < 50) {
    const cityId = keyCityWithoutTuntian(save, map, faction)
    if (cityId && f.food >= 10 && buildTuntian(save, cityId, faction)) {
      return { faction, type: 'tuntian', detail: `${cityId} 建造屯田` }
    }
  }

  if (totalTroops < 2000 && canRecruit(save, faction)) {
    const capital = CAPITAL[faction]
    const armyId = `army_${faction}_${capital}`
    if (recruitOnTile(save, capital, faction, armyId)) {
      return { faction, type: 'recruit', detail: `${capital} 募兵 +1000` }
    }
  }

  if (f.food > 80 && totalTroops >= 2000) {
    const target = weakestEnemyNeighbor(save, map, faction)
    if (target) {
      const army = findArmyOnTile(save, target.from)
      if (army && orderMarch(army, target.to, getMarchDays(save, faction, MARCH_DAYS))) {
        return {
          faction,
          type: 'attack',
          detail: `${target.from} → ${target.to}（敌${target.enemyTroops}）`,
        }
      }
    }
  }

  return { faction, type: 'idle', detail: '无行动' }
}

export function getAiFactionForDay(day: number): FactionId {
  return FACTION_ORDER[day % FACTION_ORDER.length]!
}
