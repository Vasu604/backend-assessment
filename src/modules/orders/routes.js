const express = require("express");
const { pool } = require("../../db/pool");
const { createOrder, listOrders, cancelOrder } = require("./service");

const router = express.Router();

router.post("/", async (req, res, next) => {
  const client = await pool.connect();
  try {
    // (iii, vi) Start DB transaction for atomic order creation flow.
    await client.query("BEGIN");
    const order = await createOrder(client, req.body);
    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      data: order,
    });
  } catch (error) {
    // (vi) Any failure during createOrder triggers full rollback.
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

router.get("/", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const result = await listOrders(client, req.query);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
});

router.post("/:id/cancel", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderId = Number.parseInt(req.params.id, 10);
    const order = await cancelOrder(client, orderId);
    await client.query("COMMIT");

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

module.exports = { ordersRouter: router };
