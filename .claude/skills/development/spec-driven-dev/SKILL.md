---
description: >
  Spec-driven development discipline for non-trivial changes to a deployed codebase:
  the spec is the durable artifact, code is its regenerable output, and the work moves
  through four gated phases (spec, plan, implement, verify). Use when starting any
  feature or non-trivial change, or when a change touches a production system such as
  payments, analytics, email, auth, data pipelines, or third-party APIs. Not for
  one-line fixes, typo edits, dependency bumps, docs, or content work.
user-invocable: true
version: 2.1.0
---

# Spec-Driven Development

The discipline, adopted as a pattern rather than a framework: for code work on a
deployed system, **write the spec as the source of truth, treat the code as a
regenerable output, and drive the work through gated phases.** This reduces the single
most expensive failure mode: a badly-scoped ship that breaks payments, data integrity,
or customer trust because the change was never thought through end-to-end.

**Category**: Software Development

## When this applies

- Any new feature or non-trivial change to a deployed codebase.
- Any change touching a production system: payments, analytics, email, deploys, data
  pipelines, auth, customer-facing UX, third-party APIs, anti-abuse.

## When it does NOT apply

- One-line fixes, typo/copy edits, dependency bumps, docs, content work. Don't
  ceremony-tax trivial changes.

## The four gated phases

### Phase 1: SPEC (the durable artifact)

Write a short spec BEFORE touching code. It is the source of truth; if code and spec
disagree later, the spec is what gets reconciled. Keep it tight (half a page is fine):

- **Goal / user outcome**: what changes for the user, in one sentence.
- **Scope**: what's in, what's explicitly out.
- **Contracts touched**: which inputs/outputs/data shapes/APIs/events this reads or
  writes, and what downstream consumes them.
- **Invariants**: what must stay true (e.g. "every paid order writes exactly one
  database row"; "attribution events fire once and only once").
- **Acceptance checks**: the concrete, observable signals that prove it works (a metric,
  a dashboard, an HTTP code, a row appearing). This is what Phase 4 verifies against.
- **Rollback**: how to revert, and whether the revert is idempotent.

Store the spec where the work lives (a `SPEC.md`, a plan file, or the PR description).

### Phase 2: PLAN

Turn the spec into a step list: the files and functions to change, the order, and the
risk points. Walk the standard risk dimensions and note the answer for each that
applies to THIS change: downstream consumers, race conditions, persistence, scale,
edge cases, rollback, measurement, concurrency, compliance. If any answer is "I'm not
sure", investigate BEFORE implementing, not after shipping.

### Phase 3: IMPLEMENT

Build to the plan. If reality forces a deviation from the spec, update the SPEC first,
then the code. Never let the code silently diverge from the source of truth. Small,
reviewable steps.

### Phase 4: VERIFY (the exit gate)

Before shipping, re-walk the Phase 2 risk dimensions as a final audit. Then confirm
each Phase 1 acceptance check actually fires in reality: not "it compiles", but the
metric, row, status code, or dashboard the spec named. Only then deploy, via the
project's deploy workflow, never a bare push to production. After deploy, watch the
acceptance signal to confirm success versus silent failure. (`/verify` and `/prove`
are the shipped commands for closing this loop with real command evidence.)

## Why spec-first

- The spec makes the contracts and invariants explicit, which is exactly where
  expensive ships break: a downstream consumer you forgot, a race with a deferred
  script, a webhook that fires zero times or twice.
- The spec is cheap to change; code is expensive to change after it ships.
  Front-loading the thinking is the highest-leverage point in the lifecycle.
- The acceptance checks turn "I think it works" into "here is the signal that proves
  it", which is the difference between shipping and hoping.

## One-line summary

Spec is truth, code is output; think the contracts and invariants through up front,
prove the acceptance signal fires, and the final pre-ship audit becomes a confirmation
rather than a rescue.
