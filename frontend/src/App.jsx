import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function App() {
  const [activeTab, setActiveTab] = useState('catalog');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkoutData, setCheckoutData] = useState({
    customer_name: '',
    customer_email: '',
    quantity: 1
  });
  const [loading, setLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);

  // Fetch catalog products
  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        setApiOnline(true);
      }
    } catch (err) {
      setApiOnline(false);
    }
  };

  // Fetch orders
  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
        setApiOnline(true);
      }
    } catch (err) {
      setApiOnline(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchOrders();

    // Poll orders every 2 seconds for real-time queue & worker state updates
    const interval = setInterval(() => {
      fetchOrders();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const openCheckout = (product) => {
    setSelectedProduct(product);
    setCheckoutData({
      customer_name: 'Alex Developer',
      customer_email: 'alex@example.com',
      quantity: 1
    });
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: checkoutData.customer_name,
          customer_email: checkoutData.customer_email,
          items: [
            {
              product_id: selectedProduct.id,
              quantity: parseInt(checkoutData.quantity, 10) || 1
            }
          ]
        })
      });

      if (res.ok) {
        setSelectedProduct(null);
        await fetchOrders();
        await fetchProducts();
        setActiveTab('orders');
      } else {
        const err = await res.json();
        alert(`Order creation failed: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Could not connect to API at ${API_BASE}. Make sure the backend is running.`);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/retry`, { method: 'POST' });
      if (res.ok) {
        fetchOrders();
      }
    } catch (err) {
      console.error('Failed to retry order:', err);
    }
  };

  return (
    <div className="container">
      {/* Top Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-logo">⚡</div>
          <div>
            <h1>NovaStore</h1>
            <span className="brand-badge">Async RabbitMQ Pipeline</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: apiOnline ? '#4ade80' : '#ef4444'
              }}
            />
            <span style={{ color: apiOnline ? '#86efac' : '#fca5a5' }}>
              API: {apiOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <nav className="nav-tabs">
            <button
              className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
              onClick={() => setActiveTab('catalog')}
            >
              Catalog ({products.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              Live Orders ({orders.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Queue Info Card */}
      <div className="queue-info-card">
        <div>
          <div className="queue-info-title">
            🐇 Asynchronous Event-Driven Order Processing
          </div>
          <div className="queue-info-desc">
            Placing an order persists it as <code>PENDING</code> in Postgres and emits an event to the <code>order_processing_queue</code> in RabbitMQ. A background worker picks it up, simulates card payment, and marks it <code>PAID</code> or <code>FAILED</code>.
          </div>
        </div>
      </div>

      {/* Catalog Tab */}
      {activeTab === 'catalog' && (
        <main>
          <div className="product-grid">
            {products.map((p) => (
              <div key={p.id} className="product-card">
                <img src={p.image_url} alt={p.name} className="product-img" />
                <div className="product-body">
                  <h3 className="product-title">{p.name}</h3>
                  <p className="product-desc">{p.description}</p>
                  <div className="product-footer">
                    <div>
                      <div className="product-price">${parseFloat(p.price).toFixed(2)}</div>
                      <div className="product-stock">In stock: {p.stock} units</div>
                    </div>
                    <button
                      className="btn-buy"
                      disabled={p.stock <= 0}
                      onClick={() => openCheckout(p)}
                    >
                      {p.stock > 0 ? 'Order Now' : 'Out of Stock'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <main>
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <h3>No orders yet.</h3>
              <p style={{ marginTop: '8px' }}>Go to the catalog and place an order to see RabbitMQ in action!</p>
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Transaction / Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700, color: '#f8fafc' }}>#{o.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{o.customer_email}</div>
                    </td>
                    <td>
                      {o.items?.map((it, idx) => (
                        <div key={idx} style={{ fontSize: '13px' }}>
                          {it.quantity}x {it.product_name}
                        </div>
                      ))}
                    </td>
                    <td style={{ fontWeight: 700, color: '#38bdf8' }}>${parseFloat(o.total_amount).toFixed(2)}</td>
                    <td>
                      <span className={`status-badge status-${o.status}`}>
                        {o.status === 'PROCESSING' ? '⏳ ' : ''}
                        {o.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {o.transaction_id && (
                        <div style={{ color: '#4ade80', fontFamily: 'monospace' }}>
                          ✔ {o.transaction_id}
                        </div>
                      )}
                      {o.failure_reason && (
                        <div style={{ color: '#f87171' }}>
                          ✖ {o.failure_reason}
                        </div>
                      )}
                      {!o.transaction_id && !o.failure_reason && (
                        <span style={{ color: '#64748b' }}>Queued in RabbitMQ...</span>
                      )}
                    </td>
                    <td>
                      {o.status === 'FAILED' && (
                        <button className="btn-retry" onClick={() => handleRetry(o.id)}>
                          ↻ Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      )}

      {/* Checkout Modal */}
      {selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Checkout: {selectedProduct.name}</h2>
            <form onSubmit={handlePlaceOrder}>
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={checkoutData.customer_name}
                  onChange={(e) => setCheckoutData({ ...checkoutData, customer_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  value={checkoutData.customer_email}
                  onChange={(e) => setCheckoutData({ ...checkoutData, customer_email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={selectedProduct.stock}
                  required
                  className="form-input"
                  value={checkoutData.quantity}
                  onChange={(e) => setCheckoutData({ ...checkoutData, quantity: e.target.value })}
                />
              </div>

              <div style={{ marginTop: '16px', padding: '12px', background: '#0f131d', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#94a3b8' }}>
                  <span>Price per item:</span>
                  <span>${parseFloat(selectedProduct.price).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '16px', marginTop: '6px', color: '#f8fafc' }}>
                  <span>Estimated Total:</span>
                  <span>${(parseFloat(selectedProduct.price) * (parseInt(checkoutData.quantity, 10) || 1)).toFixed(2)}</span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedProduct(null)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Queuing Order...' : 'Confirm & Pay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
