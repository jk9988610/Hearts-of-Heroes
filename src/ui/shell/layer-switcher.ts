import { DEFAULT_MAP_LAYER, MAP_LAYERS, type MapLayerId } from '../../core/map-layers/types.ts'

export function bindLayerSwitcher(
  container: HTMLElement,
  onChange: (layer: MapLayerId) => void,
): { getLayer: () => MapLayerId } {
  let current: MapLayerId = DEFAULT_MAP_LAYER

  container.innerHTML = ''
  for (const layer of MAP_LAYERS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.layer = layer.id
    btn.textContent = layer.label
    btn.classList.toggle('active', layer.id === current)
    btn.addEventListener('click', () => {
      current = layer.id
      container.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', b === btn)
      })
      onChange(current)
    })
    container.appendChild(btn)
  }

  return { getLayer: () => current }
}
