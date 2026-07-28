---
name: pr-review-triage
description: Review a pull request in this repo, then triage every finding — fix what belongs to the PR, file a deduplicated GitHub issue for what doesn't, post the review, and update the project board. Use when asked to review a PR, "run code review on PR N", "review and fix", or when finishing a PR before merge.
---

# PR review & finding triage

Reviews a PR **and closes the loop on every finding** — nothing gets noticed and dropped.
The governing rule: **a finding either gets fixed in this PR or becomes a tracked issue. Never neither.**

Takes a PR number. If none given, use the PR for the current branch (`gh pr view --json number`).

## Repo constants

| Thing | Value |
|---|---|
| Repo | `Oreginal/GuardianCheck` |
| Project | `GuardianCheck Discoverability Initiative` (number `2`, `PVT_kwHOBu0XKc4BeqeG`) |
| Status field | `PVTSSF_lAHOBu0XKc4BeqeGzhZC-5o` |
| Status options | Backlog `7679e51c` · Ready `f3d28f1f` · In Progress `e12b98a7` · In Review `8fc96ae8` · Blocked `b7733c1b` · Done `f79d269b` |

Re-derive with `gh project field-list 2 --owner "@me" --format json` if a call 404s.

---

## Step 1 — Gather context before reading the diff

```bash
gh pr view N --json title,body,state,mergeable,headRefName,statusCheckRollup
gh pr diff N
gh api repos/Oreginal/GuardianCheck/pulls/N/reviews    --jq '.[]|{u:.user.login,s:.state,b:.body[:300]}'
gh api repos/Oreginal/GuardianCheck/pulls/N/comments   --jq '.[]|{u:.user.login,p:.path,l:.line,b:.body[:300]}'
```

Read the **linked issue** (`Closes #N` in the PR body) before judging the diff. Half of review is "does this actually satisfy what was asked", which you cannot assess without the acceptance criteria.

CodeRabbit is installed on this repo. Check whether it already reviewed — engage with its findings rather than silently duplicating or contradicting them.

## Step 2 — Review

Read the changed lines **and the block around them**. Prioritise, in order:

1. **Correctness** — does it do what the issue asked, completely?
2. **Unverified claims** — see Step 3.
3. **Consistency** — does the change agree with how the rest of the codebase already does this?
4. **Scope** — did the PR quietly widen or narrow the issue?

## Step 3 — Verify claims, never relay them

This is where the value is. A PR asserting "pure string change, no behavioural risk" is a **hypothesis to test**, not a fact to repeat.

- **Changed a value?** Grep for every consumer before calling it safe. A display string and an identifier look identical in a diff.
- **Changed build output?** Build and inspect the artefact — do not infer it from the source diff.
- **Changed a served file?** Request it over HTTP. Vercel preview deployments on this repo sit behind SSO and return `302` to anonymous curl, so build locally and serve `dist/` instead:
  ```bash
  npx vite build && npx vite preview --port 4317 &
  curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:4317/PATH
  ```
- **Always** run `npm run lint` (`tsc --noEmit`).

State in the review *how* you verified, and paste the output. "Confirmed, not assumed" is the standard.

## Step 4 — Triage each finding

Classify every finding into exactly one bucket:

| Bucket | Test | Action |
|---|---|---|
| **In scope** | Caused by this PR, **or** inside the issue's stated Scope | Fix on the branch, push, note it in the review |
| **Unrelated** | Pre-existing, or outside the issue's Scope | Dedupe (Step 5) → file an issue, or attach to an existing one |
| **Nit** | Correct-but-stylistic, no behavioural or signal impact | Mention in the review only. Do not file. |

Do not fix unrelated findings on the branch. It inflates a small PR's blast radius and detaches the diff from its issue — especially costly here, where issues are explicitly *single-PR scoped*. Say so in the review when you decline.

## Step 5 — Dedupe before filing. Always.

**This repo has a 40+ issue pre-planned backlog and a source audit. Most "findings" are already tracked.** Filing a duplicate is worse than not filing.

Check all three:

```bash
gh issue list --state all --limit 100 --json number,title,body \
  --jq '.[]|select(.title+.body|test("KEYWORD";"i"))|{number,title}'
grep -n -i "KEYWORD" report.md roadmap.md epics.md github_issues.md
gh issue view <candidate> --json body --jq .body   # read its Scope section
```

`report.md` is the source audit — if a gap is described there, an issue almost certainly exists for it. Match on **Scope**, not title: #22 "Self-hosted OG image" also owns `og:url`/`og:site_name`/`og:locale`, which its title never says.

Outcomes:
- **Already covered** → do not file. Name the issue in the review so the reader knows it was considered, not missed.
- **Partially covered** → comment on the existing issue rather than filing a near-duplicate.
- **Genuinely new** → file it.

Fold findings that touch the same file and would land in one PR into a **single** issue — the backlog convention is one issue per PR, not one per observation.

## Step 6 — File the issue

Match the existing template exactly (`gh issue view 16` for a reference). Required sections:

```markdown
> **Parent epic:** #N — [EPIC X] Name · **Issue X.Y**
> Found during code review of #PR. Not caused by that PR — filed separately rather than scope-creeping it.

## Problem      ## Background     ## Objective    ## Scope
## Out of Scope ## Acceptance Criteria (checkboxes)
## Technical Notes  ## Dependencies  ## Effort & Priority  ## Definition of Done
```

Labels — one from each axis: `epic:*`, `type:{feature,bug,chore,documentation,research}`, `priority:{critical,high,medium,low}`, `size:{XS,S,M,L,XL}`. Plus `--milestone`.

Then add it to the board and set status:

```bash
ITEM=$(gh project item-add 2 --owner "@me" --url <issue-url> --format json | python -c "import json,sys;print(json.load(sys.stdin)['id'])")
gh project item-edit --id "$ITEM" --project-id PVT_kwHOBu0XKc4BeqeG \
  --field-id PVTSSF_lAHOBu0XKc4BeqeGzhZC-5o --single-select-option-id f3d28f1f  # Ready
```

**If the new issue overlaps a planned one, write the sequencing into both.** "If #22 lands first it should absorb this; if this lands first, #22 must preserve it." Two issues editing one block without that note is a merge conflict waiting to happen.

## Step 7 — Post the review

`gh pr comment N --body "$(cat <<'EOF' … EOF)"` — heredoc, single-quoted delimiter.

Structure:
1. **Verdict up front** — approve / approve-with-fixes / blocking. Never bury it.
2. **What was checked** — each claim with its evidence and command output.
3. **Fixed in this PR** — omit if none.
4. **Filed elsewhere** — issue number, one line on why it was out of scope.
5. **Already-tracked adjacent gaps** — name the issues. Proves they were considered, not missed.
6. **Nits** — explicitly non-blocking.

If the PR is clean, say so plainly and stop. **Do not manufacture findings to look thorough.** "No blocking findings, here is what I verified" is a complete and useful review.

## Step 8 — Board

Move the reviewed PR's issue to **In Review** (`8fc96ae8`), or **Done** (`f79d269b`) if it merged. Verify the write landed — `item-edit` exits 0 silently on a bad field id:

```bash
gh project item-list 2 --owner "@me" --limit 60 --format json | python -c "
import json,sys
for i in json.load(sys.stdin).get('items',[]):
    c=i.get('content') or {}
    if c.get('number') in (N,): print('#%s: %s'%(c['number'],i.get('status')))"
```

---

## Closing report

State: verdict · what was fixed and pushed · what was filed (with numbers) · what was consciously left alone and why. If a finding was dropped as a nit, say that too — the point of this skill is that the user can trust nothing was silently lost.
