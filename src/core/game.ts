import type { Army, FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { runAiTurn, type AiAction } from './ai.ts'
import {
  applyBattleOutcome,
  COMBAT_DAYS,
  findArmyOnTile,
  finishMarch,
} from './combat.ts'
import { processEconomy } from './economy.ts'

export interface TickEvents {
  ai?: AiAction
  marches: string[]
  battles: string[]
}

export function gameTick(save: GameSave, map: GeneratedMap): TickEvents {
  const events: TickEvents = { marches: [], battles: [] }

  processEconomy(save, map)
  processMarching(save, map, events)
  processCombat(save, map, events)

  const ai = runAiTurn(save, map, save.date)
  events.ai = ai

  return events
}

function processMarching(save: GameSave, map: GeneratedMap, events: TickEvents): void {
  const marching: Army[] = []
  for (const faction of Object.values(save.factions)) {
    for (const army of faction.armies) {
      if (army.marchDaysLeft !== undefined && army.marchDaysLeft > 0) {
        marching.push(army)
      }
    }
  }

  for (const army of marching) {
    if (army.inCombat) continue
    army.marchDaysLeft = (army.marchDaysLeft ?? 1) - 1

    if (army.marchDaysLeft <= 0 && army.targetTileId) {
      const target = army.targetTileId
      const terrain = map.tileById[target]?.type ?? 'plain'
      const result = finishMarch(save, army, target, terrain)

      if (result.type === 'combat') {
        events.marches.push(`${army.faction} 抵达 ${target}，进入战斗`)
      } else if (result.type === 'merge') {
        events.marches.push(`${army.faction} 抵达 ${target}，合兵`)
      } else {
        events.marches.push(`${army.faction} 抵达 ${target}`)
      }
    }
  }
}

function processCombat(save: GameSave, map: GeneratedMap, events: TickEvents): void {
  const byTile = new Map<string, Army[]>()

  for (const faction of Object.values(save.factions)) {
    for (const army of faction.armies) {
      if (!army.inCombat) continue
      const list = byTile.get(army.tileId) ?? []
      list.push(army)
      byTile.set(army.tileId, list)
    }
  }

  for (const [tileId, armies] of byTile) {
    if (armies.length < 2) {
      for (const army of armies) {
        army.inCombat = false
        army.combatDaysLeft = undefined
      }
      continue
    }

    const attacker =
      armies.find((a) => a.targetTileId === tileId) ??
      armies.find((a) => armies.some((d) => d.faction !== a.faction)) ??
      armies[0]!
    const defender = armies.find((a) => a.faction !== attacker.faction && a.id !== attacker.id)
    if (!defender) continue

    const daysLeft = (attacker.combatDaysLeft ?? COMBAT_DAYS) - 1
    attacker.combatDaysLeft = daysLeft
    defender.combatDaysLeft = daysLeft

    if (daysLeft > 0) continue

    const terrain = map.tileById[tileId]?.type ?? 'plain'
    const result = applyBattleOutcome(save, attacker, defender, terrain)
    const tileName = map.tileById[tileId]?.name ?? tileId

    if (result.attackerWins || defender.troops <= 0) {
      events.battles.push(
        `${attacker.faction} 攻克 ${tileName}（剩${result.attackerTroops}兵）`,
      )
    } else if (attacker.troops <= 0) {
      events.battles.push(`${defender.faction} 守住 ${tileName}`)
    } else {
      events.battles.push(
        `${tileName} 战平：攻${result.attackerTroops} / 守${result.defenderTroops}`,
      )
    }
  }
}

export function getArmyOnTile(save: GameSave, tileId: string): Army | null {
  return findArmyOnTile(save, tileId)
}

export function playerCanAct(save: GameSave, tileId: string, player: FactionId): boolean {
  return save.tiles[tileId]?.owner === player
}

export function ensureStarterArmies(
  save: GameSave,
  capitals: Record<string, { faction: FactionId; tileId: string }>,
): void {
  for (const { faction, tileId } of Object.values(capitals)) {
    const f = save.factions[faction]
    if (!f) continue
    const armyId = `army_${faction}_${tileId}`
    const exists = f.armies.some((a) => a.id === armyId)
    if (exists) continue

    f.armies.push({
      id: armyId,
      faction,
      troops: 1500,
      tileId,
    })
    save.tiles[tileId]!.armyId = armyId
  }
}
