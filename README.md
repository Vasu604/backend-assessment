# Backend Assessment - Node.js + Express + PostgreSQL

This implementation follows the provided logistics scenario and mandatory APIs with strict transaction safety for stock operations.

## Tech Stack

- Node.js + Express
- PostgreSQL (`pg`)
- `dotenv` for environment configuration
- SQL migration scripts with a custom migration runner

## Architecture

- `src/modules/orders/` contains order domain logic and routes.
- `src/modules/orders/service.js` contains transactional business rules:
  - product existence checks
  - stock validation
  - stock deduction on create order
  - stock restoration on cancel order
- `migrations/` contains schema and seed scripts.
- `scripts/runMigrations.js` applies SQL files once and tracks execution in `schema_migrations`.

## Submission Checklist

- Git repository with meaningful commit history: create multiple focused commits (for setup, schema, APIs, and documentation) instead of one large commit.
- README with architecture explanation and run instructions: this document includes both.
- Database migration scripts: included in `migrations/` and executed by `npm run migrate`.

## Database Migration Scripts (What Is Included)

- `migrations/001_init.sql`
  - creates `users`, `products`, `orders`, and `order_items`
  - adds constraints for status, quantity, and non-negative stock/amounts
  - adds performance indexes used by listing/filtering APIs
- `migrations/002_seed.sql`
  - inserts 1 default user (`id = 1`) used by order creation
  - inserts sample products (`SKU001`, `SKU002`, `SKU003`)
- `scripts/runMigrations.js`
  - creates `schema_migrations` tracker table
  - applies `.sql` files in sorted order
  - wraps every migration in `BEGIN`/`COMMIT`
  - records each applied filename so migrations run only once

## Requirement Mapping (Assessment Rules)

1. **Validate products exist**
   - Implemented in `src/modules/orders/service.js` inside `createOrder()` where requested SKUs are checked against `productsBySku`.
2. **Validate stock availability**
   - Implemented in `src/modules/orders/service.js` inside `createOrder()` by comparing requested `qty` with `product.stock_qty`.
3. **Deduct stock using DB transaction**
   - Transaction boundary is implemented in `src/modules/orders/routes.js` (`POST /orders`) using `BEGIN`/`COMMIT`.
   - Stock deduction query is implemented in `src/modules/orders/service.js` inside `createOrder()` (`UPDATE products SET stock_qty = stock_qty - $1`).
4. **Insert order and order items**
   - Implemented in `src/modules/orders/service.js` inside `createOrder()`:
     - order insert into `orders`
     - item inserts into `order_items`
5. **Calculate total amount**
   - Implemented in `src/modules/orders/service.js` inside `createOrder()` by summing `price * qty` for all items.
6. **If any item fails, rollback entire transaction**
   - Implemented in `src/modules/orders/routes.js` (`POST /orders`) catch block with `ROLLBACK`.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Make sure PostgreSQL is running and database exists:

```sql
CREATE DATABASE backend_assessment;
```

4. Run migrations:

```bash
npm run migrate
```

5. Start server:

```bash
npm run dev
```

## API Endpoints

### 1) Create Order

- `POST /orders`
- Payload:

```json
{
  "items": [
    { "sku": "SKU001", "qty": 2 },
    { "sku": "SKU002", "qty": 1 }
  ]
}
```

- Behavior:
  - validates all products exist
  - validates stock availability
  - creates order + order_items
  - deducts stock
  - rolls back entire transaction if any step fails

### 2) Get Orders With Filters

- `GET /orders?status=PENDING&from=2026-04-01&to=2026-04-30&page=1&limit=10`
- Supports:
  - `status` (`PENDING | CONFIRMED | CANCELLED`)
  - date range: `from`, `to`
  - pagination: `page`, `limit`
  - sorting: `created_at DESC`
- Response includes `total_item_count` per order.

### 3) Cancel Order

- `POST /orders/:id/cancel`
- Behavior:
  - only allows orders in `PENDING` or `CONFIRMED`
  - restores product stock quantities
  - updates order status to `CANCELLED`
  - uses transaction and rollback on failure

### Health Check

- `GET /health`

## Notes on Data Consistency & Performance

- Row locking (`FOR UPDATE`) is used on products/order rows during transactional updates.
- Indexes are added for:
  - `orders(status, created_at DESC)`
  - `orders(created_at DESC)`
  - `order_items(order_id)`
  - `products(sku)`
