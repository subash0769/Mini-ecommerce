const amqplib = require('amqplib');
const config = require('./config');

let connection = null;
let channel = null;

async function connectRabbitMQ(maxRetries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[*] Connecting to RabbitMQ (attempt ${attempt}/${maxRetries}): ${config.rabbitMqUrl}`);
      connection = await amqplib.connect(config.rabbitMqUrl);
      channel = await connection.createChannel();
      await channel.assertQueue(config.queueName, { durable: true });
      console.log(`[✔] Connected to RabbitMQ. Queue '${config.queueName}' ready.`);

      connection.on('error', (err) => {
        console.error('[!] RabbitMQ connection error:', err.message);
      });
      connection.on('close', () => {
        console.warn('[!] RabbitMQ connection closed. Attempting reconnect...');
        channel = null;
        connection = null;
        setTimeout(() => connectRabbitMQ(maxRetries, delayMs), delayMs);
      });

      return { connection, channel };
    } catch (err) {
      console.warn(`[!] RabbitMQ connection failed: ${err.message}. Retrying in ${delayMs / 1000}s...`);
      if (attempt === maxRetries) {
        throw new Error(`Could not connect to RabbitMQ after ${maxRetries} attempts.`);
      }
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

async function publishOrderTask(task) {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  const payload = Buffer.from(JSON.stringify(task));
  return channel.sendToQueue(config.queueName, payload, { persistent: true });
}

function getChannel() {
  return channel;
}

module.exports = {
  connectRabbitMQ,
  publishOrderTask,
  getChannel
};
