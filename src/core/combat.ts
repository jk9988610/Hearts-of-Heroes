import type { Army, FactionId, GameSave, TerrainType } from '../types/index.ts'
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
): BattleResult {
  const atkPower = calcCombatPower(attackerTroops, true, terrain)
  const defPower = calcCombatPower(defenderTroops, false, terrain) * defenderPolicyMult
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

export function startCombat(attacker: Army, defender: Army): void {
  attacker.inCombat = true
  defender.inCombat = true
  attacker.combatHoursLeft = COMBAT_HOURS
  defender.combatHoursLeft = COMBAT_HOURS
  attacker.targetTileId = defender.tileId
}

export function clearArmyMarch(army: Army): void {
  army.targetTileId = undefined
  army.marchHoursLeft = undefined
  army.marchDaysLeft = undefined
}

export function clearArmyCombat(army: Army): void {
  army.inCombat = false
  army.combatHoursLeft = undefined
  army.combatDaysLeft = undefined
  army.targetTileId = undefined
}

export function removeArmy(save: GameSave, army: Army): void {
  const faction = save.factions[army.faction]
  if (!faction) return
  faction.armies = faction.armies.filter((a) => a.id !== army.id)
  const tile = save.tiles[army.tileId]
  if (tile?.armyId === army.id) {
    tile.armyId = undefined
  }
}

export function syncArmyTile(save: GameSave, army: Army, tileId: string): void {
  if (save.tiles[army.tileId]?.armyId === army.id) {
    save.tiles[army.tileId]!.armyId = undefined
  }
  army.tileId = tileId
  save.tiles[tileId]!.armyId = army.id
}

export function findArmyOnTile(save: GameSave, tileId: string): Army | null {
  for (const faction of Object.values(save.factions)) {
    const army = faction.armies.find(
      (a) => a.tileId === tileId && !a.marchHoursLeft && !a.marchDaysLeft,
    )
    if (army) return army
  }
  return null
}

export function findMarchingArmyToTile(save: GameSave, tileId: string): Army | null {
  for (const faction of Object.values(save.factions)) {
    const army = faction.armies.find(
      (a) =>
        a.targetTileId === tileId &&
        (a.marchHoursLeft !== undefined || a.marchDaysLeft !== undefined),
    )
    if (army) return army
  }
  return null
}

export function getMarchHoursLeft(army: Army): number | undefined {
  if (army.marchHoursLeft !== undefined) return army.marchHoursLeft
  if (army.marchDaysLeft !== undefined) return army.marchDaysLeft * 24
  return undefined
}

export function getCombatHoursLeft(army: Army): number | undefined {
  if (army.combatHoursLeft !== undefined) return army.combatHoursLeft
  if (army.combatDaysLeft !== undefined) return army.combatDaysLeft * 24
  return undefined
}

export function totalFactionTroops(save: GameSave, faction: FactionId): number {
  return (save.factions[faction]?.armies ?? []).reduce((s, a) => s + a.troops, 0)
}

export function orderMarch(
  save: GameSave,
  army: Army,
  targetTileId: string,
  baseHours = MARCH_HOURS,
): boolean {
  if (army.inCombat || getMarchHoursLeft(army)) return false
  const hours = getMarchHours(save, army.faction, baseHours)
  army.targetTileId = targetTileId
  army.marchHoursLeft = hours
  army.marchDaysLeft = undefined
  return true
}

export function finishMarch(
  save: GameSave,
  army: Army,
  targetTileId: string,
  _terrain: TerrainType,
): { type: 'moved' | 'combat' | 'merge'; defender?: Army } {
  const defender = findArmyOnTile(save, targetTileId)
  clearArmyMarch(army)

  if (defender && defender.faction !== army.faction) {
    syncArmyTile(save, army, targetTileId)
    startCombat(army, defender)
    return { type: 'combat', defender }
  }

  syncArmyTile(save, army, targetTileId)
  if (defender && defender.faction === army.faction) {
    army.troops += defender.troops
    removeArmy(save, defender)
    return { type: 'merge' }
  }

  return { type: 'moved' }
}

export function applyBattleOutcome(
  save: GameSave,
  attacker: Army,
  defender: Army,
  terrain: TerrainType,
): BattleResult {
  const result = resolveBattle(
    attacker.troops,
    defender.troops,
    terrain,
    getDefensePolicyMultiplier(save, defender.faction),
  )
  attacker.troops = result.attackerTroops
  defender.troops = result.defenderTroops

  clearArmyCombat(attacker)
  clearArmyCombat(defender)

  if (result.attackerWins) {
    removeArmy(save, defender)
    markTileCaptured(save, attacker.tileId, attacker.faction)
  } else if (defender.troops <= 0) {
    removeArmy(save, defender)
    markTileCaptured(save, attacker.tileId, attacker.faction)
  } else if (attacker.troops <= 0) {
    removeArmy(save, attacker)
  }

  return result
}
