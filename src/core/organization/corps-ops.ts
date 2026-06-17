import type { Battalion, Corps, FactionId, GameSave } from '../../types/index.ts'
import {
  canAddBattalionToCorps,
  createCorps,
  getCorpsLabel,
  nextBattalionDesignation,
  nextOrgId,
} from './helpers.ts'
import { findBattalionOnTile, findCorpsById } from './queries.ts'

export interface CreateStandbyCorpsResult {
  corps: Corps
  attachedBattalion: Battalion | null
}

/** 在选中格创建待命将军队，可选收纳该格驻军千人队 */
export function createStandbyCorps(
  save: GameSave,
  faction: FactionId,
  tileId: string,
): CreateStandbyCorpsResult {
  const f = save.factions[faction]
  if (!f) throw new Error(`faction ${faction} missing`)

  const stationed = findBattalionOnTile(save, tileId)
  const corps = createCorps(faction, tileId, {
    id: nextOrgId('corps'),
    name: `将军队·待命`,
    standby: true,
  })

  let attached: Battalion | null = null
  if (stationed && stationed.faction === faction && !stationed.inCombat && !stationed.marchHoursLeft) {
    if (canAddBattalionToCorps(corps)) {
      stationed.corpsId = corps.id
      stationed.designation = nextBattalionDesignation(corps)
      corps.battalionIds.push(stationed.id)
      attached = stationed
    }
  }

  f.corps.push(corps)
  return { corps, attachedBattalion: attached }
}

/** 将地图选中格的千人队编入待命将军队 */
export function attachBattalionToCorps(
  save: GameSave,
  corpsId: string,
  battalionId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const corps = findCorpsById(save, corpsId)
  const f = save.factions[faction]
  if (!corps || !f) return { ok: false, message: '将军队不存在' }
  if (corps.faction !== faction) return { ok: false, message: '非己方将军队' }

  const battalion = f.battalions.find((b) => b.id === battalionId)
  if (!battalion) return { ok: false, message: '千人队不存在' }
  if (battalion.faction !== faction) return { ok: false, message: '非己方单位' }
  if (battalion.inCombat || battalion.marchHoursLeft) {
    return { ok: false, message: '单位行军中或战斗中' }
  }
  if (battalion.corpsId === corpsId) return { ok: false, message: '已在该将军队中' }
  if (!canAddBattalionToCorps(corps)) {
    return { ok: false, message: '将军队已满（最多 10 个千人队）' }
  }

  if (battalion.corpsId) {
    const oldCorps = findCorpsById(save, battalion.corpsId)
    if (oldCorps) {
      oldCorps.battalionIds = oldCorps.battalionIds.filter((id) => id !== battalion.id)
    }
  }

  battalion.corpsId = corps.id
  battalion.designation = nextBattalionDesignation(corps)
  corps.battalionIds.push(battalion.id)
  corps.tileId = battalion.tileId

  return { ok: true, message: `${battalion.designation}队 编入 ${getCorpsLabel(corps)}` }
}

export function appointGeneral(
  save: GameSave,
  corpsId: string,
  heroId: string | null,
  faction: FactionId,
): { ok: boolean; message: string } {
  const corps = findCorpsById(save, corpsId)
  const f = save.factions[faction]
  if (!corps || !f) return { ok: false, message: '将军队不存在' }
  if (corps.faction !== faction) return { ok: false, message: '非己方将军队' }

  if (heroId === null) {
    corps.heroId = undefined
    return { ok: true, message: '将军已卸任' }
  }

  if (!f.heroes.includes(heroId)) {
    return { ok: false, message: '该武将不属于本势力' }
  }

  for (const other of f.corps) {
    if (other.id !== corpsId && other.heroId === heroId) {
      other.heroId = undefined
    }
  }

  corps.heroId = heroId
  return { ok: true, message: '将军已任命' }
}

export function getSelectedBattalionForCorpsOp(
  save: GameSave,
  tileId: string | undefined,
  faction: FactionId,
): Battalion | null {
  if (!tileId) return null
  const b = findBattalionOnTile(save, tileId)
  if (!b || b.faction !== faction) return null
  if (b.inCombat || b.marchHoursLeft) return null
  return b
}
