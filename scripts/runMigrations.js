const fs = require("fs/promises");
const path = require("path");
const { pool } = require("../src/db/pool");

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGSERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migrationsPath = path.resolve(process.cwd(), "migrations");
    const files = (await fs.readdir(migrationsPath))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1",
        [file]
      );
      if (exists.rowCount) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsPath, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        console.log(`Applied migration: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations()
  .then(() => {
    console.log("Migrations completed successfully.");
  })
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exit(1);
  });
