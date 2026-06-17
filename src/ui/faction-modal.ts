import {
  FACTION_START_INFO,
  getFactionLabel,
  PLAYABLE_FACTIONS,
} from '../core/factions.ts'
import type { FactionId } from '../types/index.ts'

export interface FactionModalOptions {
  title?: string
  confirmLabel?: string
}

export function showFactionModal(options: FactionModalOptions = {}): Promise<FactionId | null> {
  const overlay = document.querySelector<HTMLDivElement>('#faction-modal')!
  const titleEl = overlay.querySelector<HTMLHeadingElement>('#faction-modal-title')!
  const confirmBtn = overlay.querySelector<HTMLButtonElement>('#faction-modal-confirm')!
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('#faction-modal-cancel')!

  titleEl.textContent = options.title ?? '选择操控势力'
  confirmBtn.textContent = options.confirmLabel ?? '开始游戏'

  let selected: FactionId = 'wei'

  const cards = overlay.querySelectorAll<HTMLButtonElement>('[data-faction-card]')
  cards.forEach((card) => {
    const faction = card.dataset.factionCard as FactionId
    const info = FACTION_START_INFO[faction as keyof typeof FACTION_START_INFO]
    if (!info) return

    card.querySelector('.faction-name')!.textContent = getFactionLabel(faction)
    card.querySelector('.faction-hero')!.textContent = `主将：${info.heroName}`
    card.querySelector('.faction-capital')!.textContent = `都城：${info.capitalName}`
    card.querySelector('.faction-troops')!.textContent = `初始兵力：${info.startTroops}`
    card.querySelector('.faction-blurb')!.textContent = info.blurb
    card.classList.toggle('selected', faction === selected)
  })

  return new Promise((resolve) => {
    const pick = (faction: FactionId) => {
      selected = faction
      cards.forEach((c) => {
        c.classList.toggle('selected', c.dataset.factionCard === faction)
      })
    }

    const onCardClick = (e: Event) => {
      const card = (e.currentTarget as HTMLButtonElement).dataset.factionCard as FactionId
      if (PLAYABLE_FACTIONS.includes(card)) pick(card)
    }

    const cleanup = () => {
      overlay.hidden = true
      cards.forEach((c) => c.removeEventListener('click', onCardClick))
      confirmBtn.removeEventListener('click', onConfirm)
      cancelBtn.removeEventListener('click', onCancel)
      overlay.removeEventListener('click', onOverlayClick)
    }

    const onConfirm = () => {
      cleanup()
      resolve(selected)
    }

    const onCancel = () => {
      cleanup()
      resolve(null)
    }

    const onOverlayClick = (e: MouseEvent) => {
      if (e.target === overlay) onCancel()
    }

    cards.forEach((c) => c.addEventListener('click', onCardClick))
    confirmBtn.addEventListener('click', onConfirm)
    cancelBtn.addEventListener('click', onCancel)
    overlay.addEventListener('click', onOverlayClick)

    overlay.hidden = false
    pick(selected)
  })
}
