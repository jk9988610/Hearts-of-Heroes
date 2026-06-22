import type { FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { computeGridNeighbors } from '../map/generator.ts'
import { isAtWar } from './diplomacy.ts'
import { FACTION_CAPITAL, PLAYABLE_FACTIONS } from './factions.ts'
import {
  findBattalionOnTile,
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
import { countBattalionTroops, countCorpsTroops } from './organization/helpers.ts'
import { getCorpsBattalions } from './organization/queries.ts'
import type { Corps } from '../types/index.ts'


function keyCityWithoutTuntian(save: GameSave, map: GeneratedMap, faction: FactionId): string | null {
  for (const tile of map.tiles) {
    if (!tile.isKeyCity) continue
    if (save.tiles[tile.id]?.owner !== faction) continue
    if (canBuildTuntian(save, tile.id)) return tile.id
  }
  return null
}

function corpsAttackTarget(
  save: GameSave,
  map: GeneratedMap,
  corps: Corps,
): { from: string; to: string; enemyTroops: number } | null {
  const battalions = getCorpsBattalions(save, corps)
  let best: { from: string; to: string; enemyTroops: number } | null = null
  const corpsTroops = countCorpsTroops(save, corps)

  for (const battalion of battalions) {
    if (battalion.inCombat || battalion.marchHoursLeft) continue
    const mapTile = map.tileById[battalion.tileId]
    if (!mapTile) continue

    for (const neighbor of computeGridNeighbors(map, mapTile)) {
      const nState = save.tiles[neighbor.id]
      if (!nState || nState.owner === corps.faction || nState.owner === 'neutral') continue
      if (!isAtWar(save, corps.faction, nState.owner)) continue

      const enemy = findBattalionOnTile(save, neighbor.id)
      const enemyTroops = enemy ? countBattalionTroops(enemy) : 0
      if (enemyTroops < corpsTroops) {
        if (!best || enemyTroops < best.enemyTroops) {
          best = { from: battalion.tileId, to: neighbor.id, enemyTroops }
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
    if (recruitOnTile(save, capital, faction)) {
      return { faction, type: 'recruit', detail: `${capital} 募兵 +100`, mode }
    }
  }

  if (mode === 'lite') {
    return { faction, type: 'idle', detail: '视窗外待机', mode }
  }

  if (f.food > 80 && totalTroops >= 2000) {
    const activeCorps = f.corps
      .filter((c) => !c.standby && countCorpsTroops(save, c) >= 500)
      .sort((a, b) => countCorpsTroops(save, b) - countCorpsTroops(save, a))

    for (const corps of activeCorps) {
      const target = corpsAttackTarget(save, map, corps)
      if (!target) continue

      const battalion = findBattalionOnTile(save, target.from)
      if (battalion && battalion.corpsId === corps.id && orderMarch(save, battalion, target.to, MARCH_HOURS)) {
        const label = corps.heroId ? `将军队` : corps.id
        return {
          faction,
          type: 'attack',
          detail: `${label} ${target.from} → ${target.to}（敌${target.enemyTroops}）`,
          mode,
        }
      }
    }
  }

  return { faction, type: 'idle', detail: '无行动', mode }
}

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
