# Dealshunter

Dealshunter combines a React + TypeScript frontend (Vite) with a set of Python scraping scripts that collect product data and upload it to a Supabase backend.

This README explains how to run the frontend, run the Python scrapers locally, and configure environment variables.

## Repository layout (important files)

- `src/` — React + TypeScript frontend
- `scraping/` — Python scripts used to scrape and upload data
- `scraping/requirements.txt` — Python dependencies for the scrapers
- `src/lib/supabase.ts` — Supabase client (currently contains a hard-coded key; see Security below)
- `package.json` — frontend dependencies and scripts

## Prerequisites

- Node.js (recommended: 18+)
- npm or yarn
- Python 3.10+ for the scraping scripts
- A Supabase project (url + key) for uploading and storing scraped data

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

This project uses Vite. For runtime configuration, create a file named `.env.local` (or `.env`) in the project root with variables prefixed by `VITE_`. For example:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-or-service-key
```

Recommended change: `src/lib/supabase.ts` currently contains a hard-coded Supabase URL and key. Replace that with a client that reads from `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_KEY` (or set them as runtime environment variables) to avoid committing secrets.

Example `src/lib/supabase.ts` snippet using Vite env:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

## Python scrapers

The `scraping/` folder contains Python scripts used to fetch product data and upload it to Supabase. To run them locally:

```bash
# create and activate a virtualenv
python3 -m venv .venv
source .venv/bin/activate

# install dependencies
pip install -r scraping/requirements.txt

# run a script (example)
python scraping/scrape_and_upload_all.py
```

Run tests for the scrapers with `pytest` (there is at least one test in `scraping/test_map_product_to_taxonomy.py`):

```bash
pytest scraping/test_map_product_to_taxonomy.py
```

## Running common tasks

- Install deps: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Format: `npm run format`
- Lint: `npm run lint`
- Run scrapers: see Python instructions above

## Contributing

Contributions are welcome. Please open issues or pull requests. For changes that touch credentials or deployment, ensure secrets are not committed.

## License

Add your preferred license here (e.g. MIT). If you want, I can add a `LICENSE` file.

---

If you'd like, I can:

- Update `src/lib/supabase.ts` to read credentials from Vite env variables and remove the hard-coded key.
- Add a `.env.example` file and update `.gitignore` to ignore env files.

Tell me which of these you'd like me to do next.
