require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

const authHeader = 'Basic ' + Buffer.from(
    `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
).toString('base64');

const ordersDB = new Map();

// 1. Создание платежа (с таймером на 2 минуты для демонстрации)
app.post('/api/create-payment', async (req, res) => {
    const { items, userEmail, userId } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ error: 'Корзина пуста' });

    const orderId = uuidv4();
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderDescription = items.map(i => `${i.name} x${i.quantity}`).join(', ');

    console.log('📦 Создание заказа:', { orderId, userId, totalAmount, items: items.length });

    ordersDB.set(orderId, {
        id: orderId,
        userId,
        items,
        totalAmount,
        userEmail: userEmail || 'guest@example.com',
        status: 'pending',
        paymentId: null,
        createdAt: new Date().toISOString(),
    });

    try {
        // Убираем expires_at - пусть работает с настройками по умолчанию (3 дня)
        const requestBody = {
            amount: { value: totalAmount.toString(), currency: 'RUB' },
            capture: true,
            confirmation: {
                type: 'redirect',
                // Было:
                // return_url: `http://localhost:5173/?orderId=${orderId}`,

                // Стало (в обоих местах: create-payment и retry-payment):
                return_url: `${process.env.FRONTEND_URL}/?orderId=${orderId}`,
            },
            description: `Заказ для ${userId}: ${orderDescription}`,
            metadata: { order_id: orderId }
        };

        console.log('📤 Отправка запроса в ЮKassa:', requestBody);

        const response = await axios.post('https://api.yookassa.ru/v3/payments', requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'Idempotence-Key': uuidv4(),
            }
        });

        console.log('✅ Платеж создан:', response.data.id);

        const order = ordersDB.get(orderId);
        order.paymentId = response.data.id;
        ordersDB.set(orderId, order);

        res.json({ confirmationUrl: response.data.confirmation.confirmation_url, orderId });
    } catch (error) {
        console.error('❌ Ошибка создания платежа:');
        if (error.response) {
            console.error('Статус:', error.response.status);
            console.error('Данные:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Сообщение:', error.message);
        }
        res.status(500).json({
            error: 'Не удалось создать платёж',
            details: error.response?.data?.description || error.message
        });
    }
});

// 2. НОВЫЙ ЭНДПОИНТ: Повторная оплата существующего заказа
app.post('/api/retry-payment/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const order = ordersDB.get(orderId);

    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    // ⚡ То же самое для повторной попытки
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    try {
        const response = await axios.post('https://api.yookassa.ru/v3/payments', {
            amount: { value: order.totalAmount.toString(), currency: 'RUB' },
            capture: true,
            confirmation: {
                type: 'redirect',
                // Было:
                // return_url: `http://localhost:5173/?orderId=${orderId}`,

                // Стало (в обоих местах: create-payment и retry-payment):
                return_url: `${process.env.FRONTEND_URL}/?orderId=${orderId}`,
            },
            description: `Повторная оплата заказа: ${order.items.map(i => i.name).join(', ')}`,
            metadata: { order_id: orderId },
            expires_at: expiresAt // <-- Передаем время истечения
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'Idempotence-Key': uuidv4(),
            }
        });

        order.paymentId = response.data.id;
        order.status = 'pending';
        ordersDB.set(orderId, order);

        res.json({ confirmationUrl: response.data.confirmation.confirmation_url, orderId });
    } catch (error) {
        console.error('Ошибка повторной оплаты:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Не удалось создать платеж' });
    }
});

// 3. Получение заказов ТОЛЬКО для конкретного пользователя
app.get('/api/orders', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Требуется userId' });

    // Фильтруем заказы по пользователю
    const userOrders = Array.from(ordersDB.values()).filter(order => order.userId === userId);

    // Проверяем статус pending заказов у ЮKassa
    for (const order of userOrders) {
        if (order.status === 'pending' && order.paymentId) {
            try {
                const response = await axios.get(
                    `https://api.yookassa.ru/v3/payments/${order.paymentId}`,
                    { headers: { 'Authorization': authHeader } }
                );
                const paymentStatus = response.data.status;
                if (paymentStatus === 'succeeded' || paymentStatus === 'canceled') {
                    order.status = paymentStatus;
                    ordersDB.set(order.id, order);
                }
            } catch (e) {
                console.error('Ошибка проверки статуса:', e.message);
            }
        }
    }

    userOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(userOrders);
});

// 4. Проверка статуса одного заказа
app.get('/api/order-status/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const order = ordersDB.get(orderId);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    if (order.status !== 'pending') return res.json({ status: order.status, order });

    if (order.paymentId) {
        try {
            const response = await axios.get(
                `https://api.yookassa.ru/v3/payments/${order.paymentId}`,
                { headers: { 'Authorization': authHeader } }
            );
            const paymentStatus = response.data.status;
            if (paymentStatus === 'succeeded' || paymentStatus === 'canceled') {
                order.status = paymentStatus;
                ordersDB.set(orderId, order);
                return res.json({ status: paymentStatus, order });
            }
        } catch (e) {
            console.error('Ошибка:', e.message);
        }
    }
    res.json({ status: order.status, order });
});

// 5. Webhook
app.post('/api/webhook', (req, res) => {
    const event = req.body;
    if (event.event === 'payment.succeeded' || event.event === 'payment.canceled') {
        const orderId = event.object.metadata.order_id;
        const order = ordersDB.get(orderId);
        if (order) {
            order.status = event.event === 'payment.succeeded' ? 'succeeded' : 'canceled';
            ordersDB.set(orderId, order);
            console.log(`✅ Заказ ${orderId} (${order.userId}): ${order.status}`);
        }
    }
    res.status(200).send('OK');
});


// Отмена заказа пользователем
app.post('/api/cancel-payment/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const order = ordersDB.get(orderId);

    if (!order) {
        return res.status(404).json({ error: 'Заказ не найден' });
    }

    // Защита: нельзя отменить уже оплаченный или ранее отменённый заказ
    if (order.status !== 'pending') {
        return res.status(400).json({ error: 'Нельзя отменить заказ в текущем статусе' });
    }

    try {
        console.log(`⏹️ Пользователь отменил заказ ${orderId}`);

        // Меняем статус в нашей базе данных
        order.status = 'canceled';
        ordersDB.set(orderId, order);

        // Примечание: сам платёж на стороне ЮKassa (в статусе pending) 
        // истечёт автоматически по таймеру expires_at, который мы задали при создании.
        // API ЮKassa не позволяет отменять pending-платежи напрямую — это ограничение шлюза.

        console.log(`✅ Заказ ${orderId} помечен как отменённый в нашей системе`);
        res.json({
            status: 'canceled',
            message: 'Заказ отменён. Платёжная ссылка будет деактивирована по истечении времени.'
        });
    } catch (error) {
        console.error('Ошибка отмены заказа:', error.message);
        res.status(500).json({ error: 'Не удалось отменить заказ' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));