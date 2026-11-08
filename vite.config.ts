// Vite config: React plugin and the official Tailwind CSS v4 Vite plugin.
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { existsSync, readFileSync } from 'node:fs'

// Dev-server only: serves git-ignored local eBird data; never copied to public/ or emitted in builds.
function localEbirdPreview(): Plugin {
  return {
    name: 'local-ebird-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__local/ebird-hotspots.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        const geo = 'pipeline/sources/ebird/hotspots.geojson'
        const meta = 'pipeline/sources/ebird/meta.json'
        if (req.method !== 'GET' || !existsSync(geo) || !existsSync(meta)) {
          res.statusCode = 404
          res.end('{"error":"not found"}')
          return
        }
        try {
          const features = JSON.parse(readFileSync(geo, 'utf8')).features
          const retrievedAt = JSON.parse(readFileSync(meta, 'utf8')).retrievedAt
          res.end(JSON.stringify({ retrievedAt, features }))
        } catch {
          res.statusCode = 404
          res.end('{"error":"unreadable"}')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localEbirdPreview()],
})
