import type { Battalion, FactionId, GameSave, GeneratedMap } from '../types/index.ts'
import { runAiTurn, type AiAction } from './ai.ts'
import {
  applyBattleOutcome,
  COMBAT_HOURS,
  findBattalionOnTile,
  finishMarch,
  getCombatHoursLeft,
  getMarchHoursLeft,
} from './combat.ts'
import { countBattalionTroops } from './organization/helpers.ts'
import { processEconomyHour, processStarvationDissolution } from './economy.ts'
import { tryContinueMarchRoute } from './march-path.ts'
import { isBattalionEventVisible, isFactionInView } from './visibility.ts'
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
  starvation: string[]
  battleFlashes: { tileId: string; kind: 'capture' | 'defend' | 'stalemate' }[]
}

export function gameHourTick(
  save: GameSave,
  map: GeneratedMap,
  ctx: TickContext,
): TickEvents {
  const events: TickEvents = { ai: [], marches: [], battles: [], starvation: [], battleFlashes: [] }
  const isNewDay = ctx.clock.hour === 0

  save.date = ctx.clock.day
  save.hour = ctx.clock.hour

  processEconomyHour(save, map, isNewDay)
  if (isNewDay) {
    events.starvation = processStarvationDissolution(save)
  }
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
  const marching: Battalion[] = []
  for (const faction of Object.values(save.factions)) {
    for (const battalion of faction.battalions) {
      const left = getMarchHoursLeft(battalion)
      if (left !== undefined && left > 0) marching.push(battalion)
    }
  }

  for (const battalion of marching) {
    if (battalion.inCombat) continue
    const left = (getMarchHoursLeft(battalion) ?? 1) - 1
    battalion.marchHoursLeft = left
    battalion.marchDaysLeft = undefined

    if (left <= 0 && battalion.targetTileId) {
      const target = battalion.targetTileId
      const terrain = map.tileById[target]?.type ?? 'plain'
      const result = finishMarch(save, battalion, target, terrain)
      if (result.type === 'moved' || result.type === 'merge') {
        tryContinueMarchRoute(save, battalion)
      }
      const tileName = map.tileById[target]?.name ?? target
      const emit = isBattalionEventVisible(battalion, ctx.visibleTileIds, ctx.playerFaction)

      if (!emit) continue

      if (result.type === 'blocked') {
        events.marches.push(`${battalion.faction} 在 ${tileName} 停步（和平时不可进入）`)
      } else if (result.type === 'combat') {
        events.marches.push(`${battalion.faction} 抵达 ${tileName}，进入战斗`)
      } else if (result.type === 'merge') {
        events.marches.push(`${battalion.faction} 抵达 ${tileName}，合兵`)
      } else {
        events.marches.push(`${battalion.faction} 抵达 ${tileName}`)
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
  const byTile = new Map<string, Battalion[]>()

  for (const faction of Object.values(save.factions)) {
    for (const battalion of faction.battalions) {
      if (!battalion.inCombat) continue
      const list = byTile.get(battalion.tileId) ?? []
      list.push(battalion)
      byTile.set(battalion.tileId, list)
    }
  }

  for (const [tileId, battalions] of byTile) {
    if (battalions.length < 2) {
      for (const battalion of battalions) {
        battalion.inCombat = false
        battalion.combatHoursLeft = undefined
        battalion.combatDaysLeft = undefined
      }
      continue
    }

    const attacker =
      battalions.find((b) => b.targetTileId === tileId) ??
      battalions.find((b) => battalions.some((d) => d.faction !== b.faction)) ??
      battalions[0]!
    const defender = battalions.find(
      (b) => b.faction !== attacker.faction && b.id !== attacker.id,
    )
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
      isBattalionEventVisible(attacker, ctx.visibleTileIds, ctx.playerFaction) ||
      isBattalionEventVisible(defender, ctx.visibleTileIds, ctx.playerFaction)
    if (!emit) continue

    const defTroops = countBattalionTroops(defender)
    const atkTroops = countBattalionTroops(attacker)

    if (result.attackerWins || defTroops <= 0) {
      events.battles.push(
        `${attacker.faction} 攻克 ${tileName}（剩${result.attackerTroops}兵）`,
      )
      events.battleFlashes.push({ tileId, kind: 'capture' })
    } else if (atkTroops <= 0) {
      events.battles.push(`${defender.faction} 守住 ${tileName}`)
      events.battleFlashes.push({ tileId, kind: 'defend' })
    } else {
      events.battles.push(
        `${tileName} 战平：攻${result.attackerTroops} / 守${result.defenderTroops}`,
      )
      events.battleFlashes.push({ tileId, kind: 'stalemate' })
    }
  }
}

export function getBattalionOnTile(save: GameSave, tileId: string): Battalion | null {
  return findBattalionOnTile(save, tileId)
}

export function playerCanAct(save: GameSave, tileId: string, player: FactionId): boolean {
  return save.tiles[tileId]?.owner === player
}

/** @deprecated */
export const getArmyOnTile = getBattalionOnTile
