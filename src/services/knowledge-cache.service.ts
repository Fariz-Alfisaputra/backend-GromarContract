import { prisma } from '../lib/prisma'
import { isDatabaseAvailable } from '../lib/db-health'

// ─────────────────────────────────────────────────────────────
// KNOWLEDGE CACHE SERVICE
// Caches database stats + platform workflows + product catalog
// Has instant static fallback when database is offline.
// ─────────────────────────────────────────────────────────────

interface KnowledgeCache {
  data: string
  lastUpdated: number
}

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000

let cache: KnowledgeCache | null = null

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Built-in static catalog & platform knowledge.
 * Used instantly when database is offline or starting up.
 */
function getStaticPlatformKnowledge(): string {
  return `
[KATALOG PRODUK RESMI GROMAR]
Berikut katalog produk komoditas unggulan yang tersedia di sistem GROMAR:

1. Kategori: Sayuran
  • Tomat Segar: Rp 15.000 / kg | Stok: 500 kg | Tomat segar langsung dari petani lokal. Kaya vitamin C dan antioksidan.
  • Bayam Organik: Rp 8.000 / ikat | Stok: 200 ikat | Bayam organik tanpa pestisida. Segar dipetik pagi hari.
  • Wortel Lokal: Rp 12.000 / kg | Stok: 300 kg | Wortel segar dari dataran tinggi Dieng. Manis dan renyah.
  • Cabai Merah Besar: Rp 35.000 / kg | Stok: 150 kg | Cabai merah besar, tingkat kepedasan medium.

2. Kategori: Buah-buahan
  • Pisang Cavendish: Rp 25.000 / sisir | Stok: 400 sisir | Pisang Cavendish premium, manis dan bergizi.
  • Mangga Harum Manis: Rp 28.000 / kg | Stok: 250 kg | Mangga harum manis dari Probolinggo. Manis legit, daging tebal.

3. Kategori: Hasil Laut (Produk Laut)
  • Udang Segar: Rp 75.000 / kg | Stok: 100 kg | Udang segar dari nelayan lokal, kualitas ekspor.
  • Ikan Kembung Segar: Rp 40.000 / kg | Stok: 80 kg | Ikan kembung tangkapan hari ini. Kaya omega-3 dan protein tinggi.

4. Kategori: Rempah-rempah
  • Jahe Segar: Rp 20.000 / kg | Stok: 200 kg | Jahe segar pilihan, aroma kuat dan menyehatkan tubuh.
  • Kunyit Segar: Rp 18.000 / kg | Stok: 150 kg | Kunyit segar kualitas premium. Warna kuning cerah, kaya kurkumin.

[INFORMASI PLATFORM & CARA KERJA GROMAR]
Tentang GROMAR:
GROMAR (Grocery Marketplace) adalah platform marketplace digital B2C dan B2B untuk komoditas pertanian dan kelautan Indonesia. Platform ini menghubungkan petani, nelayan, dan produsen langsung dengan pembeli individu maupun bisnis.

Fitur Utama:
1. **Marketplace / Shop**: Katalog produk komoditas (sayuran, buah, hasil laut, rempah). Pengguna bisa browse, search, dan beli langsung.
2. **Keranjang (Cart)**: Tambah produk ke keranjang, atur jumlah, lanjut ke checkout.
3. **Checkout & Pembayaran**: Pembayaran via Midtrans (transfer bank BCA/BNI/BRI/Mandiri, e-wallet GoPay/ShopeePay/DANA, QRIS, kartu kredit). Status otomatis update setelah bayar.
4. **Pesanan (Orders)**: Pantau status pesanan: PENDING → PAID → PROCESSING → SHIPPED → DELIVERED.
5. **Kontrak B2B**: Pengajuan kontrak pasokan B2B. Sektor: Agro (pertanian) atau Marine (kelautan). Isi formulir: nama produk, volume minimum, target harga, region. Status: PENDING → APPROVED/REJECTED.
6. **Dashboard Admin**: Kelola produk, kategori, pesanan, dan kontrak. Hanya role ADMIN.
7. **Profil Pengguna**: Edit profil, lihat riwayat pesanan.

Alur Pemesanan (Order Flow):
1. Buka halaman Shop / Marketplace.
2. Pilih produk yang diinginkan, klik "Tambah ke Keranjang".
3. Buka Keranjang belanja, sesuaikan jumlah barang.
4. Klik "Checkout" untuk membuat pesanan.
5. Selesaikan pembayaran melalui Midtrans (Bank Transfer, QRIS, GoPay, dll).
6. Pesanan akan otomatis diproses dan dikirimkan oleh mitra petani/nelayan GROMAR.

Alur Pengajuan Kontrak B2B:
1. Buka menu Kontrak B2B (tab Contract).
2. Isi formulir kebutuhan: pilih sektor (Agro / Marine), sebutkan nama komoditas, volume pasokan rutin yang dibutuhkan, target harga, dan wilayah pengiriman.
3. Tim GROMAR akan meninjau dan menghubungkan langsung dengan kelompok tani atau nelayan penyuplai.
`.trim()
}

