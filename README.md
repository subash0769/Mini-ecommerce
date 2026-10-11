# 🛒 NovaStore — Event-Driven E-Commerce & Order Pipeline

**NovaStore** is a distributed, event-driven mini e-commerce application designed specifically for you to practice **Dockerizing full-stack microservices** and crafting your own **`compose.yaml`** configuration.

---

## 🏗️ System Architecture

```text
                               +-----------------------------+
                               |     Web Browser (Store)     |
                               |    (React Dashboard @ 3000) |
                               +--------------+--------------+
                                              |
                          +-------------------+-------------------+
                          | (HTTP / Static UI)                    | (REST API / Order Placement)
                          v                                       v
                  +---------------+                       +---------------+
                  |    frontend   |                       |   order-api   |
                  | (React / Vite)|                       | (Express.js)  |
                  +---------------+                       +-------+-------+
                                                                  |
                                             +--------------------+--------------------+
                                             | Enqueues Order Task                     | Saves Order (PENDING)
                                             v                                         v
                                     +---------------+                         +---------------+
                                     |   rabbitmq    |                         |   postgres    |
                                     | (AMQP Queue)  |                         | (ecommerce_db)|
                                     +-------+-------+                         +-------+-------+
                                             |                                         ^
                                             | Worker Pops Order Task                  |
                                             v                                         | Updates Status
                                     +---------------+                                 | (PAID / FAILED)
                                     | order-worker  |---------------------------------+ & Deducts Stock
                                     | (Simulated Tx)|
                                     +---------------+
```

---

## 🎯 Containerization Challenge & Specifications

Your mission is to write:
1. `backend/Dockerfile` (to power both the **API** and the **Worker**)
2. `frontend/Dockerfile` (for the React client)
3. `compose.yaml` (orchestrating all 5 services: `postgres`, `rabbitmq`, `api`, `worker`, `frontend`)

---

### Service Requirements

#### 1. PostgreSQL Database (`postgres`)
* **Image**: `postgres:16-alpine`
* **Port**: `5432:5432`
* **Environment Variables**:
  * `POSTGRES_USER=postgres`
  * `POSTGRES_PASSWORD=postgrespassword`
  * `POSTGRES_DB=ecommerce_db`
* **Volume**: Persistent named volume (e.g. `postgres_data:/var/lib/postgresql/data`)
* **Healthcheck** (recommended):
  ```yaml
  test: ["CMD-SHELL", "pg_isready -U postgres -d ecommerce_db"]
  interval: 5s
  timeout: 5s
  retries: 5
  ```

---

#### 2. Message Broker (`rabbitmq`)
* **Image**: `rabbitmq:3-management-alpine`
  *(The management tag includes the web dashboard at `http://localhost:15672` with default login `guest` / `guest`)*
* **Ports**:
  * `5672:5672` (AMQP messaging protocol)
  * `15672:15672` (RabbitMQ Management Web UI)
* **Healthcheck** (recommended):
  ```yaml
  test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
  interval: 10s
  timeout: 10s
  retries: 5
  ```

---

#### 3. Backend API Service (`api`)
* **Base Image**: `node:20-alpine`
* **Context**: `./backend`
* **Port**: `4000:4000`
* **Entrypoint**: `npm start` (or `node src/server.js`)
* **Environment Variables**:
  * `PORT=4000`
  * `DATABASE_URL=postgresql://postgres:postgrespassword@postgres:5432/ecommerce_db`
  * `RABBITMQ_URL=amqp://rabbitmq:5672`
  * `QUEUE_NAME=order_processing_queue`
  * `CORS_ORIGIN=*`
* **Dependencies**: Needs `postgres` and `rabbitmq` to be ready.

---

#### 4. Background Order Worker (`worker`)
* **Base Image**: Same as API (`node:20-alpine`, builds from `./backend`)
* **Entrypoint**: `npm run worker` (or `node src/worker.js`)
* **Environment Variables**:
  * `DATABASE_URL=postgresql://postgres:postgrespassword@postgres:5432/ecommerce_db`
  * `RABBITMQ_URL=amqp://rabbitmq:5672`
  * `QUEUE_NAME=order_processing_queue`
* **Dependencies**: Needs `postgres`, `rabbitmq`, and `api`.

---

#### 5. Frontend Storefront (`frontend`)
* **Base Image**: `node:20-alpine` (for dev server) or multi-stage Nginx build (`nginx:alpine`)
* **Context**: `./frontend`
* **Port**: `3000:3000` (or `3000:80` if using Nginx)
* **Entrypoint**: `npm run dev`
* **Environment Variables**:
  * `VITE_API_URL=http://localhost:4000`
* **Dependencies**: `api`

---

## 🛠️ Testing Locally Without Docker (Optional)

If you have Node.js, Postgres, and RabbitMQ installed locally:

```bash
# 1. Start Backend API
cd backend
npm install
npm start

# 2. Start Worker (in a second terminal)
cd backend
npm run worker

# 3. Start Frontend Storefront (in a third terminal)
cd frontend
npm install
npm run dev
```

Visit the storefront at `http://localhost:3000`.

---

## 💡 Pro-Tips for Your Dockerfiles & Compose

1. **Docker Layer Caching**: In `Dockerfile`, remember to copy `package*.json` and run `npm install` *before* copying the remaining source code.
2. **RabbitMQ Connection Delays**: RabbitMQ usually takes 5–10 seconds to fully initialize AMQP ports. The backend code already includes an automatic reconnect retry loop, but using Docker Compose `depends_on` with `condition: service_healthy` provides an even cleaner startup.
3. **Host Binding**: Vite and Express must bind to `0.0.0.0` (all interfaces) rather than `127.0.0.1` so Docker port mapping works from your host browser.
# Mini-ecommerce
