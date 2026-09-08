import net from 'net'

let isConnectedCache: boolean | null = null
let lastCheckTime = 0
const CHECK_INTERVAL_MS = 10_000 // Re-check every 10 seconds

/**
 * Ultra-fast TCP port check for PostgreSQL (returns in ~3ms).
 * Prevents Prisma connection pool from hanging when Postgres is down.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  const now = Date.now()
  if (isConnectedCache !== null && now - lastCheckTime < CHECK_INTERVAL_MS) {
    return isConnectedCache
  }

  // Parse port and host from DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || ''
  let host = '127.0.0.1'
  let port = 5432

  try {
    const match = dbUrl.match(/@([^:/]+)(?::(\d+))?/)
    if (match) {
      host = match[1] === 'localhost' ? '127.0.0.1' : match[1]
      port = match[2] ? parseInt(match[2], 10) : 5432
    }
  } catch {
    // default to 127.0.0.1:5432
  }

  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 500 })

    socket.on('connect', () => {
      socket.destroy()
      isConnectedCache = true
      lastCheckTime = Date.now()
      resolve(true)
    })

    socket.on('error', () => {
      socket.destroy()
      isConnectedCache = false
      lastCheckTime = Date.now()
      resolve(false)
    })

    socket.on('timeout', () => {
      socket.destroy()
      isConnectedCache = false
      lastCheckTime = Date.now()
      resolve(false)
    })
  })
}
