# Deploy no Cloudflare Pages com D1

Este projeto foi desenhado para rodar no plano gratuito da Cloudflare usando:

- Cloudflare Pages para o frontend.
- Pages Functions para o backend em `functions/api/[[path]].js`.
- Cloudflare D1 para usuarios, sessoes e historico de analises.

## 1. Criar o banco D1

No terminal, com Wrangler configurado:

```bash
npx wrangler d1 create site-corvo
```

Guarde o `database_id` retornado.

## 2. Aplicar o schema

```bash
npx wrangler d1 execute site-corvo --file db/schema.sql
```

## 3. Criar o admin inicial do jeito facil

No Cloudflare Pages, configure estas variaveis de ambiente:

- `CORVO_ADMIN_EMAIL`: email do admin.
- `CORVO_ADMIN_PASSWORD`: senha inicial do admin.

Quando esse email fizer login pela primeira vez, o backend cria automaticamente o usuario `admin` no D1 e salva a senha com hash.

Depois do primeiro login funcionar, remova `CORVO_ADMIN_PASSWORD` das variaveis do Cloudflare ou troque a senha por outra que nao tenha sido compartilhada.

### Alternativa manual

Se quiser gerar SQL manualmente:

```bash
node scripts/create-password-hash.mjs "uma senha forte" "seu-email@dominio.com" "Adm Corvo"
```

Depois rode o `INSERT` gerado no console do D1.

## 4. Configurar o Pages

No painel da Cloudflare:

1. Crie um projeto em Pages apontando para o repositorio `site-corvo`.
2. Build command: deixe vazio.
3. Output directory: `/` ou raiz do projeto.
4. Em Functions > D1 bindings, adicione:
   - Binding name: `DB`
   - Database: `site-corvo`
5. Em Environment variables, adicione se for usar IA:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` opcional, por exemplo `gpt-5`

## 5. Configuracao local opcional

Copie `wrangler.example.toml` para `wrangler.toml` e troque o `database_id`.

`wrangler.toml` esta no `.gitignore` para nao vazar configuracao local.

## 6. Liberar membros manualmente

No MVP, a liberacao do Catarse pode ser manual. Entre como admin e use a rota:

```http
POST /api/admin/users
```

Corpo exemplo:

```json
{
  "email": "membro@email.com",
  "displayName": "Nome do Membro",
  "password": "senha inicial",
  "role": "member",
  "plan": "catarse",
  "planStatus": "active",
  "catarseTier": "R$15"
}
```

Depois podemos criar uma tela admin para isso e, se o Catarse oferecer uma forma confiavel, automatizar a sincronizacao.

## Observacao sobre Django

Django e uma boa escolha quando existe um servidor Python persistente. No plano gratuito da Cloudflare, o caminho mais direto e Pages Functions + D1. Se no futuro voce quiser Django, da para mover o backend para um host como Render, Railway ou Fly e manter o frontend no Cloudflare.
