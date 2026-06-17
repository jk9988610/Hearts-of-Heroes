import type { Army, FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { runAiTurn, type AiAction } from './ai.ts'
import {
  applyBattleOutcome,
  COMBAT_HOURS,
  findArmyOnTile,
  finishMarch,
  getCombatHoursLeft,
  getMarchHoursLeft,
} from './combat.ts'
import { processEconomyHour } from './economy.ts'
import { isArmyEventVisible, isFactionInView } from './visibility.ts'
import type { GameClock } from './time-scale.ts'
import { AI_LITE_INTERVAL_HOURS } from './time-scale.ts'

export interface TickContext {
  playerFaction: FactionId
  visibleTileIds: Set<string>
  clock: GameClock
}

export interface TickEvents {
  ai: AiAction[]
  marches: string[]
  battles: string[]
}

export function gameHourTick(
  save: GameSave,
  map: GeneratedMap,
  ctx: TickContext,
): TickEvents {
  const events: TickEvents = { ai: [], marches: [], battles: [] }
  const isNewDay = ctx.clock.hour === 0

  save.date = ctx.clock.day
  save.hour = ctx.clock.hour

  processEconomyHour(save, map, isNewDay)
  processMarching(save, map, ctx, events)
  processCombat(save, map, ctx, events)

  const aiActions = runAiTurn(
    save,
    map,
    ctx.playerFaction,
    ctx.clock.hour,
    (faction) => isFactionInView(save, faction, ctx.visibleTileIds),
    AI_LITE_INTERVAL_HOURS,
  )
  events.ai = aiActions

  return events
}

function processMarching(
  save: GameSave,
  map: GeneratedMap,
  ctx: TickContext,
  events: TickEvents,
): void {
  const marching: Army[] = []
  for (const faction of Object.values(save.factions)) {
    for (const army of faction.armies) {
      const left = getMarchHoursLeft(army)
      if (left !== undefined && left > 0) marching.push(army)
    }
  }

  for (const army of marching) {
    if (army.inCombat) continue
    const left = (getMarchHoursLeft(army) ?? 1) - 1
    army.marchHoursLeft = left
    army.marchDaysLeft = undefined

    if (left <= 0 && army.targetTileId) {
      const target = army.targetTileId
      const terrain = map.tileById[target]?.type ?? 'plain'
      const result = finishMarch(save, army, target, terrain)
      const tileName = map.tileById[target]?.name ?? target
      const emit = isArmyEventVisible(army, ctx.visibleTileIds, ctx.playerFaction)

      if (!emit) continue

      if (result.type === 'combat') {
        events.marches.push(`${army.faction} 抵达 ${tileName}，进入战斗`)
      } else if (result.type === 'merge') {
        events.marches.push(`${army.faction} 抵达 ${tileName}，合兵`)
      } else {
        events.marches.push(`${army.faction} 抵达 ${tileName}`)
      }
    }
  }
}

function processCombat(
  save: GameSave,
  map: GeneratedMap,
  ctx: TickContext,
  events: TickEvents,
): void {
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
        army.combatHoursLeft = undefined
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

    const hoursLeft = (getCombatHoursLeft(attacker) ?? COMBAT_HOURS) - 1
    attacker.combatHoursLeft = hoursLeft
    defender.combatHoursLeft = hoursLeft
    attacker.combatDaysLeft = undefined
    defender.combatDaysLeft = undefined

    if (hoursLeft > 0) continue

    const terrain = map.tileById[tileId]?.type ?? 'plain'
    const result = applyBattleOutcome(save, attacker, defender, terrain)
    const tileName = map.tileById[tileId]?.name ?? tileId

    const emit =
      isArmyEventVisible(attacker, ctx.visibleTileIds, ctx.playerFaction) ||
      isArmyEventVisible(defender, ctx.visibleTileIds, ctx.playerFaction)
    if (!emit) continue

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
