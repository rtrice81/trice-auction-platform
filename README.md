# Trice Auction Platform

Consignment drop-off scheduling for customers, operations staff, managers, and administrators. It runs as a React Router application on Cloudflare Workers with D1.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Run checks with `npm run typecheck` and `npm run build`.

See [public-beta operations](docs/public-beta.md) for required secrets, local admin bootstrap, fresh-D1 migration testing, production deployment, security review, and the smoke-test checklist.
