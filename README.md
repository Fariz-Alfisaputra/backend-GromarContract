# Gromar Backend API

Backend Express.js + Prisma ORM + SQLite untuk toko online Gromar.

## 🚀 Quick Start

### 1. Isi Midtrans Keys di `.env`

Edit file `.env` dan masukkan keys dari [dashboard.sandbox.midtrans.com](https://dashboard.sandbox.midtrans.com):

```env
MIDTRANS_SERVER_KEY=SB-Mid-server-XXXXXXXXXXXXXXXX   ← ganti ini
MIDTRANS_CLIENT_KEY=SB-Mid-client-XXXXXXXXXXXXXXXX   ← ganti ini
```

### 2. Jalankan Backend

```bash
npm run dev
```

Server berjalan di `http://localhost:5000`

---

## 📋 Available Scripts

| Script | Keterangan |
|---|---|
| `npm run dev` | Jalankan server development (hot-reload) |
| `npm run build` | Compile TypeScript ke JavaScript |
| `npm start` | Jalankan production build |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Push schema ke database SQLite |
| `npm run db:seed` | Isi database dengan data sample |
| `npm run db:studio` | Buka Prisma Studio (GUI database) |
| `npm run db:reset` | Reset database + seed ulang |

---

## 🔗 API Endpoints

### Auth
| Method | URL | Keterangan |
|---|---|---|
| POST | `/api/auth/register` | Daftar akun baru |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Info user (butuh token) |

### Products
| Method | URL | Keterangan |
|---|---|---|
| GET | `/api/products` | Daftar produk (filter: `?category=&search=&sort=&page=&limit=`) |
| GET | `/api/products/:slug` | Detail produk |
| POST | `/api/products` | Tambah produk (Admin) |
| PUT | `/api/products/:id` | Update produk (Admin) |
| DELETE | `/api/products/:id` | Hapus produk (Admin) |

### Cart
| Method | URL | Keterangan |
|---|---|---|
| GET | `/api/cart` | Lihat keranjang |
| POST | `/api/cart` | Tambah item `{ productId, quantity }` |
| PUT | `/api/cart/:id` | Update quantity `{ quantity }` |
| DELETE | `/api/cart/:id` | Hapus item |
| DELETE | `/api/cart/clear` | Kosongkan keranjang |

### Orders
| Method | URL | Keterangan |
|---|---|---|
| POST | `/api/orders` | Buat order dari keranjang → dapat Snap Token |
| GET | `/api/orders` | Daftar order user |
| GET | `/api/orders/:id` | Detail order |
| GET | `/api/orders/all` | Semua order (Admin) |
| PATCH | `/api/orders/:id/status` | Update status (Admin) |

### Payment
| Method | URL | Keterangan |
|---|---|---|
| POST | `/api/payment/webhook` | Webhook Midtrans (auto-update status) |
| GET | `/api/payment/snap-token/:orderId` | Get Snap token |

---

## 👤 Demo Accounts (Seed)

| Role | Email | Password |
|---|---|---|
| Admin | admin@gromar.id | admin123 |
| Customer | user@gromar.id | customer123 |

---

## 🏗️ Project Structure

```
backend-gromar/
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Seed data
├── src/
│   ├── controllers/        # Route handlers
│   ├── middleware/         # Auth + Admin middleware
│   ├── routes/             # Route definitions
│   ├── services/           # Midtrans payment service
│   ├── lib/                # Prisma client singleton
│   ├── types/              # TypeScript types
│   ├── app.ts              # Express app setup
│   └── index.ts            # Server entry point
├── .env                    # Environment variables (buat dari .env.example)
├── prisma.config.ts        # Prisma 7 config
└── dev.db                  # SQLite database file (auto-created)
```
