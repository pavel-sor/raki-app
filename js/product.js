document.addEventListener('DOMContentLoaded', async () => {
    // 1. Получаем ID товара из URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));
    const container = document.getElementById('product-details');

    if (!productId) {
        container.innerHTML = '<h2>Товар не выбран 😔</h2><a href="menu.html" style="color: var(--color-accent); text-decoration: underline;">Вернуться в меню</a>';
        return;
    }

    try {
        // 2. Самостоятельно запрашиваем ВСЕ товары с сервера
        const res = await fetch('/api/products');
        const products = await res.json();

        // 3. Находим нужный товар
        const product = products.find(p => p.id === productId);

        if (!product) {
            container.innerHTML = '<h2>Товар не найден 😔</h2><a href="menu.html" style="color: var(--color-accent); text-decoration: underline;">Вернуться в меню</a>';
            return;
        }

        // 4. Меняем заголовок вкладки
        document.title = product.name + ' — 123 Раковая';

        // 5. Отрисовываем страницу
        container.innerHTML = `
            <!-- Ссылка "Назад" -->
            <div class="back-link-wrapper">
                <a href="menu.html" class="back-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Назад в меню
                </a>
            </div>

            <div class="product-detail-content">
                <div class="product-detail-image">
                    <img src="${product.image_url}" alt="${product.name}" onerror="this.src='img/logo.webp'">
                </div>
                <div class="product-detail-info">
                    <h1>${product.name}</h1>
                    <p>${product.description || ''}</p>
                    
                    <div class="product-detail-price">
                        ${product.price} ₽
                    </div>
                    
                    <button class="add-btn" onclick="addToCart(${product.id})">
                        ДОБАВИТЬ В КОРЗИНУ
                    </button>
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        container.innerHTML = '<h2 style="color:red;">Ошибка сервера. Проверьте, запущен ли сервер.</h2>';
    }
});