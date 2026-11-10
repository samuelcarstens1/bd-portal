# BD Progress Portal

Samuel Carstens's business development portal for his role as Construction BD Manager (Strategic Accounts & Data Centers) at
IB Group Worldwide. IB Group's companies are INTAL Construction, Elite Mainframe Solutions and Global Drywall Services, which
supply labor-only metal framing, drywall, ceiling and insulation crews. His boss, Juan Carlos, reads the portal to follow his
progress.

## Two copies, one source of truth for each thing

| | Where | What it holds |
|---|---|---|
| **Data** | The claude.ai artifact https://claude.ai/artifact/FEzobZ9xk13cSxy9tqibfq (its shared database) | Everything Samuel enters: pipeline, projects, Client Networks contacts and logs, daily reports, goals |
| **Code** | This repo, `main` | The page and its scripts. GitHub Pages serves it at https://samuelcarstens1.github.io/bd-portal/ as a view-only copy |

- Make code changes here, then publish the same files to the artifact so the two match. `scripts/build_artifact.py <out dir>`
  turns this repo's `index.html` into the artifact form, which has no html/head/body skeleton of its own. Publish that output
  with the Artifact tool to the URL above, and read the artifact first.
- The artifact can get ahead of the repo when a change is made there in chat. Before you change code, compare the artifact's
  files with the repo's (Artifact `read` with `paths`), and bring any newer artifact code into the repo first.
- The GitHub copy loads `data/portal.json`, a snapshot of the artifact's database written by `scripts/export_portal.py`.

## The repo is public: keep private data out

- **Client Networks contact data never goes in this repo.** That covers `cnet-data.js`, `cnet-more.js`, `cnet-circle.js`,
  `cnet-batch*.js` and `img/cnet/`, which hold names, emails, phones and photos. These files live only in the artifact and
  are listed in `.gitignore`. On the GitHub site they 404 and Client Networks shows empty. That's expected.
- `export_portal.py` copies only the keys in its `SYNC` list. Never add `bdp-cnet-logs`, `bdp-cnet-edits` or `bdp-projects`
  to it: they hold contact notes, emails and phone numbers. The map's private "personal" collection is never exported either.
- `export_leads.py` keeps only public-source lead fields.

## How the data is stored (artifact database)

- Each portal key (`bdp-opps`, `bdp-projects`, `bdp-reports`, `bdp-cnet-logs`, `bdp-cnet-edits`, `bdp-goals`, `bdp-kpis`,
  `ib-ramp-plan-v1`, ...) is stored as:
  - one meta document `kv/<key>` = `{n, rev, len, at}`;
  - `n` chunk documents `kvc/<key>~<i>` = `{s}`, where `s` is a slice of the JSON string. `CHUNK = 180000` characters, set
    in `sync.js`.
- To write, change the chunks and the meta together in one ArtifactData `batch`. Pin every entry with `if_version` from your
  read, so you never overwrite something Samuel or the 5 PM task saved in the meantime. `rev` is `<ms>-<6 random chars>`.
- `sync.js` loads these into `localStorage` and, through `BDP_SYNC.onRemote`, pulls in changes made elsewhere. A tab left
  open with an old copy can save it back, so tell Samuel to reload after a database write.
- Contact log record (`bdp-cnet-logs`): `{id:'cm…', company, companyName, contact, name, title, date, type, duration, feel, created, note}`.
  Types: Call, Email, In-person meeting, Lunch / coffee, Site visit, Golf / event. A text message is logged as Email with
  "sent as a text" in the note.
- People added by hand (`bdp-cnet-edits`): `'add:<company>'` holds an array of `{id:'a-…', name, title, city, phone, email, li, added}`.

## Samuel's rules (follow these)

- **No made-up data.** No sample opportunities, contacts or numbers. Everything comes from his entries, his files or cited sources.
- **Don't assume status.** A proposal is "Proposal sent" until he says it was won. Ask before marking anything Won, and
  ask when two records might be the same job.
- **Pipeline:**
  - Stages: New, Qualified, Meeting set, Proposal sent, Verbal yes, Won, Lost.
  - Total and weighted pipeline are computed from the list, never typed in.
  - "Won this quarter" is the value of Won opportunities closed in the current calendar quarter.
  - "Average opportunity" averages every opportunity ever brought in.
  - By stage, By metro and By trade show only active opportunities that have a proposal price. Company rows with no price
    stay in the table but out of the breakdowns.
- **One pipeline row per proposal.** Name the row after the job, put the customer in parentheses, and put the scope, rate,
  NTE math, exclusions and source file in the notes.
- **Apollo:** quote the credit cost and get his OK before any enrichment.
- **Emails you draft:** always include a subject line. Keep cold emails short, with one question.
- **Prospect lists:** also deliver an Excel file, one file per list.
- **Critiques:** be rigorously critical. He wants to be coached to top-of-industry standards.
- Commit and push only when he asks. Work on a branch and open a PR.

## Design

- Portal tokens are on `:root` in `index.html`: navy `#16233A`, accent orange `#C44A08`, paper `#F4F2EC`, IBM Plex Sans/Mono.
  There's a dark mode, and an English/Spanish toggle (`i18n.js`).
- Network maps and flowcharts use the Client Networks hub-and-spoke look: navy blueprint grid, safety-orange connectors,
  round nodes sized hub/branch/satellite, Roboto Condensed headings.
- Layout must work at phone width with no horizontal scroll.

## Tabs and files

| Tab | Files |
|---|---|
| Overview, Pipeline, Daily Reports, Annual Operation Plan, Salary ROI, Expense Report | `index.html` (inline scripts), `portal.js` |
| Projects We're Chasing | `projects.js`, `projects.css` |
| Daily Intel, and Research on a project | `intel.js`, `intel.css`, `research.js` |
| Client Networks | `cnet.js`, `cnet.css`, plus the private data files above |
| Office Map | `officemap.js`, `officemap-data.js` |
| Labor Radar | `leads.js`, `data/leads.json` |
| Who's Working Where / insights | `insights.js`, `classify.js`, `data/market.json` |
| Old BusDev Map code (retired tab; its data feeds Client Networks) | `bdmap.js` |
| 5 PM report preview | `rpt-auto.js` |
| Monday follow-ups | `fu-overview.js` |

`scripts/daily_contacts.py` is the 5 PM daily-report roll-up. The "Daily report – 5 PM contact roll-up" scheduled task
carries its own copy of this script, so change both together.

## Checking your work

Serve the repo (`python3 -m http.server`) and open it in Playwright. Click through Overview, Pipeline, Projects, Client
Networks and Daily Reports, and confirm there are no page errors. The only expected 404s are the private `cnet-*` files and
the external CDNs.
