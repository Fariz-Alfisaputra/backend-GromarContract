import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

// Load dotenv for seed script
require('dotenv').config()

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'sayuran' },
      update: {},
      create: { name: 'Sayuran', slug: 'sayuran' },
    }),
    prisma.category.upsert({
      where: { slug: 'buah-buahan' },
      update: {},
      create: { name: 'Buah-buahan', slug: 'buah-buahan' },
    }),
    prisma.category.upsert({
      where: { slug: 'hasil-laut' },
      update: {},
      create: { name: 'Hasil Laut', slug: 'hasil-laut' },
    }),
    prisma.category.upsert({
      where: { slug: 'rempah-rempah' },
      update: {},
      create: { name: 'Rempah-rempah', slug: 'rempah-rempah' },
    }),
  ])

  const [sayuran, buah, laut, rempah] = categories
  console.log('✅ Categories created')

  // Create products
  await Promise.all([
    // Sayuran
    prisma.product.upsert({
      where: { slug: 'tomat-segar' },
      update: {},
      create: {
        name: 'Tomat Segar',
        slug: 'tomat-segar',
        description: 'Tomat segar langsung dari petani lokal. Kaya vitamin C dan antioksidan.',
        price: 15000,
        stock: 500,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1561136594-7f68af771d46?w=400',
        categoryId: sayuran.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'bayam-organik' },
      update: {},
      create: {
        name: 'Bayam Organik',
        slug: 'bayam-organik',
        description: 'Bayam organik tanpa pestisida. Segar dipetik pagi hari.',
        price: 8000,
        stock: 200,
        unit: 'ikat',
        imageUrl: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400',
        categoryId: sayuran.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'wortel-lokal' },
      update: {},
      create: {
        name: 'Wortel Lokal',
        slug: 'wortel-lokal',
        description: 'Wortel segar dari dataran tinggi Dieng. Manis dan renyah.',
        price: 12000,
        stock: 300,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400',
        categoryId: sayuran.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'cabai-merah' },
      update: {},
      create: {
        name: 'Cabai Merah Besar',
        slug: 'cabai-merah',
        description: 'Cabai merah besar, tingkat kepedasan medium.',
        price: 35000,
        stock: 150,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=400',
        categoryId: sayuran.id,
      },
    }),
    // Buah
    prisma.product.upsert({
      where: { slug: 'pisang-cavendish' },
      update: {},
      create: {
        name: 'Pisang Cavendish',
        slug: 'pisang-cavendish',
        description: 'Pisang Cavendish premium, manis dan bergizi.',
        price: 25000,
        stock: 400,
        unit: 'sisir',
        imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400',
        categoryId: buah.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'mangga-harum-manis' },
      update: {},
      create: {
        name: 'Mangga Harum Manis',
        slug: 'mangga-harum-manis',
        description: 'Mangga harum manis dari Probolinggo. Manis legit, daging tebal.',
        price: 28000,
        stock: 250,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400',
        categoryId: buah.id,
      },
    }),
    // Hasil Laut
    prisma.product.upsert({
      where: { slug: 'udang-segar' },
      update: {},
      create: {
        name: 'Udang Segar',
        slug: 'udang-segar',
        description: 'Udang segar dari nelayan lokal.',
        price: 75000,
        stock: 100,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=400',
        categoryId: laut.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'ikan-kembung' },
      update: {},
      create: {
        name: 'Ikan Kembung Segar',
        slug: 'ikan-kembung',
        description: 'Ikan kembung tangkapan hari ini. Kaya omega-3 dan protein.',
        price: 40000,
        stock: 80,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400',
        categoryId: laut.id,
      },
    }),
    // Rempah
    prisma.product.upsert({
      where: { slug: 'jahe-segar' },
      update: {},
      create: {
        name: 'Jahe Segar',
        slug: 'jahe-segar',
        description: 'Jahe segar pilihan, aroma kuat dan menyehatkan.',
        price: 20000,
        stock: 200,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=400',
        categoryId: rempah.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'kunyit-bubuk' },
      update: {},
      create: {
        name: 'Kunyit Segar',
        slug: 'kunyit-bubuk',
        description: 'Kunyit segar kualitas premium. Warna kuning cerah, kaya kurkumin.',
        price: 18000,
        stock: 150,
        unit: 'kg',
        imageUrl: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400',
        categoryId: rempah.id,
      },
    }),
  ])
  console.log('✅ Products created (10 produk)')

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@gromar.id' },
    update: {},
    create: {
      email: 'admin@gromar.id',
      password: hashedPassword,
      name: 'Admin Gromar',
      role: 'ADMIN',
    },
  })

  // Create sample customer
  const customerPassword = await bcrypt.hash('customer123', 10)
  await prisma.user.upsert({
    where: { email: 'user@gromar.id' },
    update: {},
    create: {
      email: 'user@gromar.id',
      password: customerPassword,
      name: 'Budi Santoso',
      role: 'CUSTOMER',
    },
  })

  // Create sample seller
  const sellerPassword = await bcrypt.hash('seller123', 10)
  await prisma.user.upsert({
    where: { email: 'seller@gromar.id' },
    update: {},
    create: {
      email: 'seller@gromar.id',
      password: sellerPassword,
      name: 'Tani Makmur (Penjual)',
      role: 'SELLER',
    },
  })

  console.log('✅ Users created')
  console.log('')
  console.log('🎉 Seed selesai!')
  console.log('   Admin   : admin@gromar.id / admin123')
  console.log('   Seller  : seller@gromar.id / seller123')
  console.log('   Customer: user@gromar.id / customer123')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
