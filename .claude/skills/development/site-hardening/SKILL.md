---
description: >
  Production-readiness hardening pass for a Next.js web project: SEO structured data
  and meta tags, API and security-header hardening, accessibility, and launch polish,
  as four phased checklists with copy-paste patterns. Use when a build reaches
  functional completion, before launch, or when the user says "harden", "optimize",
  "production-ready", "best practices", or "ship it". Not for generic code review
  (use code-review-checklist) or a pure security diff pass (use security-review).
user-invocable: true
version: 2.1.0
---

# Site Hardening & Optimization

Production-readiness checklist for any Next.js web project. Run after core features are
built, before launch, or as a hardening pass on a live site.

**Category**: Software Development

## Phase 1: SEO

### Structured Data (JSON-LD)
- [ ] `Organization` schema in root layout (name, url, logo, sameAs social links)
- [ ] `Product` schema on product/pricing pages (name, description, offers with price + currency)
- [ ] `FAQPage` schema if an FAQ section exists (question/answer pairs)
- [ ] Page-specific schemas where relevant (`Article`, `SoftwareApplication`, etc.)
- [ ] JSON-LD rendered in a server component, never in `"use client"` files
- [ ] Validate at https://search.google.com/test/rich-results

**Pattern: reusable JSON-LD component**
```tsx
// src/components/json-ld.tsx (server component, no "use client")
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

### Meta Tags
- [ ] `metadataBase` set in root layout (resolves relative OG URLs)
- [ ] `title` + `description` on every page (root layout default + page overrides)
- [ ] `keywords` array (8-15 relevant terms)
- [ ] `openGraph` object: title, description, url, siteName, type, images
- [ ] `twitter` object: card ("summary_large_image"), title, description
- [ ] Per-page metadata exports where content differs from root

### Dynamic OG Images
- [ ] `opengraph-image.tsx` route handler for dynamic pages (share pages, blog posts)
- [ ] Uses `next/og` `ImageResponse` with `runtime = "edge"`
- [ ] Branded design (logo, colors, typography matching the site)
- [ ] Size: 1200x630 for universal compatibility

### Manifest & Indexing
- [ ] `manifest.ts` route handler (name, short_name, icons, theme_color, background_color, display)
- [ ] `robots.ts` with sitemap reference: `sitemap: "https://domain.com/sitemap.xml"`
- [ ] `sitemap.ts` if the site has dynamic routes (pull slugs from the database)

## Phase 2: Security

### API Route Hardening
- [ ] **Webhook verification**: All webhook endpoints verify signatures (Svix, Stripe signatures, etc.). Graceful degradation in dev when no secret is configured.
- [ ] **Rate limiting on abuse-prone endpoints**: Counters, code validation, contact forms. Pattern: in-memory Map with IP keying + cooldown window + stale entry eviction.
- [ ] **Remove unauthenticated write endpoints**: Audit every PATCH/PUT/DELETE. If it has no auth, remove it or add auth.
- [ ] **Strip internal data from responses**: Never expose pipeline internals, raw DB fields, or processing metadata in public API responses. Return only customer-facing display fields.
- [ ] **Input validation**: Validate all request bodies. Type check, length limits, required fields.

**Pattern: in-memory rate limiter**
```typescript
const rateLog = new Map<string, number>();
const COOLDOWN_MS = 5_000;

