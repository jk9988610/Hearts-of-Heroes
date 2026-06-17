import type { Battalion, Century, Corps, FactionId } from '../../types/index.ts'
import {
  CENTURIES_PER_BATTALION,
  MAX_BATTALIONS_PER_CORPS,
  MAX_TROOPS_PER_BATTALION,
  TROOPS_PER_CENTURY,
  UNDERSTRENGTH_MARCH_THRESHOLD,
} from './constants.ts'

let idCounter = 0

export function nextOrgId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now()}_${idCounter}`
}

export function resetOrgIdCounter(): void {
  idCounter = 0
}

export function countCenturyTroops(centuries: Century[]): number {
  return centuries.reduce((sum, c) => sum + c.troops, 0)
}

export function countBattalionTroops(battalion: Battalion): number {
  return countCenturyTroops(battalion.centuries)
}

export function countCorpsTroops(save: { factions: Record<string, { battalions: Battalion[] }> }, corps: Corps): number {
  const faction = save.factions[corps.faction]
  if (!faction) return 0
  return corps.battalionIds.reduce((sum, id) => {
    const b = faction.battalions.find((x) => x.id === id)
    return sum + (b ? countBattalionTroops(b) : 0)
  }, 0)
}

export function countFactionCenturies(faction: { battalions: Battalion[] }): number {
  let n = 0
  for (const b of faction.battalions) {
    for (const c of b.centuries) {
      if (c.troops > 0) n += 1
    }
  }
  return n
}

export function createCenturies(totalTroops: number): Century[] {
  const centuries: Century[] = []
  let remaining = Math.max(0, totalTroops)
  for (let i = 0; i < CENTURIES_PER_BATTALION; i++) {
    const troops = Math.min(TROOPS_PER_CENTURY, remaining)
    centuries.push({ index: i, troops })
    remaining -= troops
  }
  return centuries
}

export function createBattalion(
  faction: FactionId,
  tileId: string,
  totalTroops: number,
  opts: {
    id?: string
    corpsId?: string
    designation?: number
    targetTileId?: string
    marchHoursLeft?: number
    inCombat?: boolean
    combatHoursLeft?: number
  } = {},
): Battalion {
  return {
    id: opts.id ?? nextOrgId('bat'),
    faction,
    corpsId: opts.corpsId,
    designation: opts.designation ?? 1,
    centuries: createCenturies(totalTroops),
    tileId,
    targetTileId: opts.targetTileId,
    marchHoursLeft: opts.marchHoursLeft,
    inCombat: opts.inCombat,
    combatHoursLeft: opts.combatHoursLeft,
  }
}

export function createCorps(
  faction: FactionId,
  tileId: string,
  opts: {
    id?: string
    name?: string
    heroId?: string
    standby?: boolean
    battalionIds?: string[]
  } = {},
): Corps {
  return {
    id: opts.id ?? nextOrgId('corps'),
    faction,
    name: opts.name,
    heroId: opts.heroId,
    battalionIds: opts.battalionIds ?? [],
    tileId,
    standby: opts.standby ?? false,
  }
}

/** 将兵力拆分为若干千人队（每队最多 10 个百人队） */
export function splitTroopsIntoBattalionChunks(totalTroops: number): number[] {
  const chunks: number[] = []
  let remaining = totalTroops
  while (remaining > 0) {
    chunks.push(Math.min(MAX_TROOPS_PER_BATTALION, remaining))
    remaining -= chunks[chunks.length - 1]!
  }
  return chunks.length > 0 ? chunks : [0]
}

export function distributeCenturyLosses(battalion: Battalion, lossTroops: number): void {
  let remaining = Math.max(0, lossTroops)
  for (const century of battalion.centuries) {
    if (remaining <= 0) break
    const take = Math.min(century.troops, remaining)
    century.troops -= take
    remaining -= take
  }
}

export function setBattalionTroops(battalion: Battalion, troops: number): void {
  battalion.centuries = createCenturies(troops)
}

export function isBattalionUnderstrength(battalion: Battalion): boolean {
  return countBattalionTroops(battalion) < UNDERSTRENGTH_MARCH_THRESHOLD
}

export function getCorpsLabel(corps: Corps, heroes?: { id: string; name: string }[]): string {
  if (corps.heroId && heroes) {
    const hero = heroes.find((h) => h.id === corps.heroId)
    if (hero) return `${hero.name}军`
  }
  if (corps.name) return corps.name
  if (corps.standby) return '将军队·待命'
  return '将军队'
}

export function nextBattalionDesignation(corps: Corps): number {
  return Math.min(MAX_BATTALIONS_PER_CORPS, corps.battalionIds.length + 1)
}

export function canAddBattalionToCorps(corps: Corps): boolean {
  return corps.battalionIds.length < MAX_BATTALIONS_PER_CORPS
}

export function findMostUnderstrengthCentury(battalions: Battalion[]): { battalion: Battalion; century: Century } | null {
  let best: { battalion: Battalion; century: Century } | null = null
  let bestGap = 0

  for (const battalion of battalions) {
    for (const century of battalion.centuries) {
      if (century.troops >= TROOPS_PER_CENTURY) continue
      const gap = TROOPS_PER_CENTURY - century.troops
      if (!best || gap > bestGap) {
        best = { battalion, century }
        bestGap = gap
      }
    }
  }
  return best
}

export function mergeBattalionCenturies(into: Battalion, from: Battalion): void {
  const total = countBattalionTroops(into) + countBattalionTroops(from)
  setBattalionTroops(into, Math.min(MAX_TROOPS_PER_BATTALION, total))
}
