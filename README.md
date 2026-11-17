# PhraseVault

PhraseVault is an Obsidian desktop plugin that turns screenshots of English text into numbered, AI-annotated phrase notes for Turkish speakers.

Take a screenshot of a subtitle, article or chat (Win+Shift+S), paste it into PhraseVault, and Claude suggests the expressions worth learning: phrasal verbs, idioms, collocations and fixed expressions, with a contextual Turkish meaning and a short explanation. You review and edit the suggestions, and PhraseVault saves each one as a numbered note (`Phrases/0001.md`, …) and adds it to a growing `INDEX.md`.

The interface is in Turkish. The plugin uses one AI provider, the Anthropic API, with your own API key.

<!--
Screenshots: see docs/screenshots/README.md, then remove this comment.

![Import window with a screenshot preview](docs/screenshots/preview.png)
![Editable suggestion cards with the estimated cost](docs/screenshots/review.png)
![INDEX.md in Reading view](docs/screenshots/index.png)
-->

## Features

- **Three ways to get a screenshot in:** read the clipboard, press Ctrl+V inside the window, or pick a PNG/JPEG file.
- **Preview first.** Nothing leaves your computer until you click **Analiz et**. Analysis can be cancelled, and showing the same screenshot again in the same session never sends or bills it twice.
- **Highlighted and plain text.** If you highlight or underline an expression before taking the screenshot, it is listed first. Without a highlight, Claude suggests up to five useful expressions.
- **Editable suggestion cards.** Every field can be edited: phrase (dictionary form), original wording, category, Turkish meaning, explanation and source sentence. Untick a card to skip it, or add a phrase by hand when the AI misses one or fails.
- **Checks on what the AI says.** A warning appears when the quoted wording is not in the source sentence.
- **Duplicate detection.** Phrases already in your notes or in `INDEX.md`, or repeated in the same batch, are flagged. Saving a duplicate needs an explicit "Farklı anlamla yine de kaydet".
- **Safe, sequential numbering.** Numbers are never reused, existing notes are never overwritten, and `INDEX.md` is only appended to. Numbers keep their leading zeros in Reading view and continue past 9999.
- **One copy of each screenshot.** The screenshot is stored once in `Attachments/` and embedded in every note made from it.
- **Estimated cost of every analysis.** The suggestion screen shows the tokens used and the estimated cost, and the settings keep a running total that you can reset.
- **"İndeksi onar" (repair index).** Restores missing `INDEX.md` entries for existing notes, and reports anything ambiguous instead of guessing.
- **No lost edits.** Closing the window or starting over asks first when there are unsaved edits.

## How it works

1. Take a screenshot with **Win+Shift+S**.
2. Run **PhraseVault: Panodan ekran görüntüsü içe aktar** (import from clipboard) from the command palette, or click the ribbon icon. You see a preview and the number the next phrase will get.
3. Click **Analiz et** or press Enter. Claude returns suggestions in a few seconds.
4. Edit, select or add phrases, then click **Seçilenleri kaydet** or press Ctrl+Enter.

This creates, for example:

```
INDEX.md
Phrases/0001.md
Phrases/0002.md
Attachments/pv-3f9a1c2b7d10e4a5.png
```

`INDEX.md` grows one line per saved phrase:

```markdown
# PhraseVault İndeksi

0001 — [[Phrases/0001|come across]]
0002 — [[Phrases/0002|put off]]
```

Each note keeps the details in its frontmatter (properties):

```markdown
---
phrase: "put off"
original_text: "putting off"
category: "phrasal_verb"
meaning_tr: "ertelemek"
source_sentence: "Her colleagues had been putting off the task for weeks."
screenshot: "[[Attachments/pv-3f9a1c2b7d10e4a5.png]]"
created: "2026-11-18"
number: 2
tags:
  - phrasevault
---
# put off

**Kategori:** Phrasal verb
**Türkçe anlam:** ertelemek
**Açıklama:** Genellikle isteksizlik yüzünden bir işi sürekli sonraya bırakmayı anlatır; hafif olumsuz bir tonu vardır.

> Her colleagues had been **putting off** the task for weeks.

![[Attachments/pv-3f9a1c2b7d10e4a5.png]]

*Eklenme tarihi: 2026-11-18*
```

### Commands

| Command (Turkish UI) | What it does |
|---|---|
| Panodan ekran görüntüsü içe aktar | Import a screenshot from the clipboard (also the ribbon icon) |
| Dosyadan ekran görüntüsü içe aktar | Import a PNG/JPEG file |
| Klasör yapısını ve INDEX.md dosyasını hazırla | Create `Phrases/`, `Attachments/` and `INDEX.md` if they are missing |
| İndeksi onar | Compare the notes with `INDEX.md`, preview the fixes, and add the missing entries |

