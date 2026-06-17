import type { Battalion, FactionId, GameSave } from '../types/index.ts'
import {
  getCombatHoursLeft,
  getMarchHoursLeft,
} from '../core/combat.ts'
import { countBattalionTroops } from '../core/organization/helpers.ts'
import { findBattalionForUi, listAllBattalions } from '../core/organization/queries.ts'
import { formatHoursBrief } from '../core/time-scale.ts'

export type ArmyDisplayKind = 'garrison' | 'marching-in' | 'marching-out' | 'combat'

export interface ArmyOverlay {
  troops: number
  faction: FactionId
  kind: ArmyDisplayKind
  status?: string
  designation?: number
}

export interface MarchArrow {
  fromTileId: string
  toTileId: string
  faction: FactionId
  label: string
}

export interface ArmyDisplayState {
  overlays: Record<string, ArmyOverlay>
  arrows: MarchArrow[]
}

const FACTION_MARKER: Record<FactionId, string> = {
  wei: '#4a5d6c',
  shu: '#8b3a3a',
  wu: '#3a6b5c',
  neutral: '#9a9080',
}

export function getFactionMarkerColor(faction: FactionId): string {
  return FACTION_MARKER[faction] ?? FACTION_MARKER.neutral
}

export function buildArmyDisplay(save: GameSave): ArmyDisplayState {
  const overlays: Record<string, ArmyOverlay> = {}
  const arrows: MarchArrow[] = []

  for (const battalion of listAllBattalions(save)) {
    const troops = countBattalionTroops(battalion)
    const marchH = getMarchHoursLeft(battalion)
    const combatH = getCombatHoursLeft(battalion)

    if (marchH !== undefined && marchH > 0 && battalion.targetTileId) {
      const target = battalion.targetTileId
      const from = battalion.tileId

      arrows.push({
        fromTileId: from,
        toTileId: target,
        faction: battalion.faction,
        label: formatHoursBrief(marchH),
      })

      overlays[target] = {
        troops,
        faction: battalion.faction,
        kind: 'marching-in',
        status: `→${formatHoursBrief(marchH)}`,
        designation: battalion.designation,
      }

      overlays[from] = {
        troops: 0,
        faction: battalion.faction,
        kind: 'marching-out',
        status: '出发',
      }
    } else if (battalion.inCombat && combatH !== undefined) {
      overlays[battalion.tileId] = {
        troops,
        faction: battalion.faction,
        kind: 'combat',
        status: `战${formatHoursBrief(combatH)}`,
        designation: battalion.designation,
      }
    } else {
      const existing = overlays[battalion.tileId]
      if (existing) {
        existing.troops += troops
      } else {
        overlays[battalion.tileId] = {
          troops,
          faction: battalion.faction,
          kind: 'garrison',
          designation: battalion.designation,
        }
      }
    }
  }

  return { overlays, arrows }
}

export function getArmyForUi(save: GameSave, tileId: string): Battalion | null {
  return findBattalionForUi(save, tileId)
}

export function listAllArmies(save: GameSave): Battalion[] {
  return listAllBattalions(save)
}

export type { Battalion }
