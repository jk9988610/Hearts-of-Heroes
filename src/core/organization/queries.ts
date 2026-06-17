import type { Battalion, Corps, FactionId, GameSave } from '../../types/index.ts'
import { countBattalionTroops } from './helpers.ts'

export function getFactionBattalions(save: GameSave, faction: FactionId): Battalion[] {
  return save.factions[faction]?.battalions ?? []
}

export function getFactionCorps(save: GameSave, faction: FactionId): Corps[] {
  return save.factions[faction]?.corps ?? []
}

export function findBattalionById(save: GameSave, id: string): Battalion | null {
  for (const faction of Object.values(save.factions)) {
    const b = faction.battalions.find((x) => x.id === id)
    if (b) return b
  }
  return null
}

export function findCorpsById(save: GameSave, id: string): Corps | null {
  for (const faction of Object.values(save.factions)) {
    const c = faction.corps.find((x) => x.id === id)
    if (c) return c
  }
  return null
}

export function findBattalionOnTile(save: GameSave, tileId: string): Battalion | null {
  for (const faction of Object.values(save.factions)) {
    const b = faction.battalions.find(
      (x) => x.tileId === tileId && x.marchHoursLeft === undefined && !x.marchDaysLeft,
    )
    if (b) return b
  }
  return null
}

export function findMarchingBattalionToTile(save: GameSave, tileId: string): Battalion | null {
  for (const faction of Object.values(save.factions)) {
    const b = faction.battalions.find(
      (x) =>
        x.targetTileId === tileId &&
        (x.marchHoursLeft !== undefined || x.marchDaysLeft !== undefined),
    )
    if (b) return b
  }
  return null
}

export function findBattalionForUi(save: GameSave, tileId: string): Battalion | null {
  const stationed = findBattalionOnTile(save, tileId)
  if (stationed) return stationed
  return findMarchingBattalionToTile(save, tileId)
}

export function listAllBattalions(save: GameSave): Battalion[] {
  const list: Battalion[] = []
  for (const faction of Object.values(save.factions)) {
    list.push(...faction.battalions)
  }
  return list
}

export function totalFactionTroops(save: GameSave, faction: FactionId): number {
  return getFactionBattalions(save, faction).reduce((s, b) => s + countBattalionTroops(b), 0)
}

export function getStandbyCorps(save: GameSave, faction: FactionId): Corps[] {
  return getFactionCorps(save, faction).filter((c) => c.standby)
}

export function getCorpsBattalions(save: GameSave, corps: Corps): Battalion[] {
  const faction = save.factions[corps.faction]
  if (!faction) return []
  return corps.battalionIds
    .map((id) => faction.battalions.find((b) => b.id === id))
    .filter((b): b is Battalion => b !== undefined)
}
