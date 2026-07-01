# 자모들 (Jamodeul)

Korean jamo learning games: Hangul Builder, Korean Match, Wordle, and vowel practice.

## Dictionary integration (Korean Basic Dictionary)

The app enriches **curated** lesson words with definitions from the official [Korean Basic Dictionary Open API](https://krdict.korean.go.kr/eng/openApi/openApiInfo) (한국어기초사전). Gameplay still uses the local beginner word list in `www/js/learning-words.js` — the dictionary does **not** auto-add words to the game.

### Register for an API key

1. Visit [Open API registration](https://krdict.korean.go.kr/eng/openApi/openApiRegister)
2. Apply for a **search** authentication key (32-character hex)
3. Copy the key — up to 50,000 requests/day

### Environment variable

Create `.env` from the example:

```bash
cp .env.example .env
```

Add:

```env
KOREAN_DICTIONARY_API_KEY=your_32_character_hex_key_here
ADMIN_IMPORT_TOKEN=optional-dev-token
```

**Never** put the dictionary API key in frontend code. The browser calls `/api/dictionary/search` on your server; the server calls `krdict.korean.go.kr`.

### Run locally

```bash
npm install
npm run dev
```

Open:

- App: http://localhost:3000
- Dictionary API: http://localhost:3000/api/dictionary/search?word=고양이
- Word import tool: http://localhost:3000/admin/word-import.html

For Capacitor mobile builds, deploy the API to Vercel (or similar) and set the base URL before loading games:

```html
<script>window.JAMODEUL_API_BASE = 'https://your-app.vercel.app';</script>
```

### Deploy on Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variable: `KOREAN_DICTIONARY_API_KEY`
4. Optional: `ADMIN_IMPORT_TOKEN` for the import tool
5. Deploy — static files from `www/` and API routes from `api/` are configured in `vercel.json`

### Architecture

| Layer | Role |
|-------|------|
| `www/js/learning-words.js` | Curated beginner vocabulary (gameplay source of truth) |
| `www/js/dictionary-service.js` | Frontend lookup + localStorage cache (7 days) |
| `www/js/dictionary-modal.js` | Dictionary detail modal after completing a word |
| `api/dictionary/search.js` | Secure proxy, rate limit, server cache |
| `lib/korean-dictionary.js` | XML parsing + normalization |

### Word import tool (developer)

Open `/admin/word-import.html` (optionally `?token=YOUR_ADMIN_IMPORT_TOKEN`):

1. Search the official dictionary
2. Select the best entry
3. Add emoji, category, difficulty, English meaning
4. Export JSON and paste into `LEARNING_WORDS` in `learning-words.js`

Validate all curated words:

```bash
npm run validate-words
```

### Offline behaviour

- Games work fully offline with curated meanings
- Dictionary button shows cached entries when available
- Otherwise: “Dictionary details are unavailable right now.”

### LearningWord shape

```js
{
  word: '고양이',
  meaning: 'Cat',           // app curated
  category: 'animals',
  difficulty: 2,            // 1–5, or use LearningWordModel labels
  emoji: '🐱',
  tags: ['pets'],
  dictionary: {             // optional, from API
    source: 'Korean Basic Dictionary',
    entryId: '…',
    pronunciation: '…',
    partOfSpeech: '명사',
    definition: '…',
    example: '…',
    sourceUrl: '…',
    lastFetchedAt: '…'
  }
}
```

## Other commands

```bash
npm test              # Hangul + dictionary unit tests
npm run sync          # Capacitor sync
npm run open:ios      # Open iOS project
```

See `MOBILE.md` for Capacitor store setup.
