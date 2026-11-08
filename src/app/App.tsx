// Top-level layout: full-screen map with the place panel (side panel on desktop, bottom sheet on mobile).
import { MapView } from '../features/map/MapView'
import { useUrlSync } from './useUrlSync'
import { PlacePanel } from '../features/places/PlacePanel'
import { AboutDialog } from '../features/about/AboutDialog'

export default function App() {
  useUrlSync()
  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <MapView />
      <PlacePanel />
      <AboutDialog />
    </main>
  )
}
