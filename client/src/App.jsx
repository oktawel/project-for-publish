import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = '';

const PRODUCTS = [
  { id: 1, name: 'Смартфон Galaxy Ultra', price: 89990, image: '📱', desc: 'Флагманский смартфон' },
  { id: 2, name: 'Ноутбук ProBook 15', price: 129990, image: '💻', desc: 'Мощный ноутбук' },
  { id: 3, name: 'Наушники AirSound Pro', price: 15990, image: '🎧', desc: 'Беспроводные наушники' },
  { id: 4, name: 'Умные часы SmartWatch', price: 24990, image: '⌚', desc: 'Фитнес-трекер' },
];

function App() {
  const [currentUser, setCurrentUser] = useState('user1');
  const [carts, setCarts] = useState({ user1: [], user2: [] });
  const [orders, setOrders] = useState([]);
  const [currentPage, setCurrentPage] = useState('shop');
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);

  const cart = carts[currentUser];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');

    // Задержка 100мс, чтобы страница сначала отрисовалась
    const timer = setTimeout(() => {
      if (orderId) {
        setCurrentOrderId(orderId);
        setCurrentPage('orders');
        loadOrders();
        window.history.replaceState({}, '', '/');
        showNotification('🔄 Проверка статуса платежа...');
      } else {
        loadOrders();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setOrders([]);
    loadOrders();
  }, [currentUser]);

  useEffect(() => {
    if (currentPage !== 'orders') return;
    const interval = setInterval(() => {
      loadOrders();
    }, 3000);
    return () => clearInterval(interval);
  }, [currentPage, currentUser]);

  const showNotification = (text) => {
    setNotification(text);
    setTimeout(() => setNotification(null), 2500);
  };

  const addToCart = (product) => {
    setCarts(prev => {
      const userCart = prev[currentUser];
      const existing = userCart.find(item => item.id === product.id);
      const newCart = existing
        ? userCart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...userCart, { ...product, quantity: 1 }];
      return { ...prev, [currentUser]: newCart };
    });
    showNotification(`✅ ${product.name} добавлен в корзину (${currentUser})`);
  };

  const changeQuantity = (id, delta) => {
    setCarts(prev => {
      const userCart = prev[currentUser];
      const newCart = userCart.map(item => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0);
      return { ...prev, [currentUser]: newCart };
    });
  };

  const removeFromCart = (id) => {
    setCarts(prev => ({
      ...prev,
      [currentUser]: prev[currentUser].filter(item => item.id !== id)
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/create-payment`, {
        items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
        userEmail: `${currentUser}@example.com`,
        userId: currentUser,
      });
      setCarts(prev => ({ ...prev, [currentUser]: [] }));
      setCurrentOrderId(response.data.orderId);
      setCurrentPage('status');
      window.location.href = response.data.confirmationUrl;
    } catch (error) {
      alert('Ошибка: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRetryPayment = async (orderId) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/retry-payment/${orderId}`);
      setCurrentOrderId(response.data.orderId);
      setCurrentPage('status');
      setOrderStatus('pending');
      window.location.href = response.data.confirmationUrl;
    } catch (error) {
      alert('Ошибка повторной оплаты: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/orders?userId=${currentUser}`);
      setOrders(response.data);
    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      pending: { class: 'status-pending', text: '⏳ Ожидает оплаты' },
      succeeded: { class: 'status-succeeded', text: '✅ Оплачен' },
      canceled: { class: 'status-canceled', text: '⏱️ Срок оплаты истёк / Отменён' },
    };
    const s = map[status] || map.pending;
    return <span className={`status-badge ${s.class}`}>{s.text}</span>;
  };

  const renderShop = () => (
    <div className="container">
      <h1 className="page-title">🛍️ Каталог электроники <span className="page-subtitle">(Вы вошли как: <b>{currentUser}</b>)</span></h1>
      <div className="products-grid">
        {PRODUCTS.map(product => (
          <div key={product.id} className="product-card">
            <div className="product-image">{product.image}</div>
            <div className="product-info">
              <div className="product-name">{product.name}</div>
              <div className="product-desc">{product.desc}</div>
              <div className="product-price">{product.price.toLocaleString('ru-RU')} ₽</div>
              <button className="btn-add" onClick={() => addToCart(product)}>В корзину</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCart = () => (
    <div className="container">
      <h1 className="page-title">🛒 Корзина ({currentUser})</h1>
      <div className="cart-container">
        {cart.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <h2>Корзина пуста</h2>
            <button className="btn-home" onClick={() => setCurrentPage('shop')}>Перейти в магазин</button>
          </div>
        ) : (
          <>
            {cart.map(item => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-image">{item.image}</div>
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-price">{item.price.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="quantity-controls">
                  <button className="qty-btn" onClick={() => changeQuantity(item.id, -1)}>−</button>
                  <span className="qty-value">{item.quantity}</span>
                  <button className="qty-btn" onClick={() => changeQuantity(item.id, 1)}>+</button>
                </div>
                <button className="remove-btn" onClick={() => removeFromCart(item.id)}>🗑️</button>
              </div>
            ))}
            <div className="cart-summary">
              <div className="cart-total">Итого: <span>{cartTotal.toLocaleString('ru-RU')} ₽</span></div>
              <button className="btn-checkout" onClick={handleCheckout} disabled={loading}>
                {loading ? '⏳ Оформление...' : '💳 Оплатить'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="container">
      <h1 className="page-title">📦 Мои заказы ({currentUser})</h1>
      {orders.length === 0 ? (
        <div className="cart-container">
          <div className="cart-empty">
            <div className="cart-empty-icon">📦</div>
            <h2>Заказов пока нет</h2>
          </div>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div>
                  <div className="order-id">Заказ #{order.id.slice(0, 8)}</div>
                  <div className="order-date">{new Date(order.createdAt).toLocaleString('ru-RU')}</div>
                </div>
                {getStatusBadge(order.status)}
              </div>
              <div className="order-items">
                {order.items.map((item, idx) => (
                  <div key={idx} className="order-item-line">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{(item.price * item.quantity).toLocaleString('ru-RU')} ₽</span>
                  </div>
                ))}
              </div>
              <div className="order-total">
                <span>Итого:</span>
                <span>{order.totalAmount.toLocaleString('ru-RU')} ₽</span>
              </div>

              {/* Кнопки ТОЛЬКО для pending статуса */}
              {order.status === 'pending' && (
                <div className="order-actions">
                  <button
                    className="btn-retry"
                    onClick={() => handleRetryPayment(order.id)}
                    disabled={loading}
                  >
                    💳 Повторить оплату
                  </button>
                  <button
                    className="btn-cancel-order"
                    onClick={async () => {
                      if (window.confirm('Вы уверены, что хотите отменить этот заказ?')) {
                        setLoading(true);
                        try {
                          await axios.post(`${API_URL}/api/cancel-payment/${order.id}`);
                          loadOrders();
                          showNotification('✅ Заказ успешно отменён');
                        } catch (e) {
                          alert('Ошибка при отмене заказа');
                        } finally {
                          setLoading(false);
                        }
                      }
                    }}
                    disabled={loading}
                  >
                    🚫 Отменить заказ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <div className="logo">⚡ ElectroShop</div>
        <nav className="nav">
          <div className="user-switcher">
            <button
              className={`user-btn ${currentUser === 'user1' ? 'active' : ''}`}
              onClick={() => setCurrentUser('user1')}
            >
              👤 User 1
            </button>
            <button
              className={`user-btn ${currentUser === 'user2' ? 'active' : ''}`}
              onClick={() => setCurrentUser('user2')}
            >
              👤 User 2
            </button>
          </div>

          <button className={`nav-btn ${currentPage === 'shop' ? 'active' : ''}`} onClick={() => setCurrentPage('shop')}>🛍️ Каталог</button>
          <button className={`nav-btn ${currentPage === 'orders' ? 'active' : ''}`} onClick={() => setCurrentPage('orders')}>📦 Заказы</button>
          <button className={`nav-btn ${currentPage === 'cart' ? 'active' : ''}`} onClick={() => setCurrentPage('cart')}>
            🛒 Корзина
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
        </nav>
      </header>

      <main className="main-content">
        {currentPage === 'shop' && renderShop()}
        {currentPage === 'cart' && renderCart()}
        {currentPage === 'orders' && renderOrders()}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-logo">⚡ ElectroShop</div>
          <div className="footer-text">
            © 2026 Все права защищены. Лабораторная работа по веб-программированию.
          </div>
        </div>
      </footer>

      {notification && <div className="notification">{notification}</div>}
    </div>
  );
}

export default App;