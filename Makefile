-include .env
export

LOCAL_DB_URL := postgresql://postgres:postgres@localhost:5433/breed_club

.PHONY: up down dev dev-all db-migrate db-setup db-seed db-reset use-local-db dev-neon

# ─── Docker ───────────────────────────────────────────────
up:                        ## Start local PostgreSQL
	docker compose up -d
	@until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
	@echo "PostgreSQL ready on :5432"

down:                      ## Stop local PostgreSQL
	docker compose down

# ─── Database ─────────────────────────────────────────────
db-migrate:                ## Run migrations against local PG
	cd api && DATABASE_URL=$(LOCAL_DB_URL) npx drizzle-kit migrate

db-setup: db-migrate       ## Migrate + create club + seed (fresh start)
	cd api && DATABASE_URL=$(LOCAL_DB_URL) CLUB_SLUG=wssca npx tsx src/db/setup-club.ts \
		--name "White Swiss Shepherd Club of America" --slug wssca --breed "White Swiss Shepherd Dog"
	cd api && DATABASE_URL=$(LOCAL_DB_URL) CLUB_SLUG=wssca npx tsx src/db/seed.ts

db-seed:                   ## Seed reference data
	cd api && DATABASE_URL=$(LOCAL_DB_URL) CLUB_SLUG=wssca npx tsx src/db/seed.ts

db-reset: down             ## Wipe local PG and start fresh
	docker compose down -v && docker compose up -d
	@until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
	$(MAKE) db-setup

# ─── Dev Vars ─────────────────────────────────────────────
use-local-db:              ## Point wrangler .dev.vars at local PG
	cp api/.dev.vars.local api/.dev.vars
	@echo "Switched to local DB. Restart wrangler if running."

# ─── Dev Servers ──────────────────────────────────────────
dev:                       ## Start API + App
	npm run dev

dev-all:                   ## Start Hugo + App + API (full local stack)
	npx --yes concurrently --names "hugo,app,api" --prefix-colors "magenta,cyan,yellow" \
		"cd ../web && hugo server -D --environment local" \
		"npm run dev:app" \
		"npm run dev:api"

dev-neon:                  ## Run the API against Neon (neon-serverless WebSocket pool)
	@test -n "$(NEON_DB_URL)" || (echo "Set NEON_DB_URL in .env or env"; exit 1)
	cd api && USE_NEON_DRIVER=true DATABASE_URL=$(NEON_DB_URL) npx wrangler dev
