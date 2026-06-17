import type { FactionId, GameSave, HeroConfig } from '../../types/index.ts'
import { findCorpsById } from './queries.ts'

let heroRegistry: HeroConfig[] = []

export function setHeroRegistry(heroes: HeroConfig[]): void {
  heroRegistry = heroes
}

export function getHeroById(id: string): HeroConfig | undefined {
  return heroRegistry.find((h) => h.id === id)
}

export function getAssignedHeroIds(save: GameSave, faction: FactionId): Set<string> {
  const assigned = new Set<string>()
  const f = save.factions[faction]
  if (!f) return assigned

  for (const corps of f.corps) {
    if (corps.heroId) assigned.add(corps.heroId)
  }
  for (const group of f.armyGroups ?? []) {
    if (group.heroId) assigned.add(group.heroId)
  }
  return assigned
}

export function getCorpsCombatMultiplier(
  save: GameSave,
  corpsId: string | undefined,
): { attack: number; defense: number } {
  if (!corpsId) return { attack: 1, defense: 1 }
  const corps = findCorpsById(save, corpsId)
  if (!corps?.heroId) return { attack: 1, defense: 1 }
  const hero = getHeroById(corps.heroId)
  if (!hero) return { attack: 1, defense: 1 }
  return {
    attack: 1 + hero.attack / 200,
    defense: 1 + hero.defense / 200,
  }
}

/** AI 势力：为无将军的将军队自动绑定配置表武将 */
export function autoAssignAiGenerals(save: GameSave, faction: FactionId): void {
  const f = save.factions[faction]
  if (!f) return

  const available = [...f.heroes]
  for (const corps of f.corps) {
    if (corps.heroId || corps.standby) continue
    const heroId = available.shift()
    if (heroId) corps.heroId = heroId
  }
}

export function ensureArmyGroups(save: GameSave): void {
  for (const faction of Object.values(save.factions)) {
    faction.armyGroups = faction.armyGroups ?? []
    for (const corps of faction.corps) {
      if (corps.armyGroupId) {
        const group = faction.armyGroups.find((g) => g.id === corps.armyGroupId)
        if (!group) corps.armyGroupId = undefined
        else if (!group.corpsIds.includes(corps.id)) {
          group.corpsIds.push(corps.id)
        }
      }
    }
  }
}
