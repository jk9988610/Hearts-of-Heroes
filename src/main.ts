import { TimeController, type SpeedMultiplier } from './core/time.ts'
import {
  applyKeyCityOwners,
  drawMapPreview,
  generateMap,
  getInitialOwners,
  hitTestTile,
  loadTerrainConfig,
} from './map/generator.ts'
import {
  createNewGame,
  deleteSave,
  loadGame,
  saveGame,
} from './core/save.ts'
import type { GameSave, GeneratedMap } from './types/index.ts'

const logEl = document.querySelector<HTMLDivElement>('#log')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const canvas = document.querySelector<HTMLCanvasElement>('#map')!

let map: GeneratedMap | null = null
let save: GameSave | null = null
let time: TimeController | null = null
let selectedTileId: string | undefined

function log(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`
  logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 8000)
  console.log(message)
}

function updateStatus(): void {
  if (!time || !save) return
  const paused = time.isPaused() ? '已暂停' : '运行中'
  statusEl.textContent = `第 ${save.date} 天 · ${paused} · 速度 ×${time.getSpeed()}`
}

function renderMap(): void {
  if (!map || !save || !canvas) return
  const owners: Record<string, string> = {}
  for (const [id, tile] of Object.entries(save.tiles)) {
    owners[id] = tile.owner
  }
  drawMapPreview(canvas, map, owners, selectedTileId)
}

async function bootstrap(): Promise<void> {
  const terrainConfig = await loadTerrainConfig()
  map = generateMap(terrainConfig)

  log(`地图生成完成：${map.tiles.length} 地块，关键城 ${terrainConfig.keyTiles.length} 座`)

  const existing = await loadGame()
  if (existing) {
    save = existing
    log(`读档成功：第 ${save.date} 天`)
  } else {
    const owners = getInitialOwners(map)
    applyKeyCityOwners(terrainConfig, owners)
    const heroRes = await fetch('/config/heroes.json')
    const heroes = (await heroRes.json()) as { id: string; faction: string }[]
    const heroIdsByFaction: Record<string, string[]> = { wei: [], shu: [], wu: [] }
    for (const h of heroes) {
      if (heroIdsByFaction[h.faction]) heroIdsByFaction[h.faction].push(h.id)
    }
    save = createNewGame(owners, heroIdsByFaction)
    await saveGame(save)
    log('无存档，已创建新游戏并写入 IndexedDB')
  }

  time = new TimeController({
    onTick: (day) => {
      if (!save) return
      save.date = day
      if (day % 5 === 0) {
        log(`gameTick → 第 ${day} 天`)
      }
      updateStatus()
      renderMap()
    },
    onPauseChange: (paused) => {
      log(paused ? '游戏暂停' : '游戏继续')
      updateStatus()
    },
  })
  time.setGameDay(save.date)
  time.start()

  bindUi()
  updateStatus()
  renderMap()
  log('Sprint 0 就绪。空格暂停，点击地图选地块。')
}

function bindUi(): void {
  const pauseBtn = document.querySelector<HTMLButtonElement>('#btn-pause')!
  const saveBtn = document.querySelector<HTMLButtonElement>('#btn-save')!
  const loadBtn = document.querySelector<HTMLButtonElement>('#btn-load')!
  const newBtn = document.querySelector<HTMLButtonElement>('#btn-new')!

  pauseBtn.addEventListener('click', () => time?.togglePause())

  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed) as SpeedMultiplier
      time?.setSpeed(speed)
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      log(`速度切换为 ×${speed}`)
      updateStatus()
    })
  })
  document.querySelector<HTMLButtonElement>('[data-speed="1"]')?.classList.add('active')

  saveBtn.addEventListener('click', async () => {
    if (!save) return
    await saveGame(save)
    log(`手动存档：第 ${save.date} 天`)
  })

  loadBtn.addEventListener('click', async () => {
    const loaded = await loadGame()
    if (!loaded) {
      log('读档失败：本地无存档')
      return
    }
    save = loaded
    time?.setGameDay(save.date)
    log(`读档：第 ${save.date} 天`)
    updateStatus()
    renderMap()
  })

  newBtn.addEventListener('click', async () => {
    if (!map) return
    if (!confirm('确定新开游戏？当前进度将被覆盖。')) return
    await deleteSave()
    const terrainConfig = await loadTerrainConfig()
    const owners = getInitialOwners(map)
    applyKeyCityOwners(terrainConfig, owners)
    const heroRes = await fetch('/config/heroes.json')
    const heroes = (await heroRes.json()) as { id: string; faction: string }[]
    const heroIdsByFaction: Record<string, string[]> = { wei: [], shu: [], wu: [] }
    for (const h of heroes) {
      if (heroIdsByFaction[h.faction]) heroIdsByFaction[h.faction].push(h.id)
    }
    save = createNewGame(owners, heroIdsByFaction)
    await saveGame(save)
    time?.setGameDay(0)
    log('新游戏已开始')
    updateStatus()
    renderMap()
  })

  canvas?.addEventListener('click', (e) => {
    if (!map) return
    const tile = hitTestTile(canvas, map, e.clientX, e.clientY)
    if (!tile) return
    selectedTileId = tile.id
    const owner = save?.tiles[tile.id]?.owner ?? 'neutral'
    log(`选中：${tile.name}（${tile.type}）归属 ${owner}，邻接 ${tile.neighbors.length} 格`)
    renderMap()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault()
      time?.togglePause()
    }
  })

  window.addEventListener('beforeunload', () => {
    if (save) {
      void saveGame(save)
    }
  })
}

bootstrap().catch((err) => {
  log(`启动失败：${err instanceof Error ? err.message : String(err)}`)
  statusEl.textContent = '启动失败，见日志'
})
