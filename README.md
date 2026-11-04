# KernCRM

CRM voor kozijnbedrijven. Zie `CLAUDE.md` en `docs/ontwerp.md`.

## Lokaal draaien
```bash
npm install
npm run dev
```

## Database
Migraties staan in `supabase/migrations` (RLS op elke tabel). De RLS-controle staat in `supabase/tests/rls_basis.sql`.
