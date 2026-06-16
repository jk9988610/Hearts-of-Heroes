import type { Army, FactionId, GameSave } from '../types/index.ts'
import { findArmyOnTile, findMarchingArmyToTile } from '../core/combat.ts'

export type ArmyDisplayKind = 'garrison' | 'marching-in' | 'marching-out' | 'combat'

export interface ArmyOverlay {
  troops: number
  faction: FactionId
  kind: ArmyDisplayKind
  status?: string
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

/** 构建地图驻军/行军可视化数据 */
export function buildArmyDisplay(save: GameSave): ArmyDisplayState {
  const overlays: Record<string, ArmyOverlay> = {}
  const arrows: MarchArrow[] = []

  for (const faction of Object.values(save.factions)) {
    for (const army of faction.armies) {
      if (army.marchDaysLeft && army.targetTileId) {
        const days = army.marchDaysLeft
        const target = army.targetTileId
        const from = army.tileId

        arrows.push({
          fromTileId: from,
          toTileId: target,
          faction: army.faction,
          label: `行${days}`,
        })

        overlays[target] = {
          troops: army.troops,
          faction: army.faction,
          kind: 'marching-in',
          status: `→${days}天`,
        }

        overlays[from] = {
          troops: 0,
          faction: army.faction,
          kind: 'marching-out',
          status: '出发',
        }
      } else if (army.inCombat) {
        overlays[army.tileId] = {
          troops: army.troops,
          faction: army.faction,
          kind: 'combat',
          status: `战${army.combatDaysLeft ?? 0}`,
        }
      } else {
        overlays[army.tileId] = {
          troops: army.troops,
          faction: army.faction,
          kind: 'garrison',
        }
      }
    }
  }

  return { overlays, arrows }
}

export function getArmyForUi(save: GameSave, tileId: string): Army | null {
  const stationed = findArmyOnTile(save, tileId)
  if (stationed) return stationed
  return findMarchingArmyToTile(save, tileId)
}

export function listAllArmies(save: GameSave): Army[] {
  const list: Army[] = []
  for (const faction of Object.values(save.factions)) {
    list.push(...faction.armies)
  }
  return list
}
