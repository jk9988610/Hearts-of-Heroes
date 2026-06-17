import type { PolicyConfig } from '../types/index.ts'
import type { FactionId, GameSave } from '../types/index.ts'
import { assetUrl } from './paths.ts'

export async function loadPoliciesConfig(): Promise<PolicyConfig[]> {
  const res = await fetch(assetUrl('config/policies.json'))
  if (!res.ok) throw new Error(`无法加载 policies.json: ${res.status}`)
  return (await res.json()) as PolicyConfig[]
}

export function hasPolicy(save: GameSave, faction: FactionId, policyId: string): boolean {
  return save.factions[faction]?.policies.includes(policyId) ?? false
}

export function canActivatePolicy(
  save: GameSave,
  faction: FactionId,
  policy: PolicyConfig,
): boolean {
  const f = save.factions[faction]
  if (!f) return false
  if (hasPolicy(save, faction, policy.id)) return false
  if (f.food < policy.cost) return false
  if (policy.requires?.length) {
    for (const req of policy.requires) {
      if (!hasPolicy(save, faction, req)) return false
    }
  }
  return true
}

export function activatePolicy(
  save: GameSave,
  faction: FactionId,
  policy: PolicyConfig,
): boolean {
  if (!canActivatePolicy(save, faction, policy)) return false
  const f = save.factions[faction]!
  f.food -= policy.cost
  f.policies.push(policy.id)
  return true
}

export function getFoodPolicyMultiplier(save: GameSave, faction: FactionId): number {
  if (hasPolicy(save, faction, 'tuntian_plus')) return 1.5
  return 1
}

export function getDefensePolicyMultiplier(save: GameSave, faction: FactionId): number {
  if (hasPolicy(save, faction, 'iron_army')) return 1.2
  return 1
}

export function getMarchHours(save: GameSave, faction: FactionId, baseHours: number): number {
  if (hasPolicy(save, faction, 'fast_march')) {
    return Math.max(1, Math.floor(baseHours * 0.5))
  }
  return baseHours
}

/** @deprecated 使用 getMarchHours */
export function getMarchDays(save: GameSave, faction: FactionId, baseDays: number): number {
  return Math.max(1, Math.ceil(getMarchHours(save, faction, baseDays * 24) / 24))
}
