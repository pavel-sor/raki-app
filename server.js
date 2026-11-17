// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const multer = require('multer');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const db = require('./db');

const app = express();
const PORT = 3000;

// ================= БЕЗОПАСНОСТЬ И ЛИМИТЫ =================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://api-maps.yandex.ru", "https://mc.yandex.ru"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://api-maps.yandex.ru", "https://static.maps.2gis.com", "https://mc.yandex.ru"],
      connectSrc: ["'self'", "https://api.telegram.org", "https://api-maps.yandex.ru", "https://mc.yandex.ru"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'self'", "https://yandex.ru", "https://mc.yandex.ru"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hidePoweredBy: true
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 100 : 10000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Слишком много запросов с вашего IP, попробуйте позже.'
});
app.use(globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 5 : 100,
  message: 'Слишком много попыток входа. Попробуйте через час.'
});
app.use('/api/login', loginLimiter);

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
// Настройка шаблонизатора EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ================= НАСТРОЙКА СЕССИЙ =================
app.use(session({
  store: new SqliteStore({
    client: db, // Передаем вашу базу данных из db.js
    expired: {
      clear: true,
      intervalMs: 900000 // Очищать старые сессии каждые 15 минут
    }
  }),
  secret: process.env.SESSION_SECRET || 'raki-super-secret-key-152-fz',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,     // 👈 ЛОКАЛЬНО СТАВИМ false (без HTTPS)
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
  }
}));

let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const resetTokens = {};

const transporter = nodemailer.createTransport({
  host: 'smtp.yandex.ru',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.EMAIL_PASS
  }
});

// ================= ПРОВЕРКА АВТОРИЗАЦИИ =================
function checkAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Доступ запрещен. Авторизуйтесь.' });
  }
}

// ================= МАРШРУТЫ АВТОРИЗАЦИИ =================
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Ошибка выхода' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ auth: true });
  } else {
    res.status(401).json({ auth: false });
  }
});

