/**
 * =============================================================
 * prisma/seed.js — DEMO MA'LUMOTLARNI YARATISH
 * -------------------------------------------------------------
 * MAS'ULIYATI: Bo'sh bazani sinab ko'rish uchun boshlang'ich
 * ma'lumot bilan to'ldirish.
 *
 * ISHLATISH:
 *     npm run seed
 *
 * NIMA YARATILADI?
 *   - 1 ta ADMIN, 2 ta SELLER, 2 ta USER
 *   - 5 ta kategoriya
 *   - 12 ta mahsulot (sellerlar orasida taqsimlangan)
 *   - 4 ta buyurtma (turli statuslarda) + ularning itemlari
 *   - bir nechta audit log yozuvi
 *
 * MUHIM: skript "idempotent" — ya'ni bir necha marta
 * ishlatsangiz ham dublikat yaratmaydi (`upsert` ishlatilgan).
 * Faqat buyurtmalar qayta yaratiladi, chunki ularda tabiiy
 * "unikal kalit" yo'q — shuning uchun avval eskilari o'chiriladi.
 * =============================================================
 */

'use strict';

const bcrypt = require('bcryptjs');
const { PrismaClient, Prisma } = require('@prisma/client');
const env = require('../src/config/env');

const prisma = new PrismaClient();

/** Konsolga bosqichlarni chiroyli chiqarish uchun kichik yordamchi */
function step(text) {
  console.log(`\x1b[36m➜\x1b[0m ${text}`);
}
function done(text) {
  console.log(`\x1b[32m✔\x1b[0m ${text}`);
}

