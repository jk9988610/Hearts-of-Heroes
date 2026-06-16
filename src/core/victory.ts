import type { FactionId, GameSave, GeneratedMap } from '../types/index.ts'

const PLAYER_CAPITAL: Record<FactionId, string> = {
  wei: 'xuchang',
  shu: 'chengdu',
  wu: 'jianye',
  neutral: '',
}

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
  const capital = PLAYER_CAPITAL[player]
  if (capital && save.tiles[capital]?.owner !== player) {
    return { outcome: 'lose', reason: `都城 ${capital} 失守` }
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
