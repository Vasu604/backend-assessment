const { z } = require("zod");

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        qty: z.int().positive(),
      })
    )
    .min(1),
});

const listOrdersSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]).optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().date().optional()),
  to: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().date().optional()),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function makeOrderNumber() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${stamp}-${rand}`;
}

function normalizeDate(value, isEnd) {
  if (!value) return null;
  if (value.includes("T")) return new Date(value);
  return new Date(`${value}${isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z"}`);
}

async function createOrder(client, payload) { 
  const parsed = createOrderSchema.safeParse(payload); // (i) Validate payload schema.
  if (!parsed.success) {
    throw new AppError("Invalid payload for create order", 400);
  }

  const skuQtyMap = new Map();
  for (const item of parsed.data.items) {
    skuQtyMap.set(item.sku, (skuQtyMap.get(item.sku) || 0) + item.qty);
  }

  const skus = [...skuQtyMap.keys()];
  // (i) Load and lock requested products so existence/stock checks are consistent.
  const productsResult = await client.query(
    `SELECT id, sku, name, stock_qty, price
     FROM products
     WHERE sku = ANY($1)
     FOR UPDATE`,
    [skus]
  );

  const productsBySku = new Map(productsResult.rows.map((p) => [p.sku, p]));
  // (i) Validate every requested SKU exists.
  for (const sku of skus) {
    if (!productsBySku.has(sku)) {
      throw new AppError(`Product does not exist for sku: ${sku}`, 404);
    }
  }

  // (ii) Validate available stock for each requested SKU.
  for (const [sku, qty] of skuQtyMap.entries()) {
    const product = productsBySku.get(sku);
    if (product.stock_qty < qty) {
      throw new AppError(`Insufficient stock for sku: ${sku}`, 400);
    }
  }

  const orderNumber = makeOrderNumber();
  let totalAmount = 0;
  // (v) Calculate order total from current unit prices and requested quantities.
  for (const [sku, qty] of skuQtyMap.entries()) {
    const product = productsBySku.get(sku);
    totalAmount += Number(product.price) * qty;
  }

  // (iv) Insert order header first. - response to client
  const orderResult = await client.query(
    `INSERT INTO orders (user_id, order_number, status, total_amount)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, order_number, status, total_amount, created_at`,
    [1, orderNumber, "PENDING", totalAmount]
  );

  const order = orderResult.rows[0];
  for (const [sku, qty] of skuQtyMap.entries()) {
    const product = productsBySku.get(sku);
    // (iv) Insert each order item row. - order_items table
    await client.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
       VALUES ($1, $2, $3, $4)`, // values for order_items table - ${order.id}
      [order.id, product.id, qty, product.price]
    );

    // (iii) Deduct stock for each product inside the same transaction.
    await client.query(
      `UPDATE products
       SET stock_qty = stock_qty - $1
       WHERE id = $2`,
      [qty, product.id]
    );
  }

  return order;
}

async function listOrders(client, query) {
  const parsed = listOrdersSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("Invalid query parameters", 400);
  }

  // (b) Pagination inputs: page and limit.
  const { status, from, to, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const where = [];
  const values = [];

  // (a.i) Filter by status.
  if (status) {
    values.push(status);
    where.push(`o.status = $${values.length}`);
  }

  // (a.ii) Filter by date range (from/to) on created_at.
  const fromDate = normalizeDate(from, false);
  const toDate = normalizeDate(to, true);

  if (fromDate) {
    values.push(fromDate);
    where.push(`o.created_at >= $${values.length}`);
  }

  if (toDate) {
    values.push(toDate);
    where.push(`o.created_at <= $${values.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // (b.i, b.ii) Apply pagination using LIMIT and OFFSET.
  values.push(limit);
  values.push(offset);

  const queryResult = await client.query(
    `SELECT
       o.id,
       o.user_id,
       o.order_number,
       o.status,
       o.total_amount,
       o.created_at,
       -- (d) Include total item count per order in response payload.
       COALESCE(SUM(oi.quantity), 0) AS total_item_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ${whereClause}
     GROUP BY o.id
     -- (c.i) Sorting by created_at descending.
     ORDER BY o.created_at DESC
     LIMIT $${values.length - 1}
     OFFSET $${values.length}`,
    values
  );

  const countValues = values.slice(0, values.length - 2);
  const countResult = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM orders o
     ${whereClause}`,
    countValues
  );

  return {
    page,
    limit,
    total: countResult.rows[0].count,
    orders: queryResult.rows.map((row) => ({
      ...row,
      total_item_count: Number(row.total_item_count),
    })),
  };
}

async function cancelOrder(client, orderId) {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new AppError("Order id must be a positive integer", 400);
  }

  const orderResult = await client.query(
    `SELECT id, status
     FROM orders
     WHERE id = $1
     FOR UPDATE`,
    [orderId]
  );

  if (!orderResult.rowCount) {
    throw new AppError("Order not found", 404);
  }

  const order = orderResult.rows[0];
  if (order.status === "CANCELLED") {
    throw new AppError("Order is already cancelled", 400);
  }
  // Only PENDING or CONFIRMED orders are allowed to be cancelled.
  if (!["PENDING", "CONFIRMED"].includes(order.status)) {
    throw new AppError("Only PENDING or CONFIRMED orders can be cancelled", 400);
  }
 
  const itemsResult = await client.query(
    `SELECT product_id, quantity
     FROM order_items
     WHERE order_id = $1`,
    [orderId]
  );

  // Restore stock quantities (this runs inside route-level BEGIN/COMMIT transaction).
  for (const item of itemsResult.rows) {
    await client.query(
      `UPDATE products
       SET stock_qty = stock_qty + $1
       WHERE id = $2`,
      [item.quantity, item.product_id]
    );
  }

  const updatedOrder = await client.query(
    `UPDATE orders
     SET status = 'CANCELLED'
     WHERE id = $1
     RETURNING id, user_id, order_number, status, total_amount, created_at`,
    [orderId]
  );

  return updatedOrder.rows[0];
}

module.exports = {
  AppError,
  createOrder,
  listOrders,
  cancelOrder,
};