No default hotkeys are assigned. You can set your own under **Settings → Hotkeys**.

## Installation

Requires Obsidian **1.11.4 or later** on desktop (Windows, macOS, Linux).

PhraseVault is not in the Community Plugins directory yet. Until it is, install it manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the latest GitHub release.
2. Create the folder `<your vault>/.obsidian/plugins/phrasevault/` and put the three files in it.
3. In Obsidian, go to **Settings → Community plugins**, turn off Restricted mode if needed, and enable **PhraseVault**.

To get updates automatically, add the repository to the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin instead.

## Anthropic API configuration

PhraseVault calls the Anthropic Messages API with **Claude Haiku 5.5** (`claude-haiku-5-5`) by default. You need your own API key. **A Claude Pro or Max subscription does not include API usage.**

1. Create an account at [console.anthropic.com](https://console.anthropic.com) and add prepaid credits under **Billing**. A low monthly spend limit is a good idea.
2. Create an API key under **API keys**.
3. In Obsidian, go to **Settings → PhraseVault → Anthropic API anahtarı**, create a secret, and paste the key into it.

The key is stored in Obsidian's secret storage. PhraseVault's own settings file only holds the *name* of the secret. On desktop, secret storage is separate for each vault, so a test vault and your real vault each need the key entered separately.

The **Model** setting can be changed. Estimated costs are calculated for Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5. Other models still work, but their cost shows as "Maliyet hesaplanamadı" (cost could not be calculated).

## API costs and cost tracking

Prices for Claude Haiku 5.5 on the standard API, checked against the [official pricing page](https://platform.claude.com/docs/en/about-claude/pricing) on 2026-11-18:

| Per million tokens | Prompts up to 100K tokens | Prompts over 100K tokens |
|---|---|---|
| Input | $0.10 | $0.50 |
| Output | $0.50 | $2.50 |
| 5-minute cache write | $0.125 | $0.625 |
| 1-hour cache write | $0.20 | $1.00 |
| Cache read | $0.01 | $0.05 |

A typical screenshot analysis uses a few thousand input tokens (the image plus the fixed instructions) and one to three thousand output tokens, including the model's thinking. That comes to about **$0.001–0.002 per analysis**.

### How the estimate is calculated

After every response, PhraseVault reads the `usage` object that the API returns, and shows the input and output tokens, the model, and the estimated cost with six decimals (for example `Tahmini maliyet: $0.000813`).

- **Tokens come only from the API response.** Image tokens are already part of `input_tokens` and thinking tokens are part of `output_tokens`, so neither is estimated or added separately.
- **Cache writes and reads are priced separately** when the response reports them. The long-context prices apply when the whole prompt, including cache reads and writes, is over 100,000 tokens.
- **US-only inference is priced at 1.1x** when the response reports `inference_geo: "us"`.
- **Amounts are stored as integer picodollars** and rounded only for display, so totals don't drift.
- **Billed failures count.** A refused, truncated or invalid answer was still billed, so it is recorded too.
- **Nothing is counted twice.** Each response is recorded once, by its message ID. Reopening a result from the session cache shows the original estimate again without counting it.
- **No guessing.** "Maliyet hesaplanamadı" appears instead of `$0` when the usage is missing, the model has no known price, or the request ran on a tier, speed mode or region PhraseVault has no prices for.

The local history (in `data.json`) keeps a running total plus the last 50 records: date, model, token counts and estimate. It never stores images, prompts, responses or keys. **Settings → PhraseVault → Geçmişi sıfırla** resets it.

### Limitations of the estimate

- The amount is a **local estimate ("Tahmini maliyet")**, not your invoice. The exact amount is in the Anthropic Console.
- Prices can change. They are a constant in `src/core/cost.ts` with the date they were checked.
- A request that is cancelled or times out has no response, so its usage cannot be seen or counted, even though Anthropic may still bill it.
- The SDK retries failed requests up to two times. Only the final response's usage is reported. Failed attempts such as rate limits and overloads are normally not billed.

## Privacy and local data

**What is sent, and when:** only the screenshot you previewed (scaled down to at most 2576 px if needed) and a fixed instruction text. It is sent only when you click **Analiz et**, over HTTPS, to `api.anthropic.com` and nowhere else. No other vault content (notes, file names, `INDEX.md`) is ever sent. Screenshots can contain personal information, so check the preview before sending.

**At Anthropic:** API data is handled under Anthropic's [commercial terms and privacy policy](https://www.anthropic.com/legal/privacy). Under those terms, API inputs and outputs are not used for model training by default.

**What stays on your computer:**

| Where | What |
|---|---|
| `Phrases/*.md`, `INDEX.md`, `Attachments/` | Your notes and screenshots, as ordinary vault files |
| `.obsidian/plugins/phrasevault/data.json` | Secret name, model ID, highest issued number, cost history (token counts only) |
| Obsidian secret storage | The API key |
| Memory only | The last 20 analyses of this session, so the same screenshot isn't billed twice. Cleared when Obsidian closes. |

There is no telemetry, no analytics, and no server of our own.

## Architecture

```
Command / ribbon ──► ImportModal (UI state machine)
                       ├─ clipboard.ts      clipboard read · Ctrl+V · file picker
                       ├─ core/imageInput   format, dimensions, hash, resize plan, final API-image checks
                       ├─ ai/analyze        Anthropic Messages API: image + fixed prompt, structured JSON output
                       │    └─ ai/validate  schema check, cleanup, source-sentence check
                       ├─ core/cost         usage → estimated cost;  core/usageLog  local history
                       ├─ ui/reviewModel    selection, required fields, duplicates, unsaved changes
                       └─ vault/vaultStore  serialized saves through a small VaultPort
                            ├─ core/numbering     next = max(note files, INDEX.md references, last issued) + 1
                            ├─ core/noteMarkdown  note text
                            ├─ core/indexFile     append-only INDEX.md, checked again at write time
                            └─ core/indexRepair   "İndeksi onar" planning
```

- **`src/core/` is pure TypeScript** with no Obsidian imports, so numbering, index handling, note rendering, duplicates, image checks and cost calculation are all unit tested.
- **Vault access goes through `VaultPort`**, a small interface. `obsidianVaultPort.ts` adapts Obsidian's `app.vault`, and the tests use an in-memory fake with failure and race hooks.
- **Safety rules for your vault:**
  - Notes and attachments are only ever *created* (`vault.create` fails if the path exists).
  - `INDEX.md` is changed only through `vault.process`. The new content is checked again inside the callback, and existing lines are never edited, reordered or deleted.
  - A note is written before its index line, so a failure can at most leave a note without an index entry, which "İndeksi onar" fixes.
- **Numbering** is derived from what is in the vault, plus one high-water mark. That makes it the same after a restart, and it never reuses the number of a deleted or hand-edited entry.
- **The AI is injected.** The Anthropic call is a function the tests replace with mocks. The client always uses `https://api.anthropic.com`, with SDK logging off, so environment variables can't redirect or log requests.

## Development

Requirements: Node.js 22.12+ and Obsidian 1.11.4+ (desktop).

```bash
npm install
npm run dev        # watch build; copies the plugin into ./dev-vault
npm run build:dev  # one development build into ./dev-vault (adds a free sample-response button)
npm test           # unit and integration tests; network access is blocked, no API key needed
npm run typecheck
npm run lint
npm run build      # type-check + production bundle (main.js)
```

Open `./dev-vault` in Obsidian with **Open folder as vault**, then turn on community plugins once. This vault is disposable, gitignored, and the only vault the dev scripts write to. The install script refuses any target outside the repository.

**Tests** cover numbering, the index, note rendering, duplicates, image validation, the AI response schema and errors (mocked responses), cost calculation and the usage history, the review logic, index repair, and full save workflows against an in-memory vault. `tests/setup.ts` replaces `fetch`, `XMLHttpRequest` and `WebSocket` with stubs that throw, so the suite can never make a paid request.

**Releases:** bump the version with `npm version <x.y.z>` (this also updates `manifest.json` and `versions.json`), then push the tag. The release workflow builds and attaches `main.js`, `manifest.json` and `styles.css` to a draft GitHub release.

## Known limitations

- **Desktop only.** The workflow is built around desktop screenshots; mobile is not supported.
- **The AI can misread text** or miss a highlight. That's why every suggestion is reviewed and editable, and why mismatches with the source sentence are flagged.
- **Interface language:** the UI and the explanations are in Turkish only.
- **One entry per line in `INDEX.md`** relies on Obsidian's default *Strict line breaks: off*. With it on, Reading view joins the lines; the file itself is unaffected.
- **Duplicate detection** compares the `phrase` in note properties and the `INDEX.md` link aliases. Notes written by hand without those aren't recognized.
- **Sync:** saving the same vault from two devices at the same moment is protected only by create-only writes and the `INDEX.md` re-check.
- **Clipboard:** reading the clipboard uses `navigator.clipboard.read()`. If a system blocks it, Ctrl+V inside the window and the file picker still work.
- **Cost tracking** is an estimate with the limitations listed above.
- **Dev dependencies:** `npm audit` reports a ReDoS advisory in `picomatch` ≤ 4.0.7 (used by vitest, vite and typescript-eslint). No fixed version exists yet. It affects development tooling only, which matches glob patterns from this repository's own config files. The production bundle's dependencies have no known vulnerabilities.

## License

[MIT](LICENSE)
