const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function getEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  port: Number(getEnv("PORT", 3000)),
  db: {
    host: getEnv("DB_HOST", "localhost"),
    port: Number(getEnv("DB_PORT", 5432)),
    user: getEnv("DB_USER", "postgres"),
    password: getEnv("DB_PASSWORD", "postgres"),
    database: getEnv("DB_NAME", "backend_assessment"),
  },
};

module.exports = { env };