async function main() {
  console.log('\n=== B2B Demo API — seed boshlandi ===\n');

  /* ------------------------------------------------------------
   * 1) FOYDALANUVCHILAR
   * ----------------------------------------------------------
   * Parollar bcrypt bilan hashlanadi (10 rounds) — DB'da
   * hech qachon ochiq parol saqlanmaydi.
   * ---------------------------------------------------------- */
  step('Foydalanuvchilar yaratilmoqda...');

  const adminHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10);
  const commonHash = await bcrypt.hash('Parol123!', 10);

  const usersData = [
    { email: env.SEED_ADMIN_EMAIL, name: 'Bosh Administrator', role: 'ADMIN', passwordHash: adminHash },
    { email: 'seller1@b2b.uz', name: "Alisher Savdogar", role: 'SELLER', passwordHash: commonHash },
    { email: 'seller2@b2b.uz', name: 'Dilnoza Trade', role: 'SELLER', passwordHash: commonHash },
    { email: 'user1@b2b.uz', name: 'Bekzod Xaridor', role: 'USER', passwordHash: commonHash },
    { email: 'user2@b2b.uz', name: 'Malika Mijoz', role: 'USER', passwordHash: commonHash },
  ];

  const users = {};
  for (const u of usersData) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, isActive: true },
      create: u,
    });
    users[u.email] = created;
  }

  const admin = users[env.SEED_ADMIN_EMAIL];
  const seller1 = users['seller1@b2b.uz'];
  const seller2 = users['seller2@b2b.uz'];
  const buyer1 = users['user1@b2b.uz'];
  const buyer2 = users['user2@b2b.uz'];

  done(`${usersData.length} ta foydalanuvchi tayyor`);

  /* ------------------------------------------------------------
   * 2) KATEGORIYALAR
   * ---------------------------------------------------------- */
  step('Kategoriyalar yaratilmoqda...');

  const categoryNames = [
    { name: 'Elektronika', description: "Telefon, noutbuk va boshqa elektron qurilmalar" },
    { name: 'Maishiy texnika', description: "Uy uchun kerakli texnika" },
    { name: 'Ofis jihozlari', description: "Ofis uchun mebel va kanselyariya" },
    { name: 'Qurilish mollari', description: "Ta'mirlash va qurilish uchun materiallar" },
    { name: 'Oziq-ovqat', description: "Ulgurji oziq-ovqat mahsulotlari" },
  ];

  const categories = {};
  for (const c of categoryNames) {
    // `name` maydoni sxemada @unique — shuning uchun upsert kaliti sifatida ishlatamiz
    const created = await prisma.category.upsert({
      where: { name: c.name },
      update: { description: c.description },
      create: { name: c.name, description: c.description },
    });
    categories[c.name] = created;
  }

  done(`${categoryNames.length} ta kategoriya tayyor`);

  /* ------------------------------------------------------------
   * 3) MAHSULOTLAR
   * ----------------------------------------------------------
   * Narx `Prisma.Decimal` sifatida saqlanadi — pul bilan
   * ishlaganda float ishlatish MUMKIN EMAS (yaxlitlash xatosi).
   * ---------------------------------------------------------- */
  step('Mahsulotlar yaratilmoqda...');

  const productsData = [
    { title: 'Noutbuk Lenovo ThinkPad E14', price: 8500000, stock: 12, category: 'Elektronika', seller: seller1 },
    { title: 'Smartfon Samsung Galaxy A55', price: 4200000, stock: 30, category: 'Elektronika', seller: seller1 },
    { title: 'Monitor LG 27" IPS', price: 2750000, stock: 18, category: 'Elektronika', seller: seller2 },
    { title: 'Simsiz sichqoncha Logitech M330', price: 210000, stock: 120, category: 'Elektronika', seller: seller2 },
    { title: 'Muzlatgich Artel HD-345', price: 5600000, stock: 8, category: 'Maishiy texnika', seller: seller1 },
    { title: 'Kir yuvish mashinasi Samsung 7kg', price: 4900000, stock: 6, category: 'Maishiy texnika', seller: seller2 },
    { title: 'Ofis stoli 140x70', price: 1350000, stock: 25, category: 'Ofis jihozlari', seller: seller1 },
    { title: 'Ergonomik ofis kresli', price: 1890000, stock: 15, category: 'Ofis jihozlari', seller: seller2 },
    { title: 'A4 qog\'oz, 500 varaq (quti)', price: 62000, stock: 400, category: 'Ofis jihozlari', seller: seller1 },
    { title: 'Sement M400, 50 kg', price: 55000, stock: 1000, category: 'Qurilish mollari', seller: seller2 },
    { title: 'Akkumulyatorli shurupovert Bosch', price: 1150000, stock: 22, category: 'Qurilish mollari', seller: seller1 },
    { title: 'Guruch Lazer, 25 kg qop', price: 480000, stock: 60, category: 'Oziq-ovqat', seller: seller2 },
  ];

  const products = [];
  for (const p of productsData) {
    // Product'da `@unique` maydon yo'q, shuning uchun `upsert` o'rniga
    // avval qidiramiz, topilsa yangilaymiz, topilmasa yaratamiz.
    const payload = {
      title: p.title,
      description: `${p.title} — ulgurji narxda, kafolat bilan. Demo ma'lumot.`,
      price: new Prisma.Decimal(p.price),
      stock: p.stock,
      categoryId: categories[p.category].id,
      sellerId: p.seller.id,
      isActive: true,
    };

    const existing = await prisma.product.findFirst({ where: { title: p.title } });
    const created = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: payload })
      : await prisma.product.create({ data: payload });

    products.push(created);
  }

  done(`${products.length} ta mahsulot tayyor`);

  /* ------------------------------------------------------------
   * 4) BUYURTMALAR
   * ----------------------------------------------------------
   * Avval eski demo buyurtmalarni o'chiramiz (dublikat bo'lmasin).
   * OrderItem'lar `onDelete: Cascade` orqali avtomatik o'chadi.
   * ---------------------------------------------------------- */
  step('Eski demo buyurtmalar o\'chirilmoqda...');
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});

  step('Yangi buyurtmalar yaratilmoqda...');

  /**
   * Buyurtma yaratuvchi yordamchi funksiya.
   * `items` — [{ product, quantity }] ko'rinishida.
   */
  async function createOrder({ buyer, items, status, note }) {
    const orderItems = items.map(({ product, quantity }) => ({
      productId: product.id,
      sellerId: product.sellerId,
      quantity,
      priceAtOrder: product.price, // buyurtma paytidagi narx "muzlatiladi"
    }));

    const totalPrice = orderItems.reduce(
      (sum, item) => sum.add(new Prisma.Decimal(item.priceAtOrder).mul(item.quantity)),
      new Prisma.Decimal(0)
    );

    return prisma.order.create({
      data: {
        buyerId: buyer.id,
        status,
        note,
        totalPrice,
        items: { create: orderItems },
      },
      include: { items: true },
    });
  }

  await createOrder({
    buyer: buyer1,
    status: 'PENDING',
    note: 'Iltimos, ertalab yetkazib bering',
    items: [
      { product: products[0], quantity: 2 },
      { product: products[3], quantity: 5 },
    ],
  });

  await createOrder({
    buyer: buyer1,
    status: 'CONFIRMED',
    note: 'Naqd to\'lov',
    items: [{ product: products[8], quantity: 20 }],
  });

  await createOrder({
    buyer: buyer2,
    status: 'SHIPPED',
    note: null,
    items: [
      { product: products[6], quantity: 3 },
      { product: products[7], quantity: 3 },
    ],
  });

  await createOrder({
    buyer: buyer2,
    status: 'DELIVERED',
    note: 'Yetkazib berildi, muammosiz',
    items: [{ product: products[9], quantity: 100 }],
  });

  done('4 ta buyurtma tayyor');

  /* ------------------------------------------------------------
   * 5) AUDIT LOG NAMUNALARI
   * ---------------------------------------------------------- */
  step('Audit log namunalari yozilmoqda...');

  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: 'CREATE',
        entity: 'Category',
        entityId: categories['Elektronika'].id,
        meta: { source: 'seed', note: "Boshlang'ich kategoriya" },
      },
      {
        userId: seller1.id,
        action: 'CREATE',
        entity: 'Product',
        entityId: products[0].id,
        meta: { source: 'seed', title: products[0].title },
      },
      {
        userId: buyer1.id,
        action: 'LOGIN',
        entity: 'Auth',
        entityId: buyer1.id,
        meta: { source: 'seed', ip: '127.0.0.1' },
      },
    ],
  });

  done('Audit loglar tayyor');

  /* ------------------------------------------------------------
   * 6) XULOSA
   * ---------------------------------------------------------- */
  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.log('\n--- Bazadagi yakuniy holat ---');
  console.table(counts);

  console.log(`
Kirish uchun demo hisoblar:
  ADMIN  : ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}
  SELLER : seller1@b2b.uz / Parol123!
  SELLER : seller2@b2b.uz / Parol123!
  USER   : user1@b2b.uz   / Parol123!
  USER   : user2@b2b.uz   / Parol123!

Endi serverni ishga tushiring:  npm run dev
`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('=== Seed muvaffaqiyatli yakunlandi ===\n');
  })
  .catch(async (error) => {
    console.error('\n\x1b[31m✖ Seed paytida xato:\x1b[0m', error);
    await prisma.$disconnect();
    process.exit(1);
  });
