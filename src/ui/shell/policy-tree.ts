import type { FactionId, GameSave, PolicyConfig } from '../../types/index.ts'
import { activatePolicy, canActivatePolicy, hasPolicy } from '../../core/policies.ts'

export function renderPolicyTree(
  container: HTMLElement,
  save: GameSave,
  policies: PolicyConfig[],
  playerFaction: FactionId,
  onChange: () => void,
): void {
  container.innerHTML = ''

  const tiers = new Map<number, PolicyConfig[]>()
  for (const p of policies) {
    const tier = p.tier ?? 0
    const list = tiers.get(tier) ?? []
    list.push(p)
    tiers.set(tier, list)
  }

  const maxTier = Math.max(0, ...tiers.keys())

  for (let t = 0; t <= maxTier; t++) {
    const row = document.createElement('div')
    row.className = 'policy-tree-tier'
    row.dataset.tier = String(t)

    const tierPolicies = tiers.get(t) ?? []
    for (const policy of tierPolicies) {
      const node = document.createElement('div')
      node.className = 'policy-tree-node'

      const owned = hasPolicy(save, playerFaction, policy.id)
      const canBuy = canActivatePolicy(save, playerFaction, policy)
      const locked = !owned && !canBuy && (policy.requires?.length ?? 0) > 0

      if (owned) node.classList.add('owned')
      if (locked) node.classList.add('locked')

      const reqText =
        policy.requires?.length && !owned
          ? `需：${policy.requires.join('、')}`
          : ''

      node.innerHTML = `
        <div class="policy-node-name">${policy.name}</div>
        <div class="policy-node-cost">${owned ? '已激活' : `${policy.cost}粮`}</div>
        ${reqText ? `<div class="policy-node-req">${reqText}</div>` : ''}
      `

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'policy-node-btn'
      btn.textContent = owned ? '✓' : '激活'
      btn.disabled = owned || !canBuy
      btn.addEventListener('click', () => {
        if (activatePolicy(save, playerFaction, policy)) {
          onChange()
          renderPolicyTree(container, save, policies, playerFaction, onChange)
        }
      })
      node.appendChild(btn)
      row.appendChild(node)
    }

    if (tierPolicies.length > 0) {
      container.appendChild(row)
      if (t < maxTier) {
        const connector = document.createElement('div')
        connector.className = 'policy-tree-connector'
        connector.textContent = '↓'
        container.appendChild(connector)
      }
    }
  }
}
