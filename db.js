// db.js
const Database = require('better-sqlite3');
const db = new Database('orders.db');

// Таблица заказов
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    comment TEXT,
    items_json TEXT NOT NULL,
    total_price INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Добавляем колонку статуса Telegram, если её нет
try {
  db.exec("ALTER TABLE orders ADD COLUMN tg_status TEXT DEFAULT 'pending'");
} catch (e) {
  // Если колонка уже существует, просто игнорируем ошибку
}
// Добавляем колонку статуса заказа (выполнен/в обработке)
try {
  db.exec("ALTER TABLE orders ADD COLUMN order_status TEXT DEFAULT 'pending'");
} catch (e) {
  // Если колонка уже существует, игнорируем
}
// Добавляем колонку для фиксации согласия на обработку ПДн (152-ФЗ)
try {
  db.exec("ALTER TABLE orders ADD COLUMN agreement_accepted INTEGER DEFAULT 0");
} catch (e) {
  // Если колонка уже существует, игнорируем
}

// Таблица товаров
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    image_url TEXT,
    is_hit INTEGER DEFAULT 0
  )
`);

// Добавляем колонку скрытия товара, если её нет
try {
  db.exec("ALTER TABLE products ADD COLUMN is_hidden INTEGER DEFAULT 0");
} catch (e) {
  // Если колонка уже существует, игнорируем
}

// Если таблица товаров пуста, добавим первые 4 товара для примера
const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, price, description, image_url, is_hit) 
    VALUES (?, ?, ?, ?, ?)
  `);
  
  insert.run('Средний Рак 28-33 шт/кг', 3500, 'Средний Рак 1 кг, 28-33 шт/кг. (Алтай)', 'img/rak-sredniy.webp', 1);
  insert.run('Средне-крупный Рак 19-22 шт/кг', 4000, 'Средне-крупный Рак 1 кг, 19-22 шт/кг. (Алтай)', 'img/rak-sredne-krupnyy.webp', 0);
  insert.run('Отборный Рак 1 кг 7-10 шт/кг', 5000, 'Отборный Рак 1 кг, 7-10 шт/кг (Алтай)', 'img/rak-otbornyy.webp', 1);
  insert.run('Крупный Рак 14-16 шт/кг', 4500, 'Крупный Рак 1000г, 14-16 шт. (Алтайский)', 'img/rak-krupnyy.webp', 1);
  console.log('База данных заполнена начальными товарами.');
}

module.exports = db;

