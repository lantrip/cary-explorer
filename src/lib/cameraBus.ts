// Tiny pub/sub so the OpenLayers map can report its camera (on moveend) without the URL layer importing the map.
import type { UrlCamera } from './urlState'

type Listener = (camera: UrlCamera) => void
const listeners = new Set<Listener>()

export function reportCamera(camera: UrlCamera) {
  listeners.forEach((l) => l(camera))
}

export function onCameraChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
