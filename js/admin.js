// ================= ПРОВЕРКА АВТОРИЗАЦИИ =================
async function checkAuth() {
    try {
        const res = await fetch('/api/check-auth');
        if (!res.ok) {
            window.location.href = 'login.html';
        }
    } catch (err) {
        window.location.href = 'login.html';
    }
}
checkAuth();

function logout() {
    fetch('/api/logout', { method: 'POST' }).then(() => {
        window.location.href = 'login.html';
    });
}

// ================= ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК =================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');

    if (tabName === 'products') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-products').style.display = 'block';
        loadAdminProducts();
    } else if (tabName === 'orders') {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-orders').style.display = 'block';
        loadOrders();
    } else if (tabName === 'analytics') {
        document.querySelectorAll('.tab-btn')[2].classList.add('active');
        document.getElementById('tab-analytics').style.display = 'block';
        if (!document.getElementById('startDate').value) {
            setPeriod('month');
        }
    }
}

// ================= УПРАВЛЕНИЕ ТОВАРАМИ =================
const form = document.getElementById('productForm');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const container = document.getElementById('adminProductsContainer');

async function loadAdminProducts() {
    if (!container) return;
    try {
        const res = await fetch('/api/admin/products');
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error('Ошибка доступа');

        const products = await res.json();
        container.innerHTML = '';

        if (products.length === 0) {
            container.innerHTML = '<p>Товаров пока нет.</p>';
            return;
        }

        products.forEach(p => {
            const item = document.createElement('div');
            item.className = 'admin-product-item';
            item.innerHTML = `
                <div class="admin-product-info">
                    <img src="${p.image_url}" alt="${p.name}" onerror="this.src='img/logo.webp'">
                    <div>
                        <h4>
                            ${p.name} 
                            ${p.is_hit ? '⭐' : ''} 
                            ${p.is_hidden ? '<span style="color:#e74c3c;font-size:12px;font-weight:bold;">(Скрыт)</span>' : ''}
                        </h4>
                        <p>${p.price} ₽ | ${p.description || 'Без описания'}</p>
                    </div>
                </div>
                <div class="admin-actions">
                    <button class="edit-btn" onclick='editProduct(${JSON.stringify(p)})'>✎</button>
                    <button class="delete-btn" onclick="deleteProduct(${p.id})">✕</button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (err) {
        container.innerHTML = '<p style="color:red;">Ошибка загрузки товаров</p>';
    }
}

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('p-id').value;
        const isEdit = id !== '';

        const data = {
            name: document.getElementById('p-name').value.trim(),
            price: parseInt(document.getElementById('p-price').value),
            description: document.getElementById('p-desc').value.trim(),
            image_url: document.getElementById('p-img').value.trim(),
            is_hit: document.getElementById('p-hit').checked,
            is_hidden: document.getElementById('p-hidden').checked // 👈 ДОБАВЛЕНО
        };

        const url = isEdit ? `/api/products/${id}` : '/api/products';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.status === 401) return logout();

            const result = await res.json();
            if (result.success) {
                alert(isEdit ? 'Товар обновлен!' : 'Товар добавлен!');
                resetForm();
                loadAdminProducts();
            } else {
                alert('Ошибка: ' + result.error);
            }
        } catch (err) {
            alert('Ошибка сервера: ' + err.message);
        }
    });
}

function editProduct(p) {
    document.getElementById('p-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-desc').value = p.description || '';
    document.getElementById('p-img').value = p.image_url || '';
    document.getElementById('p-hit').checked = p.is_hit === 1;
    document.getElementById('p-hidden').checked = p.is_hidden === 1; // 👈 ДОБАВЛЕНО
    document.getElementById('img-preview').innerHTML = p.image_url ? `<img src="${p.image_url}" alt="Превью" style="max-width: 100px; border-radius: 6px;">` : '';

    saveBtn.textContent = 'Обновить товар';
    cancelBtn.style.display = 'block';
    window.scrollTo(0, 0);
}

function resetForm() {
    if (!form) return;
    form.reset();
    document.getElementById('p-id').value = '';
    document.getElementById('p-img').value = '';
    document.getElementById('p-hidden').checked = false; // 👈 ДОБАВЛЕНО
    document.getElementById('img-preview').innerHTML = '';
    saveBtn.textContent = 'Сохранить товар';
    cancelBtn.style.display = 'none';
}

async function deleteProduct(id) {
    if (!confirm('Вы уверены, что хотите удалить этот товар?')) return;
    try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        if (res.status === 401) return logout();
        const result = await res.json();

        if (result.success) loadAdminProducts();
        else alert('Ошибка: ' + result.error);
    } catch (err) {
        alert('Ошибка сервера');
    }
}

// ================= ЗАГРУЗКА КАРТИНКИ =================
const fileInput = document.getElementById('p-file');
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        document.getElementById('img-preview').innerHTML = 'Загрузка и конвертация...';

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (res.status === 401) return logout();
            const data = await res.json();

            if (data.success) {
                document.getElementById('p-img').value = data.image_url;
                document.getElementById('img-preview').innerHTML = `<img src="${data.image_url}" alt="Превью" style="max-width: 100px; border-radius: 6px;">`;
            } else {
                document.getElementById('img-preview').innerHTML = `<span style="color:red;">Ошибка: ${data.error}</span>`;
            }
        } catch (err) {
            document.getElementById('img-preview').innerHTML = `<span style="color:red;">Ошибка сервера</span>`;
        }
    });
}

// ================= ЗАКАЗЫ =================
async function loadOrders() {
    const ordersContainer = document.getElementById('ordersContainer');
    if (!ordersContainer) return;

    ordersContainer.innerHTML = '<tr><td colspan="8">Загрузка...</td></tr>';

    try {
        const res = await fetch('/api/admin/orders');
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error('Нет доступа');
        const orders = await res.json();

        if (orders.length === 0) {
            ordersContainer.innerHTML = '<tr><td colspan="8">Заказов пока нет.</td></tr>';
            return;
        }

        ordersContainer.innerHTML = '';
        orders.forEach(o => {
            let itemsHtml = '';
            try {
                const items = JSON.parse(o.items_json);
                items.forEach(i => { itemsHtml += `${i.name} × ${i.qty}<br>`; });
            } catch (e) { itemsHtml = 'Ошибка данных'; }

            const d = new Date(o.created_at);
            const date = d.toLocaleDateString('ru-RU') + ' в ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            // Статус Telegram
            let tgHtml = '';
            if (o.tg_status === 'success') {
                tgHtml = '<span style="color: #2ecc71; font-weight: bold;">✅ Доставлено</span>';
            } else if (o.tg_status && o.tg_status.startsWith('error')) {
                tgHtml = `<span style="color: #e74c3c; font-weight: bold;">❌ Ошибка</span><br><small style="color:#999">${o.tg_status.replace('error: ', '')}</small>`;
            } else {
                tgHtml = '⏳ Ожидает';
            }

            // Статус заказа
            let statusHtml = '';
            if (o.order_status === 'completed') {
                statusHtml = `<button onclick="toggleOrderStatus(${o.id}, 'pending')" style="background: #2ecc71; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">✅ Выполнен</button>`;
            } else {
                statusHtml = `<button onclick="toggleOrderStatus(${o.id}, 'completed')" style="background: #f1c40f; color: #333; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">⏳ В обработке</button>`;
            }

            // 👇 Согласие (152-ФЗ) 👇
            const agreementHtml = o.agreement_accepted 
                ? '<span style="color: #2ecc71; font-weight: bold;">✅ Да</span>' 
                : '<span style="color: #e74c3c; font-weight: bold;">❌ Нет</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Дата">${date}</td>
                <td data-label="Клиент">
                    <div style="text-align: right;">
                        <strong>${o.customer_name}</strong> 
                        <a href="tel:${o.phone}" style="color: #d84315; white-space: nowrap;">${o.phone}</a>
                        <div class="client-address">${o.address || ''}</div>
                    </div>
                </td>
                <td data-label="Состав" class="order-items">${itemsHtml}</td>
                <td data-label="Сумма"><strong>${o.total_price} ₽</strong></td>
                <td data-label="Telegram">${tgHtml}</td>
                <td data-label="Статус">${statusHtml}</td>
                <td data-label="Согласие (152-ФЗ)">${agreementHtml}</td>
                <td data-label="Действия">
                    <button onclick="deleteOrder(${o.id})" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">✕ Удалить</button>
                </td>
            `;
            ordersContainer.appendChild(tr);
        });
    } catch (err) {
        ordersContainer.innerHTML = '<tr><td colspan="8" style="color:red;">Ошибка загрузки заказов</td></tr>';
    }
}

