# Grimorio do Corvo - Central Criativa MTG

Site e plataforma do canal Grimorio do Corvo para organizar conteudo e entregar ferramentas para apoiadores.

## O que ja existe

- Home visual do Grimorio do Corvo.
- Painel editorial privado com temas, status e calendario de publicacao.
- Procurador de cartas com busca em portugues/ingles via Scryfall.
- Analisador de decklists com leitura estruturada.
- Backend Cloudflare Pages Functions com login, sessoes e niveis de acesso.
- Banco Cloudflare D1 para usuarios, sessoes e historico de analises.
- Leitura opcional com IA via OpenAI, sem expor chave no navegador.

## Perfis

- `admin`: acesso total ao sistema do Corvo, incluindo Temas, Cartas e Decks.
- `member`: acesso ao produto para apoiadores, com foco no Analisador de Decks.
- `guest`: ve a entrada do produto e precisa fazer login para usar ferramentas pagas.

## Desenvolvimento local simples

Abra `index.html` no navegador.

Sem backend disponivel, o frontend entra em modo `Adm local` para voce continuar usando o site atual enquanto a migracao para Cloudflare nao termina.

## Backend Cloudflare

O backend fica em `functions/api/[[path]].js` e foi pensado para Cloudflare Pages gratuito com D1.

Principais rotas:

- `GET /api/health`
- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/decks/analyze`
- `GET /api/admin/users`
- `POST /api/admin/users`

Veja o guia completo em `docs/cloudflare-deploy.md`.

## IA

Configure as variaveis no Cloudflare Pages:

- `OPENAI_API_KEY`: chave da OpenAI.
- `OPENAI_MODEL`: opcional. Padrao atual do projeto: `gpt-5`.

Se a chave nao existir, a analise continua funcionando com heuristicas de deck.

## Banco

O schema esta em `db/schema.sql`.

Para criar o primeiro admin, gere o SQL com:

```bash
node scripts/create-password-hash.mjs "sua senha forte" "seu-email@dominio.com" "Adm Corvo"
```

Depois execute o SQL gerado no D1.

## Publicacao atual

O projeto ainda pode ser publicado no GitHub Pages como site visual. Para login real e IA protegida, publique no Cloudflare Pages com Functions e D1.
