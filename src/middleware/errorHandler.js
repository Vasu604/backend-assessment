function errorHandler(err, _req, res, _next) {
  const status = err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    error: message,
  });
}

// export error handler
module.exports = { errorHandler };
