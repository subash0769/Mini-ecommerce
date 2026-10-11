const config = require('./config');
const { initDatabase, query } = require('./db');
const { connectRabbitMQ } = require('./rabbitmq');

function generateTransactionId() {
  const chars = '0123456789ABCDEF';
  let id = 'TXN_';
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function processOrder(orderTask) {
  const { order_id, customer_name, total_amount, items } = orderTask;
  console.log(`\n==================================================`);
  console.log(`[⚡] Processing Order #${order_id} for ${customer_name}`);
  console.log(`[⚡] Total: $${total_amount} | Items: ${items.length}`);

  // 1. Mark as PROCESSING in Database
  await query(
    `UPDATE orders SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [order_id]
  );
  console.log(`[*] Order #${order_id} status updated to: PROCESSING`);

  // 2. Simulate Payment Gateway processing delay (2.5 seconds)
  console.log(`[*] Contacting payment gateway...`);
  await new Promise((res) => setTimeout(res, 2500));

  // 3. Simulate payment outcome (85% success, 15% failure)
  const isSuccess = Math.random() < 0.85;

  if (isSuccess) {
    const txnId = generateTransactionId();
    // Update order status to PAID
    await query(
      `UPDATE orders 
       SET status = 'PAID', transaction_id = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [txnId, order_id]
    );

    // Deduct stock for ordered items
    for (const item of items) {
      await query(
        `UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    console.log(`[✔] PAYMENT APPROVED! Order #${order_id} marked as PAID. Transaction: ${txnId}`);
  } else {
    const failureReason = 'Payment authorization declined: Insufficient funds or invalid card details (Simulated)';
    await query(
      `UPDATE orders 
       SET status = 'FAILED', failure_reason = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [failureReason, order_id]
    );

    console.log(`[✖] PAYMENT FAILED! Order #${order_id} marked as FAILED. Reason: ${failureReason}`);
  }
  console.log(`==================================================\n`);
}

async function startWorker() {
  console.log('[*] Starting Payment & Order Fulfillment Worker...');
  await initDatabase();
  const { channel } = await connectRabbitMQ();

  // Set prefetch to 1 so worker processes one order at a time
  await channel.prefetch(1);

  console.log(`[*] Waiting for orders in queue '${config.queueName}'... Press CTRL+C to exit.`);

  channel.consume(config.queueName, async (msg) => {
    if (!msg) return;

    try {
      const task = JSON.parse(msg.content.toString());
      await processOrder(task);
      channel.ack(msg);
    } catch (err) {
      console.error('[!] Error processing order message:', err);
      // Negative acknowledgement - requeue if unexpected error
      channel.nack(msg, false, false);
    }
  });
}

startWorker().catch((err) => {
  console.error('[!] Fatal worker error:', err);
  process.exit(1);
});
