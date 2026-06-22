import type { FactionId, GameSave } from '../types/index.ts'
import {
  buildTuntian,
  canBuildTuntian,
  canRecruit,
  recruitOnTile,
  TUNTIAN_COST,
} from '../core/economy.ts'
import { getFactionLabel } from '../core/factions.ts'

export interface ActionBarOptions {
  getSave: () => GameSave | null
  getPlayerFaction: () => FactionId
  getSelectedTileId: () => string | undefined
  getMapLayer: () => string
  isGameEnded: () => boolean
  onChanged?: () => void
  showAlert: (msg: string, type: 'info' | 'warn' | 'success', ms?: number) => void
  modalHost: { open: (id: string, title?: string) => void; toggle: (id: string, title?: string) => void }
}

export function bindActionBar(options: ActionBarOptions): void {
  const buttons: Record<string, string> = {
    research: '科研',
    trade: '贸易',
    construction: '建设',
    production: '生产',
    recruitment: '募兵',
  }

  for (const [action, label] of Object.entries(buttons)) {
    document.querySelector(`#btn-action-${action}`)?.addEventListener('click', () => {
      if (action === 'construction') {
        handleConstruction(options)
        return
      }
      if (action === 'recruitment') {
        handleRecruitment(options)
        return
      }
      options.modalHost.open(`action-${action}`, label)
    })
  }

  document.querySelector('#action-construction-run')?.addEventListener('click', () => {
    runTuntian(options)
  })

  document.querySelector('#action-recruitment-run')?.addEventListener('click', () => {
    runRecruit(options)
  })
}

function handleConstruction(options: ActionBarOptions): void {
  refreshActionTileHint(options, 'construction')
  options.modalHost.open('action-construction', '建设')
}

function handleRecruitment(options: ActionBarOptions): void {
  refreshActionTileHint(options, 'recruitment')
  options.modalHost.open('action-recruitment', '募兵')
}

function refreshActionTileHint(options: ActionBarOptions, kind: 'construction' | 'recruitment'): void {
  const save = options.getSave()
  const tileId = options.getSelectedTileId()
  const pf = options.getPlayerFaction()
  const hintEl = document.querySelector(`#action-${kind}-hint`)!
  const btn = document.querySelector(`#action-${kind}-run`) as HTMLButtonElement

  if (!save || !tileId) {
    hintEl.textContent = '请先在地图上选中己方地块'
    btn.disabled = true
    return
  }

  const owner = save.tiles[tileId]?.owner
  const onMilitary = options.getMapLayer() === 'military'
  const food = save.factions[pf]?.food ?? 0

  if (kind === 'construction') {
    const ok =
      !options.isGameEnded() &&
      owner === pf &&
      onMilitary &&
      canBuildTuntian(save, tileId) &&
      food >= TUNTIAN_COST
    hintEl.textContent = ok
      ? `选中地块可建造屯田（消耗 ${TUNTIAN_COST} 粮）`
      : owner !== pf
        ? '只能在本国领土建设'
        : !canBuildTuntian(save, tileId)
          ? '该地块已有屯田或不可建设'
          : `粮不足（需要 ${TUNTIAN_COST}，当前 ${food.toFixed(0)}）`
    btn.disabled = !ok
  } else {
    const ok = !options.isGameEnded() && owner === pf && onMilitary && canRecruit(save, pf)
    hintEl.textContent = ok
      ? `为${getFactionLabel(pf)}募兵（消耗 20 粮，+100 人）`
      : owner !== pf
        ? '只能在本国领土募兵'
        : '暂无缺编部队可募'
    btn.disabled = !ok
  }
}

function runTuntian(options: ActionBarOptions): void {
  const save = options.getSave()
  const tileId = options.getSelectedTileId()
  const pf = options.getPlayerFaction()
  if (!save || !tileId) return
  if (buildTuntian(save, tileId, pf)) {
    options.showAlert('屯田建造成功', 'success', 2500)
    options.onChanged?.()
    refreshActionTileHint(options, 'construction')
  } else {
    options.showAlert('无法建造屯田', 'warn', 2500)
  }
}

function runRecruit(options: ActionBarOptions): void {
  const save = options.getSave()
  const tileId = options.getSelectedTileId()
  const pf = options.getPlayerFaction()
  if (!save || !tileId) return
  if (recruitOnTile(save, tileId, pf)) {
    options.showAlert('募兵成功', 'success', 2500)
    options.onChanged?.()
    refreshActionTileHint(options, 'recruitment')
  } else {
    options.showAlert('募兵失败（粮不足或无缺编）', 'warn', 2500)
  }
}
