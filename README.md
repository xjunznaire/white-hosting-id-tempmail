# White Hosting ID Temporary Mail

A Cloudflare Workers + D1 disposable inbox project with a static frontend, custom/random addresses, configurable domains, EN/ID interface, inbox scrolling, message parsing, and an SVG favicon.

## Important notes

- This source does not add Cloudflare credits or a Cloudflare badge to the UI.
- It uses Cloudflare Workers, D1, and Email Routing. Free plan limits and availability can change; check your Cloudflare dashboard before production use.
- Receiving email requires each domain to be active on Cloudflare Email Routing and the catch-all/routing rule to point to this Worker. Merely adding a domain to the dropdown does not configure inbound mail.
- The app stores inbox messages in D1. Each mailbox can expire after 15 minutes, 1 hour, 6 hours, 12 hours, or 24 hours (24 hours is the default). The interface defaults to English; Indonesian is available with the language toggle. Run a scheduled cleanup or rely on cleanup during mailbox creation; messages may contain private information.
- Temporary email should not be used for banking, identity verification, password recovery, or other sensitive accounts.

## 1. Prerequisites

1. The domains must be active in the same Cloudflare account, with DNS managed by Cloudflare.
2. Install Node.js LTS and npm.
3. Open a terminal in this project folder and run:

```bash
npm install
npx wrangler login
```

## 2. Create D1 database

```bash
npx wrangler d1 create whid-tempmail
```

Copy the returned database ID into `wrangler.toml`, replacing `PASTE_YOUR_D1_DATABASE_ID_HERE`.

Initialize the schema:

```bash
npx wrangler d1 execute whid-tempmail --remote --file=./schema.sql
```

## 3. Test locally

```bash
npm run dev
```

The website/API can be previewed locally, but real inbound email requires the deployed Worker and Email Routing configuration.

## 4. Deploy the Worker and static assets

```bash
npm run deploy
```

The `ASSETS` binding serves the `public/` frontend and the same Worker handles `/api/*` plus inbound `email()` events.

## 5. Connect the custom website domain

In Cloudflare Dashboard:
1. Go to Workers & Pages → `white-hosting-id-tempmail`.
2. Open Settings / Domains & Routes (wording may vary).
3. Add the website custom domain `whtstore.my.id` if available for this Worker.
4. If you prefer `www.whtstore.my.id`, add it as another route/domain and configure redirect if desired.

Do not add a CNAME to the Worker manually if Cloudflare's Custom Domains flow asks to manage DNS automatically.

## 6. Enable inbound email for each email domain

Repeat for `whtstore.my.id`, `shirochan.my.id`, and `kingxjunz.my.id`:

1. Open Email Routing for the domain and enable it.
2. Allow Cloudflare to add the required MX and SPF records. Do not replace unrelated mail records without checking them first.
3. Create a catch-all rule that routes incoming addresses to the deployed Worker `white-hosting-id-tempmail`.
4. Confirm that the route points to the Worker and that the Worker has its D1 binding configured.
5. Send a test message from a different email account to an address created by the site.

Cloudflare Email Routing must support routing to an email Worker for the account/domain. If the dashboard does not offer the Worker as a destination, verify the domain zone, Email Routing setup, and current Cloudflare plan/product availability.

## 7. Domain and address examples

- `tes@whtstore.my.id`
- `halo@shirochan.my.id`
- `x7k29p@kingxjunz.my.id`

The requested example `tes.whtstore.my.id` is a subdomain host, not an email address. For email delivery, use `tes@whtstore.my.id`. If you specifically want `tes@tes.whtstore.my.id`, you must create and configure the `tes.whtstore.my.id` DNS zone/subdomain for email routing too; this project does not create DNS records automatically.

## 8. Cloudflare-only dashboard option

If you do not want to use a local terminal:
- Create the Worker in the Cloudflare dashboard and paste `src/index.js`.
- Add `postal-mime` as a dependency using the supported dashboard editor/deployment workflow, or deploy from Wrangler (recommended for npm dependencies).
- Create D1 and bind it as `DB`.
- Upload the `public/` assets through the Worker's static assets deployment flow.
- Configure the `ASSETS` binding and D1 binding exactly as in `wrangler.toml`.

The most reliable way to deploy this complete project is Wrangler; Cloudflare Pages direct upload does not support Pages Functions in the same way as a build/deploy workflow. This repository uses a single Worker with static assets and an email handler, so Workers is the recommended deployment target.

## API summary

- `GET /api/health`
- `GET /api/domains`
- `POST /api/mailboxes` with `{ "mode":"custom", "local":"tes", "domain":"whtstore.my.id" }`
- `GET /api/inbox/tes%40whtstore.my.id` with `Authorization: Bearer <token>`
- `GET /api/message/<address>/<message-id>` with bearer token
- `DELETE /api/mailboxes/<address>` with bearer token

## Files

- `src/index.js` — Worker API and inbound email handler
- `public/index.html` — site UI
- `public/style.css` — responsive dark UI and scrollable inbox
- `public/app.js` — create address, inbox, EN/ID switch
- `public/favicon.svg` — original favicon
- `schema.sql` — D1 tables/indexes
- `wrangler.toml` — deployment configuration
