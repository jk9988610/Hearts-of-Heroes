import type { ArmyGroup, Corps, FactionId, GameSave, HeroConfig } from '../../types/index.ts'
import { cancelCorpsMarch, defendCorps, trainCorps } from './corps-commands.ts'
import { getCorpsLabel, nextOrgId } from './helpers.ts'

export function getFactionArmyGroups(save: GameSave, faction: FactionId): ArmyGroup[] {
  return save.factions[faction]?.armyGroups ?? []
}

export function findArmyGroupById(save: GameSave, id: string): ArmyGroup | null {
  for (const faction of Object.values(save.factions)) {
    const g = faction.armyGroups?.find((x) => x.id === id)
    if (g) return g
  }
  return null
}

export function getEligibleCorpsForArmyGroup(save: GameSave, faction: FactionId): Corps[] {
  return (save.factions[faction]?.corps ?? []).filter((c) => !c.armyGroupId)
}

export function getUnassignedCorps(save: GameSave, faction: FactionId): Corps[] {
  return getEligibleCorpsForArmyGroup(save, faction).filter((c) => !c.standby)
}

export function getCorpsIdsInGroup(save: GameSave, group: ArmyGroup): string[] {
  const f = save.factions[group.faction]
  if (!f) return group.corpsIds
  return group.corpsIds.filter((id) => f.corps.some((c) => c.id === id))
}

export function createArmyGroup(
  save: GameSave,
  faction: FactionId,
  corpsIds: string[],
  anchorCorpsId?: string,
): { ok: boolean; message: string; group?: ArmyGroup } {
  const f = save.factions[faction]
  if (!f) return { ok: false, message: '势力不存在' }
  if (corpsIds.length < 2) return { ok: false, message: '至少选择 2 个将军队' }

  f.armyGroups = f.armyGroups ?? []

  for (const id of corpsIds) {
    const corps = f.corps.find((c) => c.id === id)
    if (!corps || corps.faction !== faction) {
      return { ok: false, message: '将军队无效' }
    }
    if (corps.armyGroupId) return { ok: false, message: `${getCorpsLabel(corps)} 已在集团军中` }
  }

  const anchor = anchorCorpsId && corpsIds.includes(anchorCorpsId) ? anchorCorpsId : corpsIds[0]

  const group: ArmyGroup = {
    id: nextOrgId('ag'),
    faction,
    name: `集团军${f.armyGroups.length + 1}`,
    corpsIds: [...corpsIds],
    anchorCorpsId: anchor,
  }

  for (const id of corpsIds) {
    const corps = f.corps.find((c) => c.id === id)!
    corps.armyGroupId = group.id
  }

  f.armyGroups.push(group)
  return { ok: true, message: `已组建 ${group.name}`, group }
}

export function disbandArmyGroup(
  save: GameSave,
  groupId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const f = save.factions[faction]
  const group = f?.armyGroups?.find((g) => g.id === groupId)
  if (!f || !group) return { ok: false, message: '集团军不存在' }

  for (const corpsId of group.corpsIds) {
    const corps = f.corps.find((c) => c.id === corpsId)
    if (corps) corps.armyGroupId = undefined
  }

  f.armyGroups = f.armyGroups.filter((g) => g.id !== groupId)
  return { ok: true, message: '集团军已解散' }
}

export function appointMarshal(
  save: GameSave,
  groupId: string,
  heroId: string | null,
  faction: FactionId,
): { ok: boolean; message: string } {
  const f = save.factions[faction]
  const group = f?.armyGroups?.find((g) => g.id === groupId)
  if (!f || !group) return { ok: false, message: '集团军不存在' }

  if (heroId === null) {
    group.heroId = undefined
    return { ok: true, message: '元帅已卸任' }
  }

  if (!f.heroes.includes(heroId)) {
    return { ok: false, message: '该武将不属于本势力' }
  }

  for (const other of f.armyGroups ?? []) {
    if (other.id !== groupId && other.heroId === heroId) {
      other.heroId = undefined
    }
  }
  for (const corps of f.corps) {
    if (corps.heroId === heroId) corps.heroId = undefined
  }

  group.heroId = heroId
  return { ok: true, message: '元帅已任命' }
}

export function getArmyGroupLabel(group: ArmyGroup, heroes?: HeroConfig[]): string {
  if (group.heroId && heroes) {
    const hero = heroes.find((h) => h.id === group.heroId)
    if (hero) return `${hero.name}集团军`
  }
  return group.name ?? '集团军'
}

export function trainArmyGroup(
  save: GameSave,
  groupId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const group = findArmyGroupById(save, groupId)
  if (!group || group.faction !== faction) return { ok: false, message: '集团军不存在' }

  let ok = 0
  for (const corpsId of group.corpsIds) {
    const r = trainCorps(save, corpsId, faction)
    if (r.ok) ok++
  }
  if (ok === 0) return { ok: false, message: '训练失败（粮草不足或无缺编）' }
  return { ok: true, message: `集团军训练 ${ok} 次` }
}

export function defendArmyGroup(
  save: GameSave,
  groupId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const group = findArmyGroupById(save, groupId)
  if (!group || group.faction !== faction) return { ok: false, message: '集团军不存在' }

  let total = 0
  for (const corpsId of group.corpsIds) {
    const r = defendCorps(save, corpsId, faction)
    if (r.ok) total++
  }
  if (total === 0) return { ok: false, message: '无可用驻军' }
  return { ok: true, message: `集团军 ${total} 个将军队筑壕` }
}

export function cancelArmyGroupMarch(
  save: GameSave,
  groupId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const group = findArmyGroupById(save, groupId)
  if (!group || group.faction !== faction) return { ok: false, message: '集团军不存在' }

  let count = 0
  for (const corpsId of group.corpsIds) {
    const r = cancelCorpsMarch(save, corpsId, faction)
    if (r.ok) count++
  }
  if (count === 0) return { ok: false, message: '无行军可取消' }
  return { ok: true, message: `已取消集团军 ${count} 队行军` }
}
