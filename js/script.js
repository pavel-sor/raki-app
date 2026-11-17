/* ============ ИНИЦИАЛИЗАЦИЯ ТОВАРОВ ============ */
let ALL_PRODUCTS = [];

async function fetchAllProducts() {
  try {
    const res = await fetch('/api/products');
    ALL_PRODUCTS = await res.json();
    updateCartUI();
  } catch (err) {
    console.error('Ошибка загрузки товаров для корзины:', err);
  }
}

// Эта функция нужна ТОЛЬКО для главной страницы (index.html)
async function loadProducts() {
  const grid = document.getElementById('products');
  if (!grid) return;

  // Проверяем, что мы на главной, а не на menu.html (где уже работает SSR)
  const isMenuPage = window.location.pathname.includes('menu.html');
  if (isMenuPage) return;

  // Используем уже загруженные товары, если они есть
  if (ALL_PRODUCTS.length === 0) {
    await fetchAllProducts();
  }

  // Фильтруем только хиты продаж (is_hit === 1)
  const productsToRender = ALL_PRODUCTS.filter(p => p.is_hit === 1);

  grid.innerHTML = '';

  if (productsToRender.length === 0) {
    grid.innerHTML = '<p style="text-align:center; width:100%;">Товаров пока нет.</p>';
    return;
  }

  productsToRender.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';

    card.onclick = (e) => {
      if (e.target.closest('.add-btn')) return;
      window.location.href = `product.html?id=${p.id}`;
    };

    card.innerHTML = `
      <div class="product-main">
        <div class="product-img">
          <img src="${p.image_url || 'img/logo.webp'}" alt="${p.name}" width="300" height="300" style="object-fit: cover;" onerror="this.src='img/logo.webp'; this.style.objectFit='contain';">
        </div>
        <div class="product-info">
          <div>
            <h3>${p.name}</h3>
            <div class="desc">${p.description || ''}</div>
          </div>
          <div class="price">${p.price} ₽</div>
        </div>
      </div>
      <div class="product-bottom">
        <button class="add-btn" onclick="addToCart(${p.id})">В КОРЗИНУ</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  fetchAllProducts();
  loadProducts(); // 👈 Добавляем вызов для главной страницы
});

/* ============ КОРЗИНА ============ */
let cart = JSON.parse(localStorage.getItem('raki_cart')) || {};

function saveCartToStorage() {
  localStorage.setItem('raki_cart', JSON.stringify(cart));
}

function addToCart(id, event) {
  if (event) event.stopPropagation();
  cart[id] = (cart[id] || 0) + 1;
  saveCartToStorage();
  updateCartUI();

  if (ALL_PRODUCTS.length === 0) {
    fetch('/api/products').then(r => r.json()).then(data => {
      ALL_PRODUCTS = data;
      updateCartUI();
    });
  }

  showToast('Добавлено в корзину 🛒');
}

function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id] += delta;
  if (cart[id] <= 0) delete cart[id];
  saveCartToStorage();
  updateCartUI();
}

const DELIVERY_COST = 450;

function updateCartUI() {
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const badge = document.getElementById('cart-count');
  if (badge) badge.textContent = count;

  const itemsEl = document.getElementById('cartItems');
  const totalEl = document.getElementById('total');

  if (!itemsEl || !totalEl) return;

  if (count === 0) {
    itemsEl.innerHTML = '<div class="empty">Корзина пуста 🦀</div>';
    totalEl.textContent = 'Итого: 0 ₽';
    return;
  }

  let html = '';
  let itemsTotal = 0;

  for (const id in cart) {
    const p = ALL_PRODUCTS.find(x => x.id == id);
    const qty = cart[id];
    if (!p) continue;

    itemsTotal += p.price * qty;
    html += `
      <div class="cart-item">
        <div>
          <div class="title">${p.name}</div>
          <div class="desc">${p.price} ₽ × ${qty}</div>
        </div>
        <div class="qty">
          <button onclick="changeQty(${id}, -1)">−</button>
          <span>${qty}</span>
          <button onclick="changeQty(${id}, 1)">+</button>
        </div>
      </div>
    `;
  }

  html += `
    <div class="cart-item" style="border-top: 2px solid #eee; margin-top: 10px; padding-top: 15px; pointer-events: none;">
      <div class="title" style="color: #555;">Доставка</div>
      <div class="price" style="color: var(--color-text-main); font-size: 15px;">${DELIVERY_COST} ₽</div>
    </div>
  `;

  const finalTotal = itemsTotal + DELIVERY_COST;

  itemsEl.innerHTML = html;
  totalEl.textContent = `Итого: ${finalTotal} ₽`;
}

function openCart() {
  const modal = document.getElementById('cartModal');
  if (!modal) return;
  updateCartUI();
  modal.classList.add('open');
}

function closeCart() {
  const modal = document.getElementById('cartModal');
  if (modal) modal.classList.remove('open');
}

// 👇 ИСПРАВЛЕННАЯ ФУНКЦИЯ ОТПРАВКИ 👇
async function sendOrder(e) {
  e.preventDefault();

  const items = Object.keys(cart);
  if (items.length === 0) {
    showToast('Корзина пуста', true);
    return;
  }

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  const comment = document.getElementById('comment').value.trim();
  const agreement = document.getElementById('agree').checked; // Получаем согласие

  const orderItems = items.map(id => {
    const p = ALL_PRODUCTS.find(x => x.id == id);
    return { id: p.id, name: p.name, price: p.price, qty: cart[id] };
  });

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Отправка...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        address,
        comment,
        items: orderItems,
        delivery: 450,
        agreement: agreement // Передаем согласие
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Сервер вернул ${res.status}`);
    }

    showToast('Заказ оформлен! Мы свяжемся с вами ✅');
    cart = {};
    localStorage.removeItem('raki_cart');
    updateCartUI();
    document.getElementById('orderForm').reset();
    setTimeout(closeCart, 1500);

  } catch (err) {
    console.error(err);
    showToast('Ошибка: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Оформить заказ';
  }
}

