const { app } = require("./app");
const { env } = require("./config/env");
const { pool } = require("./db/pool");

const server = app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Closing resources...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
