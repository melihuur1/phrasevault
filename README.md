# PhraseVault

> Work in progress.

PhraseVault is an Obsidian desktop plugin that turns screenshots of English text into numbered, AI-annotated phrase notes. You take a screenshot, review the expressions Claude suggests, and save them as notes. Each saved note gets a line in an `INDEX.md` that grows as you add phrases.

Full documentation (installation, privacy, costs) will be added before the first release.

## Development

Requirements: Node.js 20+ and Obsidian 1.11.4+ (desktop).

```bash
npm install
npm run dev     # watch build; copies the plugin into ./dev-vault
npm test        # unit tests (network access is blocked, no API key needed)
npm run lint
npm run build   # type-check + production bundle
```

Open `./dev-vault` in Obsidian with **Open folder as vault**, then turn on community plugins once. This vault is disposable, gitignored, and the only vault the dev scripts ever write to.
