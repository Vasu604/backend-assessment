const express = require("express");
const { healthRouter } = require("./modules/health/routes");
const { ordersRouter } = require("./modules/orders/routes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(express.json());

app.use("/health", healthRouter);
app.use("/orders", ordersRouter);

app.use((req, _res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
});

app.use(errorHandler);

module.exports = { app };
