// Готовит изолированную тестовую БД messengo_test (создаёт при отсутствии,
// применяет миграции) и запускает против неё интеграционные тесты.
// Запуск: bun run test:integration (требуется поднятый db из docker-compose).
import { Client } from "pg";

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) throw new Error("DATABASE_URL is required (см. .env)");

const testDatabaseName = "messengo_test";
const toUrl = (database: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

const admin = new Client({ connectionString: toUrl("postgres") });
await admin.connect();
try {
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDatabaseName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${testDatabaseName}`);
} finally {
  await admin.end();
}

const repoRoot = `${import.meta.dir}/..`;
const testEnv = { ...process.env, DATABASE_URL: toUrl(testDatabaseName) };

const deploy = Bun.spawnSync(["bun", "x", "prisma", "migrate", "deploy"], {
  cwd: repoRoot,
  env: testEnv,
  stdout: "inherit",
  stderr: "inherit",
});
if (deploy.exitCode !== 0) process.exit(deploy.exitCode ?? 1);

const tests = Bun.spawnSync(["bun", "test", "tests/integration"], {
  cwd: repoRoot,
  env: testEnv,
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(tests.exitCode ?? 1);