/**
 * Build live snapshot from database if connected.
 */
async function buildLiveKnowledgeSnapshot(): Promise<string> {
  const sections: string[] = []

  // 1. STATISTIK
  try {
    const [
      totalProducts,
      activeProducts,
      totalCategories,
      totalUsers,
      totalOrders,
      totalContracts,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.category.count(),
      prisma.user.count(),
      prisma.order.count(),
      prisma.contractRequest.count(),
    ])

    sections.push(
`[STATISTIK PLATFORM GROMAR — Data Real-Time]
- Total Produk: ${totalProducts} (${activeProducts} aktif)
- Total Kategori: ${totalCategories}
- Total Pengguna Terdaftar: ${totalUsers}
- Total Pesanan: ${totalOrders}
- Total Kontrak B2B: ${totalContracts}`
    )
  } catch (err) {
    console.warn('[KnowledgeCache] Failed getting stats:', err)
  }

  // 2. KATEGORI & PRODUK AKTIF
  try {
    const categories = await prisma.category.findMany({
      include: {
        products: {
          where: { isActive: true },
          select: { name: true, price: true, unit: true, stock: true, description: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    if (categories.length > 0) {
      let catalogText = '[KATALOG PRODUK AKTIF REAL-TIME]\n'
      for (const cat of categories) {
        catalogText += `\nKategori: ${cat.name} (${cat.products.length} produk):\n`
        for (const p of cat.products) {
          catalogText += `  • ${p.name}: ${formatCurrency(p.price)} / ${p.unit} | Stok: ${p.stock} ${p.unit} | ${p.description || ''}\n`
        }
      }
      sections.push(catalogText.trim())
    }
  } catch (err) {
    console.warn('[KnowledgeCache] Failed getting live products:', err)
  }

  // Add general platform knowledge
  sections.push(getStaticPlatformKnowledge())

  return sections.join('\n\n')
}

/**
 * Get the cached knowledge context.
 * Returns instant static data if database is down, or cached live data.
 */
export async function getKnowledgeContext(): Promise<string> {
  const now = Date.now()

  // Return fresh cache if valid
  if (cache && now - cache.lastUpdated < CACHE_TTL) {
    return cache.data
  }

  const dbOnline = await isDatabaseAvailable()
  if (!dbOnline) {
    console.log('[KnowledgeCache] Database offline. Using instant built-in platform knowledge.')
    const staticData = getStaticPlatformKnowledge()
    cache = { data: staticData, lastUpdated: now }
    return staticData
  }

  try {
    console.log('[KnowledgeCache] Database online. Rebuilding live knowledge cache...')
    const data = await buildLiveKnowledgeSnapshot()
    cache = { data, lastUpdated: now }
    console.log(`[KnowledgeCache] Live cache ready (${data.length} chars)`)
    return data
  } catch (error) {
    console.error('[KnowledgeCache] Error building live cache:', error)
    return cache?.data || getStaticPlatformKnowledge()
  }
}

/**
 * Force-refresh the cache.
 */
export function invalidateKnowledgeCache(): void {
  cache = null
}
