import { prisma } from '../lib/prisma'
import { isDatabaseAvailable } from '../lib/db-health'
import jwt from 'jsonwebtoken'
import { JwtPayload } from '../types'

interface IntentResult {
  handled: boolean
  reply?: string
  contextData?: string
  intentName?: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function extractUserId(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gromar_super_secret_jwt_key_2024_change_this') as JwtPayload
    return decoded.id || null
  } catch {
    return null
  }
}

export async function tryResolveDatabaseIntent(
  userMessage: string,
  authHeader?: string
): Promise<IntentResult> {
  const normalized = userMessage.trim().toLowerCase()

  // Fast skip if database is offline or not reachable
  const dbUp = await isDatabaseAvailable()
  if (!dbUp) {
    return { handled: false, intentName: 'db_offline_fast_fallback' }
  }

  try {
    // ─────────────────────────────────────────────────────────────
    // 1. DAFTAR KATEGORI
    // ─────────────────────────────────────────────────────────────
    if (
      /^(ada\s+)?kategori(\s+apa(\s+saja)?)?\??$/i.test(normalized) ||
      /^(daftar|list|pilihan|tampilkan)\s+kategori/i.test(normalized) ||
      normalized === 'kategori' ||
      normalized === 'kategori apa saja'
    ) {
      const categories = await prisma.category.findMany({
        select: {
          name: true,
          slug: true,
          _count: { select: { products: true } },
        },
        orderBy: { name: 'asc' },
      })

      if (categories.length === 0) {
        return {
          handled: true,
          intentName: 'category_list_empty',
          reply: 'Saat ini belum ada kategori produk yang terdaftar di sistem GROMAR.',
        }
      }

      let reply = 'Berikut kategori komoditas yang tersedia di **GROMAR**:\n\n'
      categories.forEach((cat, idx) => {
        reply += `${idx + 1}. **${cat.name}** (${cat._count.products} produk)\n`
      })
      reply += '\nAnda dapat mencari produk berdasarkan kategori di atas melalui katalog pasar kami.'

      return { handled: true, intentName: 'category_list', reply }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. PRODUK TERMURAH & TERMAHAL
    // ─────────────────────────────────────────────────────────────
    if (/(termurah|paling murah|harga terendah|paling hemat)/i.test(normalized)) {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          name: true,
          price: true,
          unit: true,
          category: { select: { name: true } },
        },
        orderBy: { price: 'asc' },
        take: 5,
      })

      if (products.length === 0) {
        return {
          handled: true,
          intentName: 'product_cheapest_empty',
          reply: 'Belum ada produk aktif yang terdaftar di pasar.',
        }
      }

      let reply = 'Berikut 5 produk **termurah** di GROMAR saat ini:\n\n'
      products.forEach((p, idx) => {
        reply += `${idx + 1}. **${p.name}** (${p.category.name}): **${formatCurrency(p.price)}** / ${p.unit}\n`
      })

      return { handled: true, intentName: 'product_cheapest', reply }
    }

    if (/(termahal|paling mahal|harga tertinggi|paling premium)/i.test(normalized)) {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          name: true,
          price: true,
          unit: true,
          category: { select: { name: true } },
        },
        orderBy: { price: 'desc' },
        take: 5,
      })

      if (products.length === 0) {
        return {
          handled: true,
          intentName: 'product_expensive_empty',
          reply: 'Belum ada produk aktif yang terdaftar di pasar.',
        }
      }

      let reply = 'Berikut 5 produk dengan **harga tertinggi** di GROMAR:\n\n'
      products.forEach((p, idx) => {
        reply += `${idx + 1}. **${p.name}** (${p.category.name}): **${formatCurrency(p.price)}** / ${p.unit}\n`
      })

      return { handled: true, intentName: 'product_expensive', reply }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. DAFTAR / KATALOG PRODUK UMUM
    // ─────────────────────────────────────────────────────────────
    if (
      /(ada produk apa|produk apa saja|daftar produk|list produk|katalog produk|semua produk|lihat produk|produk yang tersedia|produk apa yg ada|produk ready)/i.test(
        normalized
      ) &&
      !/(cocok|rekomendasi|beda|harga|stok)/i.test(normalized)
    ) {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          name: true,
          price: true,
          unit: true,
          stock: true,
          category: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      })

      if (products.length === 0) {
        return {
          handled: true,
          intentName: 'product_list_empty',
          reply: 'Saat ini belum ada produk aktif yang tersedia di katalog GROMAR.',
        }
      }

      let reply = 'Berikut beberapa produk komoditas unggulan yang tersedia di **GROMAR**:\n\n'
      products.forEach((p, idx) => {
        reply += `${idx + 1}. **${p.name}** (${p.category.name}) — **${formatCurrency(p.price)}** / ${p.unit} (Stok: ${p.stock} ${p.unit})\n`
      })
      reply += '\nAnda dapat melihat katalog lengkap atau melakukan pemesanan di menu **Shop / Marketplace**.'

      return { handled: true, intentName: 'product_list', reply }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. PRODUK BERDASARKAN KATEGORI TERTENTU
    // ─────────────────────────────────────────────────────────────
    const catMatch = normalized.match(/(?:produk\s+kategori|kategori|produk)\s+([a-zA-Z0-9\s-]+)/i)
    if (catMatch && /(sayur|sayuran|buah|buah-buahan|hasil laut|ikan|laut|rempah|rempah-rempah)/i.test(normalized)) {
      const rawCat = catMatch[1].trim()
      const category = await prisma.category.findFirst({
        where: {
          OR: [
            { name: { contains: rawCat, mode: 'insensitive' } },
            { slug: { contains: rawCat.toLowerCase().replace(/\s+/g, '-'), mode: 'insensitive' } },
          ],
        },
        include: {
          products: {
            where: { isActive: true },
            select: { name: true, price: true, unit: true, stock: true },
            take: 8,
          },
        },
      })

      if (category) {
        if (category.products.length === 0) {
          return {
            handled: true,
            intentName: 'category_products_empty',
            reply: `Kategori **${category.name}** belum memiliki produk aktif saat ini.`,
          }
        }

        let reply = `Berikut produk dalam kategori **${category.name}**:\n\n`
        category.products.forEach((p, idx) => {
          reply += `${idx + 1}. **${p.name}** — **${formatCurrency(p.price)}** / ${p.unit} (Stok: ${p.stock} ${p.unit})\n`
        })
        return { handled: true, intentName: 'category_products', reply }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. CEK HARGA PRODUK SPESIFIK
    // ─────────────────────────────────────────────────────────────
    const priceMatch = normalized.match(/(?:berapa\s+harga|harga\s+(?:dari|produk)?|harga)\s+([a-zA-Z0-9\s]+)/i)
    if (priceMatch && !/(pesanan|kontrak|semua|katalog|terendah|tertinggi|termurah|termahal)/i.test(normalized)) {
      const keyword = priceMatch[1].replace(/[?.,!]/g, '').trim()
      if (keyword.length >= 2) {
        const product = await prisma.product.findFirst({
          where: {
            name: { contains: keyword, mode: 'insensitive' },
            isActive: true,
          },
          select: {
            name: true,
            price: true,
            unit: true,
            stock: true,
            category: { select: { name: true } },
            description: true,
          },
        })

        if (product) {
          let reply = `Harga untuk **${product.name}** adalah **${formatCurrency(product.price)}** per ${product.unit}.\n\n`
          reply += `- **Kategori**: ${product.category.name}\n`
          reply += `- **Stok Tersedia**: ${product.stock} ${product.unit}\n`
          if (product.description) {
            reply += `- **Deskripsi**: ${product.description}\n`
          }
          return { handled: true, intentName: 'product_price', reply }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. CEK STOK PRODUK SPESIFIK
    // ─────────────────────────────────────────────────────────────
    const stockMatch = normalized.match(/(?:berapa\s+stok|stok\s+(?:dari|produk)?|sisa\s+stok)\s+([a-zA-Z0-9\s]+)/i)
    if (stockMatch && !/(pesanan|kontrak|semua)/i.test(normalized)) {
      const keyword = stockMatch[1].replace(/[?.,!]/g, '').trim()
      if (keyword.length >= 2) {
        const product = await prisma.product.findFirst({
          where: {
            name: { contains: keyword, mode: 'insensitive' },
            isActive: true,
          },
          select: {
            name: true,
            stock: true,
            unit: true,
            price: true,
          },
        })

        if (product) {
          const reply = `Stok untuk **${product.name}** saat ini tersisa **${product.stock} ${product.unit}** dengan harga **${formatCurrency(product.price)}** / ${product.unit}.`
          return { handled: true, intentName: 'product_stock', reply }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 7. PESANAN USER (AUTHENTICATED)
    // ─────────────────────────────────────────────────────────────
    if (/(pesanan saya|status pesanan|orderan saya|riwayat pesanan|daftar order|cek pesanan)/i.test(normalized)) {
      const userId = extractUserId(authHeader)
      if (!userId) {
        return {
          handled: true,
          intentName: 'orders_unauthenticated',
          reply: 'Untuk melihat riwayat pesanan Anda, silakan **Login** terlebih dahulu ke akun GROMAR Anda, lalu buka menu **Orders / Dashboard**.',
        }
      }

      const orders = await prisma.order.findMany({
        where: { userId },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          orderItems: {
            select: {
              quantity: true,
              price: true,
              product: { select: { name: true, unit: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      if (orders.length === 0) {
        return {
          handled: true,
          intentName: 'orders_empty',
          reply: 'Anda belum memiliki riwayat pesanan di GROMAR. Jelajahi produk kami di halaman **Shop** untuk mulai berbelanja!',
        }
      }

      let reply = 'Berikut riwayat pesanan terakhir Anda di **GROMAR**:\n\n'
      orders.forEach((o, idx) => {
        const dateStr = new Date(o.createdAt).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
        const itemsSummary = o.orderItems.map((i) => `${i.product.name} (${i.quantity} ${i.product.unit})`).join(', ')
        reply += `${idx + 1}. **Order #${o.id.slice(-6).toUpperCase()}** (${dateStr})\n`
        reply += `   - **Status**: ${o.status}\n`
        reply += `   - **Item**: ${itemsSummary || 'Tidak ada item'}\n`
        reply += `   - **Total**: ${formatCurrency(o.totalAmount)}\n\n`
      })

      return { handled: true, intentName: 'orders_list', reply }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. KONTRAK USER (AUTHENTICATED)
    // ─────────────────────────────────────────────────────────────
    if (/(kontrak saya|status kontrak|pengajuan kontrak|riwayat kontrak)/i.test(normalized)) {
      const userId = extractUserId(authHeader)
      if (!userId) {
        return {
          handled: true,
          intentName: 'contracts_unauthenticated',
          reply: 'Untuk mengecek status pengajuan kontrak B2B, silakan **Login** ke akun Anda dan buka tab **Contract** di dashboard.',
        }
      }

      const contracts = await prisma.contractRequest.findMany({
        where: { userId },
        select: {
          id: true,
          sector: true,
          productName: true,
          minVolume: true,
          price: true,
          region: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      if (contracts.length === 0) {
        return {
          handled: true,
          intentName: 'contracts_empty',
          reply: 'Anda belum memiliki pengajuan kontrak B2B. Anda dapat mengajukan permintaan pasokan kontrak melalui menu **B2B Contract**.',
        }
      }

      let reply = 'Berikut pengajuan kontrak B2B Anda di **GROMAR**:\n\n'
      contracts.forEach((c, idx) => {
        reply += `${idx + 1}. **${c.productName}** (${c.sector.toUpperCase()} - ${c.region})\n`
        reply += `   - **Volume Minimum**: ${c.minVolume}\n`
        reply += `   - **Target Harga**: ${c.price}\n`
        reply += `   - **Status**: **${c.status}**\n\n`
      })

      return { handled: true, intentName: 'contracts_list', reply }
    }

    // ─────────────────────────────────────────────────────────────
    // 9. HYBRID INTENT (Rekomendasi, Budget, Perbandingan)
    // Fetch live product data as context for Gemini
    // ─────────────────────────────────────────────────────────────
    if (
      /(cocok|rekomendasi|rekomendasikan|beda|perbedaan|budget|anggaran|modal|punya uang|sebaiknya beli)/i.test(
        normalized
      )
    ) {
      const sampleProducts = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          name: true,
          price: true,
          unit: true,
          stock: true,
          description: true,
          category: { select: { name: true } },
        },
        take: 15,
      })

      if (sampleProducts.length > 0) {
        const productContext = sampleProducts
          .map(
            (p) =>
              `- ${p.name} [Kategori: ${p.category.name}]: Rp${p.price}/${p.unit} (Stok: ${p.stock} ${p.unit}) - ${p.description || ''}`
          )
          .join('\n')

        return {
          handled: false,
          intentName: 'hybrid_retrieval',
          contextData: `\n\n[DATA PRODUK AKTIF DI GROMAR SAAT INI]:\n${productContext}\n\nGunakan data produk di atas jika relevan untuk menjawab pertanyaan pengguna dengan akurat dan spesifik.`,
        }
      }
    }

    // No direct database intent recognized -> Proceed to Gemini
    return { handled: false, intentName: 'general_ai' }
  } catch (error) {
    console.error('[DatabaseIntentService] Error querying database:', error)
    // Graceful fallback: return handled: false so Gemini can handle the request
    return { handled: false, intentName: 'db_error_fallback' }
  }
}