let toastTimer;
function showToast(text, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

updateCartUI();

/* ============ МОБИЛЬНОЕ МЕНЮ ============ */
document.addEventListener('DOMContentLoaded', () => {
  const burgerBtn = document.getElementById('burgerBtn');
  const closeMenuBtn = document.getElementById('closeMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const menuOverlay = document.getElementById('menuOverlay');
  const mobileLinks = document.querySelectorAll('.mobile-nav a');

  if (burgerBtn) {
    burgerBtn.addEventListener('click', () => {
      mobileMenu.classList.add('open');
      menuOverlay.classList.add('show');
    });
  }

  if (closeMenuBtn) {
    closeMenuBtn.addEventListener('click', () => closeMenu());
  }

  if (menuOverlay) {
    menuOverlay.addEventListener('click', () => closeMenu());
  }

  mobileLinks.forEach(link => {
    link.addEventListener('click', () => closeMenu());
  });

  function closeMenu() {
    mobileMenu.classList.remove('open');
    menuOverlay.classList.remove('show');
  }
});

/* ============ FAQ (ВОПРОС-ОТВЕТ) ============ */
function toggleFaq(element) {
  const item = element.parentElement;
  const answer = item.querySelector('.faq-answer');
  const isActive = item.classList.contains('active');

  document.querySelectorAll('.faq-item').forEach(el => {
    el.classList.remove('active');
    el.querySelector('.faq-answer').style.maxHeight = null;
  });

  if (!isActive) {
    item.classList.add('active');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const faqItems = document.querySelectorAll('.faq-item');
  if (faqItems.length > 0) {
    faqItems.forEach(item => {
      item.classList.add('active');
      const answer = item.querySelector('.faq-answer');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    });

    let isScrolled = false;
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50 && !isScrolled) {
        isScrolled = true;
        faqItems.forEach(item => {
          item.classList.remove('active');
          item.querySelector('.faq-answer').style.maxHeight = null;
        });
      }
    }, { passive: true });
  }
});

/* ============ ГАЛЕРЕЯ ============ */
function openImage(src) {
  const modal = document.getElementById('imageModal');
  const fullImg = document.getElementById('fullImage');
  if (modal && fullImg) {
    fullImg.src = src;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function closeImage() {
  const modal = document.getElementById('imageModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
  }
}

// Загрузка Яндекс.Метрики только после согласия
const cookieAccepted = localStorage.getItem('cookie_accepted');

if (cookieAccepted === 'true') {
  // Вставляем скрипт Метрики динамически
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a)
  })
    (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

  ym(54635440, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
}

/* ============ БАННЕР COOKIE ============ */
document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('cookie-accept');
  const rejectBtn = document.getElementById('cookie-reject');

  // Проверяем, давал ли пользователь согласие ранее (сохраняем в localStorage)
  const isAccepted = localStorage.getItem('cookie_accepted');

  if (!isAccepted && banner) {
    // Если не давал — показываем баннер (с задержкой 1 сек, чтобы страница загрузилась)
    setTimeout(() => {
      banner.style.display = 'flex';
    }, 1000);
  }

  // Обработка кнопки "Принять все"
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      localStorage.setItem('cookie_accepted', 'true');
      banner.style.display = 'none';
      // Если нужно, здесь можно перезагрузить страницу, чтобы включилась Метрика
      // location.reload(); 
    });
  }

  // Обработка кнопки "Только необходимые"
  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      localStorage.setItem('cookie_accepted', 'false');
      banner.style.display = 'none';
    });
  }
});

/* ============ КНОПКА НАВЕРХ ============ */
document.addEventListener('DOMContentLoaded', () => {
    const scrollToTopBtn = document.getElementById('scrollToTop');

    if (scrollToTopBtn) {
        // Показываем кнопку при прокрутке вниз на 300px
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollToTopBtn.classList.add('show');
            } else {
                scrollToTopBtn.classList.remove('show');
            }
        });

        // Плавный скролл наверх при клике
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});