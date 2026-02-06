# Dealshunter

Dealshunter combines a React + TypeScript frontend (Vite) with a set of Python scraping scripts that collect product data and upload it to a Postgres database (Neon).

This README explains how to run the frontend, run the Python scrapers locally, and configure environment variables.

## Repository layout (important files)

- `src/` — React + TypeScript frontend
- `scraping/` — Python scripts used to scrape and upload data
- `scraping/requirements.txt` — Python dependencies for the scrapers
- `src/lib/db.ts` — Database client
- `package.json` — frontend dependencies and scripts

## Prerequisites

- Node.js (recommended: 18+)
- npm or yarn
- Python 3.10+ for the scraping scripts
- A Neon database project for storing product data
- `dotenv` for environment variable management

## Frontend (development)

Install dependencies and run the Vite dev server:

```bash
# from the repository root
npm install
npm run dev
```

Available npm scripts (see `package.json`):

- `dev` — start Vite dev server
- `build` — run `tsc` then `vite build`
- `preview` — preview the production build
- `lint` — run ESLint and attempt to fix issues
- `type-check` — run TypeScript type checks
- `format` — run Prettier to format code

When building for production, use `npm run build`.

### Environment variables for the frontend

This project uses Vite. For runtime configuration, create a file named `.env` in the project root with variables prefixed by `VITE_`. For example:

```
VITE_DATABASE_URL=postgresql://user:password@ep-host.region.aws.neon.tech/dbname?sslmode=require
```

## Python scrapers

The `scraping/` folder contains Python scripts used to fetch product data and upload it to the database. To run them locally:

```bash
# create and activate a virtualenv
python3 -m venv .venv
source .venv/bin/activate

# install dependencies
pip install -r scraping/requirements.txt

# run a script (example)
uv run scraping/scrape_and_upload_all.py
```
```

## Running common tasks

- Install deps: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Format: `npm run format`
- Lint: `npm run lint`
- Run scrapers: see Python instructions above