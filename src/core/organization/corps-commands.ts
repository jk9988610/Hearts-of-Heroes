import type { FactionId, GameSave } from '../../types/index.ts'
import { clearBattalionMarch, getMarchHoursLeft } from '../combat.ts'
import { RECRUIT_COST, RECRUIT_TROOPS, canRecruit } from '../economy.ts'
import { TROOPS_PER_CENTURY } from './constants.ts'
import { findMostUnderstrengthCentury } from './helpers.ts'
import { findCorpsById, getCorpsBattalions } from './queries.ts'

export function trainCorps(
  save: GameSave,
  corpsId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const corps = findCorpsById(save, corpsId)
  const f = save.factions[faction]
  if (!corps || !f || corps.faction !== faction) {
    return { ok: false, message: '将军队不存在' }
  }

  const battalions = getCorpsBattalions(save, corps)
  const target = findMostUnderstrengthCentury(battalions)
  if (!target) return { ok: false, message: '无可训练缺编' }
  if (!canRecruit(save, faction)) return { ok: false, message: '粮草不足' }

  f.food -= RECRUIT_COST
  target.century.troops = Math.min(
    TROOPS_PER_CENTURY,
    target.century.troops + RECRUIT_TROOPS,
  )
  return { ok: true, message: `${target.battalion.designation}队 训练 +${RECRUIT_TROOPS}` }
}

export function defendCorps(
  save: GameSave,
  corpsId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const corps = findCorpsById(save, corpsId)
  if (!corps || corps.faction !== faction) {
    return { ok: false, message: '将军队不存在' }
  }

  let count = 0
  for (const b of getCorpsBattalions(save, corps)) {
    if (b.marchHoursLeft || b.inCombat) continue
    b.dugIn = true
    count += 1
  }

  if (count === 0) return { ok: false, message: '无可用驻军可筑壕' }
  return { ok: true, message: `${count} 个千人队进入驻守（筑壕）` }
}

export function cancelCorpsMarch(
  save: GameSave,
  corpsId: string,
  faction: FactionId,
): { ok: boolean; message: string } {
  const corps = findCorpsById(save, corpsId)
  if (!corps || corps.faction !== faction) {
    return { ok: false, message: '将军队不存在' }
  }

  let count = 0
  for (const b of getCorpsBattalions(save, corps)) {
    if (!getMarchHoursLeft(b)) continue
    clearBattalionMarch(b)
    count += 1
  }

  if (count === 0) return { ok: false, message: '无行军中单位' }
  return { ok: true, message: `已取消 ${count} 队行军` }
}

export function ensureBattalionDefaults(save: GameSave): void {
  for (const faction of Object.values(save.factions)) {
    for (const b of faction.battalions) {
      if (b.organization === undefined) {
        const troops = b.centuries.reduce((s, c) => s + c.troops, 0)
        b.organization = Math.min(100, Math.round((troops / 1000) * 100))
      }
      if (b.equipment === undefined) {
        b.equipment = b.organization
      }
    }
  }
}
