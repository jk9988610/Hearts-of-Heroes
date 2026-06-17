import type { Battalion, GameSave, TerrainType } from '../types/index.ts'
import {
  countBattalionTroops,
  distributeCenturyLosses,
  isBattalionUnderstrength,
  mergeBattalionCenturies,
} from './organization/helpers.ts'
import { findBattalionOnTile } from './organization/queries.ts'
import { getCorpsCombatMultiplier } from './organization/hero-assign.ts'
import { markTileCaptured } from './economy.ts'
import { getDefensePolicyMultiplier, getMarchHours } from './policies.ts'
import { COMBAT_HOURS, MARCH_HOURS } from './time-scale.ts'

const UNIT_ATK = 1.0
const UNIT_DEF = 1.2

const TERRAIN_MOD: Record<TerrainType, { atk: number; def: number }> = {
  plain: { atk: 1.1, def: 0.9 },
  mountain: { atk: 0.8, def: 1.2 },
  river: { atk: 0.9, def: 1.0 },
}

export { MARCH_HOURS, COMBAT_HOURS }

export function calcCombatPower(
  troops: number,
  isAttacker: boolean,
  terrain: TerrainType,
): number {
  const mod = TERRAIN_MOD[terrain]
  const coef = isAttacker ? UNIT_ATK * mod.atk : UNIT_DEF * mod.def
  return troops * coef
}

export interface BattleResult {
  attackerTroops: number
  defenderTroops: number
  attackerWins: boolean
}

export function resolveBattle(
  attackerTroops: number,
  defenderTroops: number,
  terrain: TerrainType,
  defenderPolicyMult = 1,
  attackerHeroMult = 1,
  defenderHeroMult = 1,
): BattleResult {
  const atkPower = calcCombatPower(attackerTroops, true, terrain) * attackerHeroMult
  const defPower =
    calcCombatPower(defenderTroops, false, terrain) * defenderPolicyMult * defenderHeroMult
  const total = Math.max(atkPower + defPower, 1)

  let atkLossRate = 0.1 + 0.3 * (defPower / total)
  let defLossRate = 0.1 + 0.3 * (atkPower / total)

  if (atkPower < defPower) atkLossRate *= 1.2
  else defLossRate *= 1.2

  const newAtk = Math.max(0, Math.floor(attackerTroops * (1 - atkLossRate)))
  const newDef = Math.max(0, Math.floor(defenderTroops * (1 - defLossRate)))

  return {
    attackerTroops: newAtk,
    defenderTroops: newDef,
    attackerWins: newAtk > 0 && newDef <= 0,
  }
}

export function startCombat(attacker: Battalion, defender: Battalion): void {
  attacker.inCombat = true
  defender.inCombat = true
  attacker.combatHoursLeft = COMBAT_HOURS
  defender.combatHoursLeft = COMBAT_HOURS
  attacker.targetTileId = defender.tileId
}

export function clearBattalionMarch(battalion: Battalion): void {
  battalion.targetTileId = undefined
  battalion.marchHoursLeft = undefined
  battalion.marchDaysLeft = undefined
}

export function clearBattalionCombat(battalion: Battalion): void {
  battalion.inCombat = false
  battalion.combatHoursLeft = undefined
  battalion.combatDaysLeft = undefined
  battalion.targetTileId = undefined
}

export function removeBattalion(save: GameSave, battalion: Battalion): void {
  const faction = save.factions[battalion.faction]
  if (!faction) return
  faction.battalions = faction.battalions.filter((b) => b.id !== battalion.id)

  if (battalion.corpsId) {
    const corps = faction.corps.find((c) => c.id === battalion.corpsId)
    if (corps) {
      corps.battalionIds = corps.battalionIds.filter((id) => id !== battalion.id)
    }
  }

  const tile = save.tiles[battalion.tileId]
  if (tile?.battalionId === battalion.id) {
    tile.battalionId = undefined
  }
}

export function syncBattalionTile(save: GameSave, battalion: Battalion, tileId: string): void {
  if (save.tiles[battalion.tileId]?.battalionId === battalion.id) {
    save.tiles[battalion.tileId]!.battalionId = undefined
  }
  battalion.tileId = tileId
  save.tiles[tileId]!.battalionId = battalion.id
}

export { findBattalionOnTile, findMarchingBattalionToTile, totalFactionTroops } from './organization/queries.ts'

export function getMarchHoursLeft(battalion: Battalion): number | undefined {
  if (battalion.marchHoursLeft !== undefined) return battalion.marchHoursLeft
  if (battalion.marchDaysLeft !== undefined) return battalion.marchDaysLeft * 24
  return undefined
}

export function getCombatHoursLeft(battalion: Battalion): number | undefined {
  if (battalion.combatHoursLeft !== undefined) return battalion.combatHoursLeft
  if (battalion.combatDaysLeft !== undefined) return battalion.combatDaysLeft * 24
  return undefined
}

export function orderMarch(
  save: GameSave,
  battalion: Battalion,
  targetTileId: string,
  baseHours = MARCH_HOURS,
): boolean {
  if (battalion.inCombat || getMarchHoursLeft(battalion)) return false
  let hours = getMarchHours(save, battalion.faction, baseHours)
  if (isBattalionUnderstrength(battalion)) {
    hours = Math.ceil(hours * 1.2)
  }
  battalion.dugIn = false
  battalion.targetTileId = targetTileId
  battalion.marchHoursLeft = hours
  battalion.marchDaysLeft = undefined
  return true
}

export function finishMarch(
  save: GameSave,
  battalion: Battalion,
  targetTileId: string,
  _terrain: TerrainType,
): { type: 'moved' | 'combat' | 'merge'; defender?: Battalion } {
  const defender = findBattalionOnTile(save, targetTileId)
  clearBattalionMarch(battalion)

  if (defender && defender.faction !== battalion.faction) {
    syncBattalionTile(save, battalion, targetTileId)
    startCombat(battalion, defender)
    return { type: 'combat', defender }
  }

  syncBattalionTile(save, battalion, targetTileId)
  if (defender && defender.faction === battalion.faction) {
    mergeBattalionCenturies(battalion, defender)
    removeBattalion(save, defender)
    return { type: 'merge' }
  }

  return { type: 'moved' }
}

export function applyBattleOutcome(
  save: GameSave,
  attacker: Battalion,
  defender: Battalion,
  terrain: TerrainType,
): BattleResult {
  const atkBefore = countBattalionTroops(attacker)
  const defBefore = countBattalionTroops(defender)

  const atkHero = getCorpsCombatMultiplier(save, attacker.corpsId)
  const defHero = getCorpsCombatMultiplier(save, defender.corpsId)

  const result = resolveBattle(
    atkBefore,
    defBefore,
    terrain,
    getDefensePolicyMultiplier(save, defender.faction),
    atkHero.attack,
    defHero.defense,
  )

  distributeCenturyLosses(attacker, atkBefore - result.attackerTroops)
  distributeCenturyLosses(defender, defBefore - result.defenderTroops)

  clearBattalionCombat(attacker)
  clearBattalionCombat(defender)

  if (result.attackerWins) {
    removeBattalion(save, defender)
    markTileCaptured(save, attacker.tileId, attacker.faction)
  } else if (countBattalionTroops(defender) <= 0) {
    removeBattalion(save, defender)
    markTileCaptured(save, attacker.tileId, attacker.faction)
  } else if (countBattalionTroops(attacker) <= 0) {
    removeBattalion(save, attacker)
  }

  return result
}

/** @deprecated 兼容旧引用 */
export const findArmyOnTile = findBattalionOnTile
