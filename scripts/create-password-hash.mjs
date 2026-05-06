import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";

const PASSWORD_ITERATIONS = 100000;
const password = process.argv[2];
const email = process.argv[3] || "seu-email@exemplo.com";
const displayName = process.argv[4] || "Adm Corvo";

if (!password) {
  console.error("Uso: node scripts/create-password-hash.mjs \"senha forte\" [email] [nome]");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), PASSWORD_ITERATIONS, 32, "sha256").toString("hex");
const now = new Date().toISOString();
const id = randomUUID();
const safeEmail = email.trim().toLowerCase().replaceAll("'", "''");
const safeName = displayName.replaceAll("'", "''");

console.log("Salt:", salt);
console.log("Hash:", hash);
console.log("Iteracoes:", PASSWORD_ITERATIONS);
console.log("\nSQL para criar ou atualizar o admin inicial:\n");
console.log(`INSERT INTO users (id, email, display_name, role, plan, plan_status, catarse_tier, paid_until, password_salt, password_hash, created_at, updated_at)
VALUES ('${id}', '${safeEmail}', '${safeName}', 'admin', 'corvo', 'active', 'admin', '', '${salt}', '${hash}', '${now}', '${now}')
ON CONFLICT(email) DO UPDATE SET
  display_name = '${safeName}',
  role = 'admin',
  plan = 'corvo',
  plan_status = 'active',
  catarse_tier = 'admin',
  paid_until = '',
  password_salt = excluded.password_salt,
  password_hash = excluded.password_hash,
  updated_at = excluded.updated_at;`);
