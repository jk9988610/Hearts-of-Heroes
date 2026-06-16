import type { FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { FACTION_CAPITAL } from './factions.ts'

const WIN_KEY_CITIES = 6
const STARVE_LOSE_DAYS = 5

export type GameOutcome = 'playing' | 'win' | 'lose'

export interface VictoryState {
  outcome: GameOutcome
  reason?: string
}

export function countKeyCitiesOwned(
  save: GameSave,
  map: GeneratedMap,
  faction: FactionId,
): number {
  let count = 0
  for (const tile of map.tiles) {
    if (!tile.isKeyCity) continue
    if (save.tiles[tile.id]?.owner === faction) count++
  }
  return count
}

export function checkVictory(
  save: GameSave,
  map: GeneratedMap,
  player: FactionId,
): VictoryState {
  const capital = FACTION_CAPITAL[player]
  if (capital && save.tiles[capital]?.owner !== player) {
    return { outcome: 'lose', reason: `都城失守` }
  }

  const f = save.factions[player]
  if (f) {
    if (f.food <= 0) {
      f.starvingDays = (f.starvingDays ?? 0) + 1
    } else {
      f.starvingDays = 0
    }
    if ((f.starvingDays ?? 0) >= STARVE_LOSE_DAYS) {
      return { outcome: 'lose', reason: `粮草耗尽 ${STARVE_LOSE_DAYS} 天` }
    }
  }

  const keys = countKeyCitiesOwned(save, map, player)
  if (keys >= WIN_KEY_CITIES) {
    return { outcome: 'win', reason: `占领 ${keys} 座关键城池` }
  }

  return { outcome: 'playing' }
}

export interface PlayerStatusHints {
  foodWarning?: string
  battleFlash?: string
}

export function getPlayerStatusHints(
  save: GameSave,
  player: FactionId,
  recentBattles: string[],
): PlayerStatusHints {
  const hints: PlayerStatusHints = {}
  const f = save.factions[player]
  if (!f) return hints

  if (f.food <= 0) {
    hints.foodWarning = `粮尽！已连续断粮 ${f.starvingDays ?? 0}/${STARVE_LOSE_DAYS} 天`
  } else if (f.food < 20) {
    hints.foodWarning = `粮草告急：仅剩 ${f.food.toFixed(0)}（募兵需20）`
  } else if (f.food < 50) {
    hints.foodWarning = `粮草偏低：${f.food.toFixed(0)}`
  }

  const playerBattle = recentBattles.find(
    (b) => b.includes(player) || b.includes('魏') || b.includes('蜀') || b.includes('吴'),
  )
  if (playerBattle) {
    hints.battleFlash = playerBattle
  } else if (recentBattles.length > 0) {
    hints.battleFlash = recentBattles[recentBattles.length - 1]
  }

  return hints
}
