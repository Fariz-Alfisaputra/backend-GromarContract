import swaggerJsdoc from 'swagger-jsdoc'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '🌿 Gromar E-Commerce API',
      version: '1.0.0',
      description: `
## Gromar Contract — API Dokumentasi

Backend REST API untuk platform toko online **Gromar**, menghubungkan petani, nelayan, dan pembeli melalui transaksi yang transparan.

### Fitur Utama
- 🔐 **Authentication** — JWT-based Register & Login
- 🛒 **Cart** — Keranjang belanja realtime
- 📦 **Products & Categories** — Katalog produk pertanian & hasil laut
- 💳 **Orders & Payment** — Checkout terintegrasi dengan **Midtrans Snap**
- 🔔 **Webhook** — Update status pembayaran otomatis

### Cara Menggunakan Auth
1. Login via \`POST /api/auth/login\`
2. Salin \`token\` dari response
3. Klik tombol **Authorize 🔓** di atas
4. Masukkan: \`Bearer <token>\`
      `,
      contact: {
        name: 'Gromar Dev Team',
        email: 'dev@gromar.id',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: '🖥️ Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Masukkan JWT token. Contoh: **Bearer eyJhbGciOi...**',
        },
      },
      schemas: {
        // ── User ────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx1234abcd' },
            name: { type: 'string', example: 'Budi Santoso' },
            email: { type: 'string', format: 'email', example: 'budi@gmail.com' },
            role: { type: 'string', enum: ['CUSTOMER', 'ADMIN', 'SELLER'], example: 'CUSTOMER' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
              },
            },
          },
        },
        // ── Category ────────────────────────────
        Category: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clx5678efgh' },
            name: { type: 'string', example: 'Sayuran' },
            slug: { type: 'string', example: 'sayuran' },
            _count: {
              type: 'object',
              properties: {
                products: { type: 'integer', example: 4 },
              },
            },
          },
        },
        // ── Product ─────────────────────────────
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clxprod123' },
            name: { type: 'string', example: 'Tomat Segar' },
            slug: { type: 'string', example: 'tomat-segar' },
            description: { type: 'string', example: 'Tomat segar langsung dari petani lokal.' },
            price: { type: 'number', format: 'float', example: 15000 },
            stock: { type: 'integer', example: 500 },
            unit: { type: 'string', example: 'kg' },
            imageUrl: { type: 'string', nullable: true, example: 'https://images.unsplash.com/photo-xxx' },
            isActive: { type: 'boolean', example: true },
            categoryId: { type: 'string', example: 'clx5678efgh' },
            category: { $ref: '#/components/schemas/Category' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProductMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 10 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 12 },
            totalPages: { type: 'integer', example: 1 },
          },
        },
        // ── Cart ────────────────────────────────
        CartItem: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clxcart789' },
            quantity: { type: 'integer', example: 2 },
            product: { $ref: '#/components/schemas/Product' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CartResponse: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/CartItem' },
            },
            total: { type: 'number', example: 30000 },
            count: { type: 'integer', example: 1 },
          },
        },
        // ── Order ───────────────────────────────
        OrderItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            quantity: { type: 'integer', example: 2 },
            price: { type: 'number', example: 15000 },
            product: { $ref: '#/components/schemas/Product' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clxorder321' },
            status: {
              type: 'string',
              enum: ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
              example: 'PENDING',
            },
            totalAmount: { type: 'number', example: 75000 },
            snapToken: { type: 'string', nullable: true, example: 'a1b2c3d4-e5f6-...' },
            paymentUrl: { type: 'string', nullable: true, example: 'https://app.sandbox.midtrans.com/snap/...' },
            paymentId: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true, example: 'Kirim pagi hari' },
            orderItems: {
              type: 'array',
              items: { $ref: '#/components/schemas/OrderItem' },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Common ──────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operasi berhasil' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Terjadi kesalahan' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            errors: {
              type: 'object',
              example: { email: ['Format email tidak valid'], password: ['Password minimal 6 karakter'] },
            },
          },
        },
        ContractRequest: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clxcontract123' },
            sector: { type: 'string', enum: ['agro', 'marine'], example: 'agro' },
            productName: { type: 'string', example: 'Premium White Rice' },
            minVolume: { type: 'string', example: '5 tons' },
            price: { type: 'string', example: 'Rp 11,500' },
            region: { type: 'string', example: 'Karawang, West Java' },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'], example: 'PENDING' },
            userId: { type: 'string', example: 'clxuser456' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: '🏥 Server status check' },
      { name: 'Auth', description: '🔐 Register, Login, dan info user' },
      { name: 'Categories', description: '📂 Kategori produk' },
      { name: 'Products', description: '📦 CRUD produk (Admin) & browse (Public)' },
      { name: 'Cart', description: '🛒 Keranjang belanja (butuh login)' },
      { name: 'Orders', description: '📋 Buat & lihat pesanan (butuh login)' },
      { name: 'Payment', description: '💳 Midtrans payment gateway & webhook' },
      { name: 'B2B Contracts', description: '📄 Pengajuan kontrak berjangka B2B / Smart Contract (butuh login)' },
    ],
  },
  apis: ['./src/docs/*.yaml'],
}

export const swaggerSpec = swaggerJsdoc(options)
