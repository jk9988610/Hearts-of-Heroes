import type { Army, FactionId, GameSave } from '../../types/index.ts'
import { HOURS_PER_DAY } from '../time-scale.ts'
import {
  createBattalion,
  createCorps,
  nextOrgId,
  splitTroopsIntoBattalionChunks,
} from './helpers.ts'

function migrateArmyHours(army: Army): void {
  if (army.marchHoursLeft === undefined && army.marchDaysLeft !== undefined) {
    army.marchHoursLeft = army.marchDaysLeft * HOURS_PER_DAY
    delete army.marchDaysLeft
  }
  if (army.combatHoursLeft === undefined && army.combatDaysLeft !== undefined) {
    army.combatHoursLeft = army.combatDaysLeft * HOURS_PER_DAY
    delete army.combatDaysLeft
  }
}

/** 1 旧 Army → 1 Corps + N Battalion（每队最多 1000 人）+ 各 10 百人队 */
export function armyToOrganization(
  army: Army,
  faction: FactionId,
): { corps: ReturnType<typeof createCorps>; battalions: ReturnType<typeof createBattalion>[] } {
  migrateArmyHours(army)

  const corpsId = nextOrgId('corps')
  const chunks = splitTroopsIntoBattalionChunks(army.troops)
  const battalions = chunks.map((troops, i) =>
    createBattalion(faction, army.tileId, troops, {
      corpsId,
      designation: i + 1,
      targetTileId: i === 0 ? army.targetTileId : undefined,
      marchHoursLeft: i === 0 ? army.marchHoursLeft : undefined,
      inCombat: i === 0 ? army.inCombat : undefined,
      combatHoursLeft: i === 0 ? army.combatHoursLeft : undefined,
    }),
  )

  const corps = createCorps(faction, army.tileId, {
    id: corpsId,
    standby: false,
    battalionIds: battalions.map((b) => b.id),
  })

  return { corps, battalions }
}

export function migrateArmiesToOrganization(save: GameSave): void {
  for (const [factionId, faction] of Object.entries(save.factions)) {
    if (faction.corps && faction.battalions) {
      if (faction.armies?.length) {
        for (const army of faction.armies) {
          const { corps, battalions } = armyToOrganization(army, factionId as FactionId)
          faction.corps.push(corps)
          faction.battalions.push(...battalions)
        }
        faction.armies = []
      }
      continue
    }

    faction.corps = faction.corps ?? []
    faction.battalions = faction.battalions ?? []
    const armies = faction.armies ?? []

    for (const army of armies) {
      const { corps, battalions } = armyToOrganization(army, factionId as FactionId)
      faction.corps.push(corps)
      faction.battalions.push(...battalions)

      const primary = battalions[0]
      if (primary && !army.marchHoursLeft && !army.inCombat) {
        save.tiles[army.tileId]!.battalionId = primary.id
        delete save.tiles[army.tileId]!.armyId
      }
    }

    faction.armies = []
  }
}

export function ensureOrganizationTiles(save: GameSave): void {
  for (const faction of Object.values(save.factions)) {
    for (const battalion of faction.battalions) {
      if (battalion.marchHoursLeft || battalion.inCombat) continue
      const tile = save.tiles[battalion.tileId]
      if (tile && !tile.battalionId) {
        tile.battalionId = battalion.id
      }
    }
  }
}
