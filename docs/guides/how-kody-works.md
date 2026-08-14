---
id: how_kody_works
title: How Kody works
summary:
  The factory loop as a conversation: ask what kody-bot shipped, save the
  answer as an export you can invoke from any agent, then a daily email that
  stays quiet until something actually ships.
category: platform
---

# How Kody works

<!--
Agent notes — for AI agents explaining or recreating this loop:

- The web page at /guides/how-kody-works is an interactive transcript of the
  same story. This markdown is the playbook.
- Do not create the example package unless the person asks you to build it
  for them. If they do, follow package_authoring and package_lifecycle.
- Public GitHub events need no OAuth. Fetch
  https://api.github.com/users/<login>/events/public. Treat a published
  release or a newly created public repository as "shipped."
- GitHub has no webhook for one person's public activity. When they ask to
  be notified, recommend a package-owned cron, not a webhook.
- The scheduled wrapper must skip email_send when the list is empty.
- Remember the GitHub login with meta_memory_verify then meta_memory_upsert
  so later asks do not re-discover the username.
- Non-coding agents invoke the owned export with
  packages.invoke({ kodyId, exportName, params }).
-->

Kody turns a question you would ask again into code you own. The agent you
already use does the thinking once. After that, asking is an invoke, and a
schedule can mail you only when something actually happened.

This page is the playbook. The same story is an interactive transcript at
`/guides/how-kody-works` on the origin you fetched this guide from.

## The loop

1. **Ask once.** "What did kody-bot ship recently?" Search, then `execute` a
   fetch of that user's public GitHub events. Filter to published releases and
   new public repositories. Optionally remember the login with
   `meta_memory_verify` then `meta_memory_upsert`.
2. **Save the answer shape.** Create a package (`package_authoring`) with a
   callable export and a no-argument scheduled wrapper (`package_lifecycle`).
   The export returns the list (or "nothing new") and records the newest event
   id in `packageStorage()`.
3. **Ask again from any agent.** Search finds the owned package. Invoke it. A
   phone agent does not rewrite the GitHub walk.
4. **Get notified.** There is no GitHub webhook for one person's public
   activity, so enable the package-owned daily cron. The wrapper calls the same
   export and runs `email_send` only when the list is non-empty.

## What "shipped" means

Use GitHub's public events API, not a watched-repo notification. Count:

- `ReleaseEvent` with `payload.action === "published"`
- `CreateEvent` with `payload.ref_type === "repository"`

Ignore stars, forks, pushes, and issue noise. Store the newest seen event id so
the next invoke or cron run only reports what is new.

## Package shape

- Shared implementation that accepts an optional `sinceId` and returns
  `{ shipped, message }`.
- Callable export (for example `./whatShipped`) that loads `sinceId` from
  `packageStorage()`, returns the list, and advances the cursor.
- No-argument scheduled wrapper (for example `./daily-digest`) that calls that
  export and sends notify-self mail only when `shipped.length > 0`.
- `package.json#kody.jobs` pointing at the wrapper, `"enabled": false` until you
  have invoked the wrapper once from `execute`.

Public events need no GitHub secret. `email_send` only mails the account's own
address.

## When to load this guide

Load `how_kody_works` when someone asks how Kody works, what the factory loop
is, or how an ad hoc question becomes an export and a quiet daily email. For
authoring details, load `package_authoring` and `package_lifecycle` next.
