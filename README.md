# SentimentRadar — Reddit Brand Monitor

Real-time Reddit sentiment analysis for any brand, product, or keyword.
**No API key required** — uses Reddit's public JSON endpoints.

## Features
- Lexicon-based sentiment analysis with negation & intensifier handling
- Doughnut + stacked timeline charts (Chart.js)
- Subreddit breakdown with mini sentiment bars
- Keyword cloud from post titles & bodies
- Filterable post list (All / Positive / Neutral / Negative)
- Click any post to expand top comments

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

## API

```
GET /api/reddit-sentiment?brand=Tesla&sort=relevance&timeframe=month&limit=25
```

Optional params: `subreddit`, `fetchComments` (true/false)

## Local dev

```bash
vercel dev
# open http://localhost:3000
```
