const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initDatabase, query } = require('./db');
const { connectRabbitMQ, publishOrderTask } = require('./rabbitmq');

const app = express();

app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',') }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-api', timestamp: new Date().toISOString() });
});

// List all catalog products
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM products ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create a new order & enqueue to RabbitMQ
app.post('/api/orders', async (req, res) => {
  const { customer_name, customer_email, items } = req.body;

  if (!customer_name || !customer_email || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid order payload. Name, email, and items are required.' });
  }

  try {
    // 1. Calculate total from database prices
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const { rows } = await query('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (rows.length === 0) {
        return res.status(400).json({ error: `Product ID ${item.product_id} not found.` });
      }
      const product = rows[0];
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      const unitPrice = parseFloat(product.price);
      totalAmount += unitPrice * quantity;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unitPrice
      });
    }

    // 2. Insert order in PENDING status
    const orderResult = await query(
      `INSERT INTO orders (customer_name, customer_email, total_amount, status)
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING *`,
      [customer_name, customer_email, totalAmount.toFixed(2)]
    );
    const order = orderResult.rows[0];

    // 3. Insert order items
    for (const item of validatedItems) {
      await query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.product_id, item.product_name, item.quantity, item.unit_price]
      );
    }

    // 4. Enqueue order payment/fulfillment task to RabbitMQ
    await publishOrderTask({
      order_id: order.id,
      customer_name,
      customer_email,
      total_amount: order.total_amount,
      items: validatedItems,
      created_at: order.created_at
    });

    console.log(`[+] Order #${order.id} created ($${order.total_amount}) and published to queue.`);

    res.status(201).json({
      ...order,
      items: validatedItems
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

// List all orders with items
app.get('/api/orders', async (req, res) => {
  try {
    const { rows: orders } = await query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 50');
    
    // Attach items for each order
    const populated = await Promise.all(
      orders.map(async (order) => {
        const { rows: items } = await query(
          'SELECT * FROM order_items WHERE order_id = $1',
          [order.id]
        );
        return { ...order, items };
      })
    );

    res.json(populated);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order status
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = rows[0];
    const { rows: items } = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    res.json({ ...order, items });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Retry a failed order
app.post('/api/orders/:id/retry', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = rows[0];

    // Reset status to PENDING
    await query(
      `UPDATE orders SET status = 'PENDING', failure_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [order.id]
    );

    const { rows: items } = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);

    await publishOrderTask({
      order_id: order.id,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      total_amount: order.total_amount,
      items,
      created_at: new Date()
    });

    console.log(`[+] Order #${order.id} re-queued for processing.`);
    res.json({ message: 'Order re-queued for processing', order_id: order.id });
  } catch (err) {
    console.error('Error retrying order:', err);
    res.status(500).json({ error: 'Failed to retry order' });
  }
});

async function start() {
  console.log('[*] Initializing Order API Server...');
  await initDatabase();
  await connectRabbitMQ();

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[🚀] Order API listening on http://0.0.0.0:${config.port}`);
  });
}

start().catch((err) => {
  console.error('[!] Fatal startup error:', err);
  process.exit(1);
});