// ================= АНАЛИТИКА =================
function setPeriod(type) {
    const today = new Date();
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    const formatDate = (date) => date.toISOString().split('T')[0];

    endDate.value = formatDate(today);

    if (type === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        startDate.value = formatDate(weekAgo);
    } else if (type === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        startDate.value = formatDate(monthAgo);
    }
    loadAnalytics();
}

async function loadAnalytics() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const onlyCompleted = document.getElementById('onlyCompleted')?.checked || false;
    const container = document.getElementById('analyticsContainer');

    if (!start || !end) {
        alert('Выберите период');
        return;
    }

    container.innerHTML = '<tr><td colspan="3">Загрузка...</td></tr>';

    try {
        const res = await fetch(`/api/admin/stats?startDate=${start}&endDate=${end}&onlyCompleted=${onlyCompleted}`);
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error('Ошибка доступа');
        const data = await res.json();

        document.getElementById('stat-revenue').textContent = `${data.stats.total_revenue || 0} ₽`;
        document.getElementById('stat-orders').textContent = data.stats.total_orders || 0;
        document.getElementById('stat-avg').textContent = `${Math.round(data.stats.avg_check || 0)} ₽`;

        container.innerHTML = '';
        if (data.daily.length === 0) {
            container.innerHTML = '<tr><td colspan="3">За этот период заказов нет.</td></tr>';
            return;
        }

        data.daily.forEach(day => {
            const tr = document.createElement('tr');
            const dateParts = day.date.split('-');
            const formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;

            tr.innerHTML = `
                <td>${formattedDate}</td>
                <td>${day.count}</td>
                <td><strong>${day.revenue} ₽</strong></td>
            `;
            container.appendChild(tr);
        });

    } catch (err) {
        container.innerHTML = '<tr><td colspan="3" style="color:red;">Ошибка загрузки аналитики</td></tr>';
    }
}

// ================= ИНИЦИАЛИЗАЦИЯ =================
loadAdminProducts();

// ================= СМЕНА СТАТУСА ЗАКАЗА =================
async function toggleOrderStatus(id, newStatus) {
    try {
        const res = await fetch(`/api/admin/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        if (res.ok) {
            loadOrders();
        } else {
            alert('Ошибка при смене статуса');
        }
    } catch (err) {
        alert('Ошибка сервера');
    }
}

// ================= УДАЛЕНИЕ ЗАКАЗА =================
async function deleteOrder(id) {
    if (!confirm(`Вы уверены, что хотите НАВСЕГДА удалить заказ #${id}?`)) return;

    try {
        const res = await fetch(`/api/admin/orders/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            loadOrders();
        } else {
            alert('Ошибка при удалении заказа');
        }
    } catch (err) {
        alert('Ошибка сервера');
    }
}

document.getElementById('onlyCompleted')?.addEventListener('change', loadAnalytics);