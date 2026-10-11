require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/ecommerce_db',
  rabbitMqUrl: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  queueName: process.env.QUEUE_NAME || 'order_processing_queue',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};
