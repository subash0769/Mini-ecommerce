const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10, 2) NOT NULL,
        image_url TEXT,
        stock INT DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        total_amount NUMERIC(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        transaction_id VARCHAR(100),
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        unit_price NUMERIC(10, 2) NOT NULL
      );
    `);

    // Seed default products if none exist
    const { rows } = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(rows[0].count, 10) === 0) {
      console.log('[*] Seeding initial product catalog...');
      await client.query(`
        INSERT INTO products (name, description, price, image_url, stock) VALUES
        ('Keychron Q1 Pro Mechanical Keyboard', 'Wireless custom mechanical keyboard with aluminum frame and RGB backlighting.', 199.99, 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=500&q=80', 25),
        ('Sony WH-1000XM5 Wireless Headphones', 'Industry-leading noise canceling with dual processor and 30-hour battery life.', 349.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80', 15),
        ('Logitech MX Master 3S Ergonomic Mouse', 'Quiet clicks, 8K DPI sensor, hyper-fast scroll wheel.', 99.99, 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&q=80', 50),
        ('Dell UltraSharp 27" 4K USB-C Hub Monitor', 'Brilliant IPS Black color accuracy with 90W power delivery.', 579.99, 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&q=80', 10);
      `);
      console.log('[✔] Products seeded successfully.');
    }
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDatabase
};