// In handler:
const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const key = `${ip}:${identifier}`;
const last = rateLog.get(key) ?? 0;
if (Date.now() - last < COOLDOWN_MS) {
  return NextResponse.json({ ok: true }); // Accept silently, don't count
}
rateLog.set(key, Date.now());
// Evict stale entries periodically
if (rateLog.size > 10_000) {
  const cutoff = Date.now() - COOLDOWN_MS * 2;
  for (const [k, v] of rateLog) { if (v < cutoff) rateLog.delete(k); }
}
```

**Pattern: Svix webhook verification**
```typescript
import { Webhook } from "svix";
const wh = new Webhook(process.env.WEBHOOK_SECRET!);
const body = await req.text();
wh.verify(body, {
  "svix-id": req.headers.get("svix-id")!,
  "svix-timestamp": req.headers.get("svix-timestamp")!,
  "svix-signature": req.headers.get("svix-signature")!,
});
```

### Security Headers (next.config.ts)
- [ ] `Content-Security-Policy`: default-src 'self', script-src, style-src, img-src, connect-src
- [ ] `X-Frame-Options`: DENY (or SAMEORIGIN if embedding is needed)
- [ ] `X-Content-Type-Options`: nosniff
- [ ] `Referrer-Policy`: strict-origin-when-cross-origin
- [ ] `Strict-Transport-Security`: max-age=63072000; includeSubDomains; preload
- [ ] `Permissions-Policy`: camera=(), microphone=(), geolocation=()

**Pattern: next.config.ts headers**
```typescript
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ],
  }];
}
```

### Auth & Secrets
- [ ] No API keys, tokens, or secrets in client-side code
- [ ] No secrets in the `next.config.ts` `env:` block (it leaks to the client bundle)
- [ ] `.env.local` gitignored
- [ ] Admin routes require authentication (Bearer token, session, etc.)

## Phase 3: Accessibility

### Navigation & Structure
- [ ] Skip-to-content link (sr-only, visible on focus) as first child of body/main wrapper
- [ ] `<nav>` with `aria-label="Main navigation"`
- [ ] Logo/home link with `aria-label="[Brand] home"`
- [ ] `<main>` wrapping page content
- [ ] `<footer>` with `role="contentinfo"`
- [ ] Semantic heading hierarchy (one h1 per page, h2/h3 nested correctly)

**Pattern: skip link**
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg">
  Skip to content
</a>
// ... later:
<section id="main-content">
```

### Decorative Elements
- [ ] All decorative emojis wrapped in `<span aria-hidden="true">`
- [ ] Decorative SVGs/icons have `aria-hidden="true"` on the container
- [ ] Decorative images use empty `alt=""`

### Forms & Interactions
- [ ] Every input/textarea has a `<label>` with matching `htmlFor`/`id`
- [ ] Buttons use `<button>` not `<a href="#">` (semantic action elements)
- [ ] Disabled states use the `disabled` attribute (not just visual styling)
- [ ] Form submission buttons have explicit `type="submit"` or `type="button"`
- [ ] Error messages linked to inputs via `aria-describedby`

### Interactive Content
- [ ] Audio/video players have accessible controls (play/pause labels)
- [ ] Focus management for modal/dialog open/close
- [ ] Color contrast ratio at least 4.5:1 for normal text, 3:1 for large text

## Phase 4: Polish & UX

### Error States
- [ ] Custom 404 page (`not-found.tsx`): branded, with CTAs back to key pages
- [ ] Custom error page (`error.tsx`): friendly message, retry button
- [ ] Loading states for async operations (skeletons or spinners)

### Performance
- [ ] Images use `next/image` with appropriate sizing
- [ ] Fonts loaded via `next/font` (no layout shift)
- [ ] No unnecessary `"use client"`: keep components server-side where possible
- [ ] Dynamic imports for heavy components (`next/dynamic`)

### Mobile
- [ ] Responsive at 375px, 768px, 1024px, 1440px breakpoints
- [ ] Touch targets at least 44x44px
- [ ] No horizontal scroll at any viewport

## Execution Order

1. **SEO**: highest ROI, affects discoverability immediately
2. **Security**: protects data and prevents abuse
3. **Accessibility**: legal compliance + broader audience
4. **Polish**: professional finish

For each phase, work through the checklist, make all changes locally, then commit and
deploy as a single batch. Verify against the dev server before pushing.

## Verification

After deploying:
- Run a Lighthouse audit (target: 90+ on all four scores)
- Test rich results: https://search.google.com/test/rich-results
- Test OG tags: https://www.opengraph.xyz/
- Manual screen reader test on key flows (VoiceOver on Mac: Cmd+F5)
- Check security headers: https://securityheaders.com/