// ================= ВОССТАНОВЛЕНИЕ ПАРОЛЯ =================
app.post('/api/forgot-password', async (req, res) => {
  try {
    const token = crypto.randomBytes(20).toString('hex');
    resetTokens[token] = Date.now() + 3600000;

    const resetLink = `https://123raki.ru/reset-password.html?token=${token}`;

    await transporter.sendMail({
      from: `"Раковарня" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: 'Восстановление пароля в админке',
      html: `
        <h2>Восстановление пароля</h2>
        <p>Вы запросили сброс пароля для админ-панели сайта «123 Раковая».</p>
        <p>Для установки нового пароля перейдите по ссылке:</p>
        <a href="${resetLink}" style="display:inline-block; padding: 10px 20px; background: #d84315; color: #fff; text-decoration: none; border-radius: 5px;">Сбросить пароль</a>
        <p>Ссылка действительна в течение 1 часа.</p>
      `
    });

    res.json({ success: true, message: 'Письмо отправлено' });
  } catch (err) {
    console.error('Ошибка отправки письма:', err);
    res.status(500).json({ error: 'Не удалось отправить письмо. Проверьте настройки почты.' });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { token, newPassword } = req.body;

  if (!resetTokens[token]) {
    return res.status(400).json({ error: 'Неверный или истекший токен' });
  }

  if (Date.now() > resetTokens[token]) {
    delete resetTokens[token];
    return res.status(400).json({ error: 'Срок действия токена истек' });
  }

  if (!newPassword || newPassword.length < 5) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 5 символов' });
  }

  ADMIN_PASSWORD = newPassword;
  delete resetTokens[token];

  res.json({ success: true, message: 'Пароль успешно изменен' });
});

// ================= ЗАКАЗЫ =================
app.post('/api/orders', async (req, res) => {
  const { name, phone, address, comment, items, agreement } = req.body;

  if (!name || !phone || !items || items.length === 0) {
    return res.status(400).json({ error: 'Заполните имя, телефон и добавьте товары' });
  }

  if (!agreement) {
    return res.status(400).json({ error: 'Необходимо согласие на обработку персональных данных' });
  }

  const deliveryCost = 450;
  const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const total = itemsTotal + deliveryCost;

  const insert = db.prepare(`
    INSERT INTO orders (customer_name, phone, address, comment, items_json, total_price, agreement_accepted)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = insert.run(name, phone, address, comment, JSON.stringify(items), total, 1);

  let tgStatus = 'pending';
  try {
    let msg = `🦀 *НОВЫЙ ЗАКАЗ*\n\n`;
    msg += `👤 *Имя:* ${name}\n`;
    msg += `📞 *Телефон:* ${phone}\n`;
    if (address) msg += `📍 *Адрес:* ${address}\n`;
    if (comment) msg += `💬 *Комментарий:* ${comment}\n`;
    msg += `\n📦 *Состав заказа:*\n`;

    items.forEach(item => {
      msg += `• ${item.name} × ${item.qty} = ${item.price * item.qty} ₽\n`;
    });
    msg += `\n🛵 *Доставка:* ${deliveryCost} ₽`;
    msg += `\n💰 *ИТОГО: ${total} ₽*`;
    msg += `\n\n📌 *Статус:* ⏳ В обработке`;

    if (process.env.TG_TOKEN && process.env.TG_CHAT_ID) {
      const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TG_CHAT_ID,
          text: msg,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Отметить как выполненный", callback_data: `complete_${result.lastInsertRowid}` }]
            ]
          }
        })
      });

      const tgData = await tgRes.json();
      if (tgData.ok) {
        tgStatus = 'success';
      } else {
        tgStatus = 'error: ' + (tgData.description || 'API Error');
      }
    } else {
      tgStatus = 'error: Токены не заданы в .env';
    }
  } catch (err) {
    console.error('Ошибка отправки в Telegram:', err.message);
    tgStatus = 'error: ' + err.message;
  }

  db.prepare('UPDATE orders SET tg_status = ? WHERE id = ?').run(tgStatus, result.lastInsertRowid);
  res.json({ success: true, orderId: result.lastInsertRowid, tg_status: tgStatus });
});

app.get('/product.html', (req, res) => {
  const productId = parseInt(req.query.id);
  if (!productId) return res.status(404).send('Товар не найден');

  // 👇 Добавляем проверку is_hidden = 0
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_hidden = 0').get(productId);

  if (!product) return res.status(404).send('Товар не найден или скрыт из продажи');

  res.render('product', { product });
});

app.get('/api/admin/orders', checkAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(orders);
});

app.put('/api/admin/orders/:id/status', checkAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const update = db.prepare('UPDATE orders SET order_status = ? WHERE id = ?');
  const result = update.run(status, id);

  if (result.changes === 0) return res.status(404).json({ error: 'Заказ не найден' });
  res.json({ success: true });
});

app.delete('/api/admin/orders/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const del = db.prepare('DELETE FROM orders WHERE id = ?');
  const result = del.run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Заказ не найден' });
  res.json({ success: true });
});

app.get('/api/admin/stats', checkAuth, (req, res) => {
  const { startDate, endDate, onlyCompleted } = req.query;

  let whereClause = ` WHERE 1=1`;
  let params = [];

  if (startDate && endDate) {
    whereClause += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  }

  if (onlyCompleted === 'true') {
    whereClause += ` AND order_status = 'completed'`;
  }

  let query = `
    SELECT 
      COUNT(*) as total_orders, 
      COALESCE(SUM(total_price), 0) as total_revenue,
      COALESCE(AVG(total_price), 0) as avg_check
    FROM orders
  ` + whereClause;

  const stats = db.prepare(query).get(...params);

  let dailyQuery = `
    SELECT 
      DATE(created_at) as date, 
      COUNT(*) as count, 
      SUM(total_price) as revenue
    FROM orders
  ` + whereClause + ` GROUP BY DATE(created_at) ORDER BY date ASC`;

  const daily = db.prepare(dailyQuery).all(...params);

  res.json({ stats, daily });
});

