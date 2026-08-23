import 'dotenv/config'
import app from './app'

const PORT = process.env.PORT || 5000

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════╗
  ║    🌿 GROMAR Backend API Server      ║
  ║    Running on http://localhost:${PORT} ║
  ╚══════════════════════════════════════╝
  `)
    console.log(`  📦 Environment : ${process.env.NODE_ENV || 'development'}`)
    console.log(`  🔗 API URL     : http://localhost:${PORT}/api`)
    console.log(`  ❤️  Health     : http://localhost:${PORT}/api/health`)
  })
}

export default app
