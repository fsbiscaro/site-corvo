import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2];
const email = process.argv[3] || "seu-email@exemplo.com";
const displayName = process.argv[4] || "Adm Corvo";

if (!password) {
  console.error("Uso: node scripts/create-password-hash.mjs \"senha forte\" [email] [nome]");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), 210000, 32, "sha256").toString("hex");
const now = new Date().toISOString();
const id = crypto.randomUUID();
const safeName = displayName.replaceAll("'", "''");

console.log("Salt:", salt);
console.log("Hash:", hash);
console.log("\nSQL para criar o admin inicial:\n");
console.log(`INSERT INTO users (id, email, display_name, role, plan, plan_status, catarse_tier, paid_until, password_salt, password_hash, created_at, updated_at)
VALUES ('${id}', '${email.toLowerCase()}', '${safeName}', 'admin', 'corvo', 'active', 'admin', '', '${salt}', '${hash}', '${now}', '${now}');`);