// ================= ТОВАРЫ =================
app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE is_hidden = 0').all(); // 👈 ИЗМЕНЕНО
  res.json(products);
});

app.get('/api/admin/products', checkAuth, (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();
  res.json(products);
});

app.post('/api/products', checkAuth, (req, res) => {
  const { name, price, description, image_url, is_hit, is_hidden } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Название и цена обязательны' });

  const insert = db.prepare(`INSERT INTO products (name, price, description, image_url, is_hit, is_hidden) VALUES (?, ?, ?, ?, ?, ?)`);
  const img = image_url || 'img/logo.webp';
  const hit = is_hit ? 1 : 0;
  const hidden = is_hidden ? 1 : 0;

  const result = insert.run(name, price, description, img, hit, hidden);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/products/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const { name, price, description, image_url, is_hit, is_hidden } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Название и цена обязательны' });

  const update = db.prepare(`UPDATE products SET name = ?, price = ?, description = ?, image_url = ?, is_hit = ?, is_hidden = ? WHERE id = ?`);
  const result = update.run(name, price, description, image_url, is_hit ? 1 : 0, is_hidden ? 1 : 0, id);

  if (result.changes === 0) return res.status(404).json({ error: 'Товар не найден' });
  res.json({ success: true });
});

app.delete('/api/products/:id', checkAuth, (req, res) => {
  const { id } = req.params;
  const del = db.prepare('DELETE FROM products WHERE id = ?');
  const result = del.run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Товар не найден' });
  res.json({ success: true });
});

// ================= ЗАГРУЗКА КАРТИНОК =================
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только изображения!'));
    }
  }
});

app.post('/api/upload', checkAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });

  try {
    const filename = `product-${Date.now()}.webp`;
    const filepath = path.join(__dirname, 'img', filename);
    await sharp(req.file.buffer).webp({ quality: 80 }).toFile(filepath);
    res.json({ success: true, image_url: `img/${filename}` });
  } catch (err) {
    console.error('Ошибка конвертации:', err);
    res.status(500).json({ error: 'Ошибка при обработке изображения' });
  }
});

// ================= ОБРАБОТКА КНОПОК TELEGRAM (Long Polling) =================
let lastUpdateId = 0;

async function pollTelegramUpdates() {
  if (!process.env.TG_TOKEN) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
    const data = await res.json();

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;

        if (update.callback_query) {
          const callbackData = update.callback_query.data;
          const callbackId = update.callback_query.id;

          if (callbackData.startsWith('complete_')) {
            const orderId = callbackData.split('_')[1];

            db.prepare("UPDATE orders SET order_status = 'completed' WHERE id = ?").run(orderId);

            await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackId,
                text: `Заказ #${orderId} выполнен!`,
                show_alert: false
              })
            });

            const originalText = update.callback_query.message.text;
            const newText = originalText.replace('⏳ В обработке', '✅ *ВЫПОЛНЕН*');

            await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/editMessageText`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: update.callback_query.message.chat.id,
                message_id: update.callback_query.message.message_id,
                text: newText,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] }
              })
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Ошибка Telegram Polling:', err.message);
  }

  setTimeout(pollTelegramUpdates, 2000);
}

pollTelegramUpdates();

// Отдаем страницу меню с товарами из базы (SSR)
app.get('/menu.html', (req, res) => {
  try {
    // Получаем все товары из базы данных
    const products = db.prepare('SELECT * FROM products WHERE is_hidden = 0').all();
    // Рендерим шаблон, передавая ему массив товаров
    res.render('menu', { products });
  } catch (err) {
    console.error('Ошибка SSR:', err);
    res.status(500).send('Ошибка сервера');
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
