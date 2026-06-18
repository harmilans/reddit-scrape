// Reddit Sentiment Scraper API
// No API key required — uses Reddit's public JSON endpoints

const POSITIVE_WORDS = new Set([
  'great','good','excellent','amazing','awesome','love','best','fantastic','wonderful',
  'perfect','brilliant','outstanding','superb','incredible','nice','happy','pleased',
  'impressive','recommend','win','winner','quality','reliable','trust','helpful',
  'effective','works','smooth','fast','easy','clean','honest','genuine','legit',
  'worth','value','affordable','safe','secure','innovative','fresh','improved',
  'superior','premium','loved','adore','enjoy','satisfied','delight','positive',
  'strong','solid','pro','top','leading','popular','successful','growth','exciting',
  'beautiful','elegant','powerful','intuitive','seamless','robust','stable','polished'
]);

const NEGATIVE_WORDS = new Set([
  'bad','terrible','awful','horrible','worst','hate','disgusting','disappointing',
  'poor','broken','useless','scam','fraud','fake','lie','mislead','misleading',
  'trash','garbage','waste','overpriced','expensive','slow','buggy','crash','fail',
  'failure','problem','issue','bug','glitch','wrong','error','ugly','toxic','danger',
  'dangerous','unsafe','risk','risky','avoid','warning','beware','annoying',
  'frustrating','confusing','difficult','hard','painful','sick','disgusted','regret',
  'refund','return','cancel','complaint','complain','lawsuit','ban','blocked','spam',
  'negative','weak','lacking','missing','dead','ruined','damaged','lost','broken',
  'unreliable','unstable','clunky','bloated','laggy','outdated','deprecated','insecure'
]);

const INTENSIFIERS = new Set(['very','really','extremely','absolutely','totally','completely','highly','so','super','incredibly','remarkably']);
const NEGATORS = new Set(['not','no','never','dont','doesnt','didnt','isnt','wasnt','wont','wouldnt','cant','couldnt','shouldnt','hardly','barely','neither','nor']);

function tokenize(text) {
  return text.toLowerCase().replace(/[^\w\s']/g, ' ').split(/\s+/).filter(Boolean);
}

function analyzeSentiment(text) {
  if (!text || !text.trim()) return { score: 0, label: 'neutral', positiveCount: 0, negativeCount: 0 };
  const tokens = tokenize(text);
  let score = 0, positiveCount = 0, negativeCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const prev = tokens[i - 1] || '';
    const prevPrev = tokens[i - 2] || '';
    const isNegated = NEGATORS.has(prev) || NEGATORS.has(prevPrev);
    const isIntensified = INTENSIFIERS.has(prev);
    const multiplier = isIntensified ? 1.5 : 1.0;

    if (POSITIVE_WORDS.has(word)) {
      const delta = isNegated ? -1 * multiplier : 1 * multiplier;
      score += delta;
      delta > 0 ? positiveCount++ : negativeCount++;
    } else if (NEGATIVE_WORDS.has(word)) {
      const delta = isNegated ? 1 * multiplier : -1 * multiplier;
      score += delta;
      delta > 0 ? positiveCount++ : negativeCount++;
    }
  }

  const label = score > 0.5 ? 'positive' : score < -0.5 ? 'negative' : 'neutral';
  return { score: parseFloat(score.toFixed(2)), label, positiveCount, negativeCount };
}

function extractTopKeywords(posts) {
  const freq = {};
  const stopwords = new Set([
    'the','a','an','in','on','at','to','for','of','and','or','but','is','was','are',
    'were','be','been','have','has','had','do','does','did','will','would','could',
    'should','may','might','this','that','these','those','i','me','my','we','our',
    'you','your','it','its','they','their','what','which','who','when','where','how',
    'all','any','some','more','most','about','with','from','by','as','up','out','if',
    'then','just','so','can','also','get','got','going','go','went','re','ve','ll',
    's','t','d','m','very','really','just','like','even','still','also','only',
    'than','then','into','over','after','before','between','through','during'
  ]);
  for (const post of posts) {
    const text = (post.title || '') + ' ' + (post.selftext || '') + ' ' + (post.comments || []).map(c => c.body).join(' ');
    for (const word of tokenize(text)) {
      if (word.length > 3 && !stopwords.has(word) && !/^\d+$/.test(word)) {
        freq[word] = (freq[word] || 0) + 1;
      }
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([word, count]) => ({ word, count }));
}

async function redditFetch(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://www.reddit.com',
    'Referer': 'https://www.reddit.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
  const res = await fetch(url, { headers });
  if (res.status === 429) throw new Error('Reddit rate limit hit. Please wait a moment and try again.');
  if (res.status === 404) throw new Error('Subreddit not found.');
  if (!res.ok) throw new Error(`Reddit returned ${res.status}. Try a different search term or wait a moment.`);
  return res.json();
}

async function fetchRedditPosts(query, subreddit, sort, limit, timeframe) {
  const base = subreddit
    ? `https://www.reddit.com/r/${subreddit}/search.json`
    : 'https://www.reddit.com/search.json';
  const params = new URLSearchParams({ q: query, sort: sort || 'relevance', limit: Math.min(limit || 25, 100), t: timeframe || 'month', restrict_sr: subreddit ? 'true' : 'false', raw_json: '1' });
  return redditFetch(`${base}?${params}`);
}

async function fetchPostComments(subreddit, postId) {
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=15&depth=1&raw_json=1`,
      { headers: { 'User-Agent': 'SentimentRadar/2.0', 'Accept': 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data[1]?.data?.children || [])
      .filter(c => c.kind === 't1' && c.data?.body && c.data.body !== '[deleted]' && c.data.body !== '[removed]')
      .map(c => ({ body: c.data.body, author: c.data.author, score: c.data.score }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    brand,
    subreddit,
    sort = 'relevance',
    limit = '25',
    timeframe = 'month',
    fetchComments = 'false'
  } = req.query;

  if (!brand || brand.trim().length < 1) {
    return res.status(400).json({ error: 'brand query parameter is required' });
  }

  try {
    const data = await fetchRedditPosts(brand.trim(), subreddit?.trim(), sort, parseInt(limit), timeframe);
    const rawPosts = data?.data?.children || [];

    if (rawPosts.length === 0) {
      return res.status(200).json({
        brand: brand.trim(),
        summary: { totalPosts: 0, avgSentiment: 0, sentimentCounts: { positive: 0, negative: 0, neutral: 0 }, sentimentPercent: { positive: 0, negative: 0, neutral: 0 }, overallLabel: 'Neutral' },
        timeline: [], subredditBreakdown: [], keywords: [], posts: []
      });
    }

    const posts = await Promise.all(rawPosts.map(async ({ data: p }) => {
      const comments = fetchComments === 'true' ? await fetchPostComments(p.subreddit, p.id) : [];
      const fullText = `${p.title} ${p.selftext || ''} ${comments.map(c => c.body).join(' ')}`;
      const sentiment = analyzeSentiment(fullText);
      return {
        id: p.id,
        title: p.title,
        author: p.author,
        subreddit: p.subreddit,
        url: `https://reddit.com${p.permalink}`,
        score: p.score,
        numComments: p.num_comments,
        created: p.created_utc,
        selftext: (p.selftext || '').slice(0, 600),
        thumbnail: p.thumbnail?.startsWith('http') ? p.thumbnail : null,
        sentiment,
        comments: comments.slice(0, 5),
        flair: p.link_flair_text || null,
        awards: p.total_awards_received || 0,
        isVideo: p.is_video || false,
        domain: p.domain || null
      };
    }));

    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    let totalScore = 0;
    const subredditStats = {};
    const timeline = {};

    for (const post of posts) {
      sentimentCounts[post.sentiment.label]++;
      totalScore += post.sentiment.score;

      const sr = post.subreddit;
      if (!subredditStats[sr]) subredditStats[sr] = { positive: 0, negative: 0, neutral: 0, count: 0, totalScore: 0 };
      subredditStats[sr][post.sentiment.label]++;
      subredditStats[sr].count++;
      subredditStats[sr].totalScore += post.sentiment.score;

      const date = new Date(post.created * 1000).toISOString().slice(0, 10);
      if (!timeline[date]) timeline[date] = { positive: 0, negative: 0, neutral: 0, avgScore: 0, count: 0 };
      timeline[date][post.sentiment.label]++;
      timeline[date].avgScore += post.sentiment.score;
      timeline[date].count++;
    }

    for (const date of Object.keys(timeline)) {
      timeline[date].avgScore = parseFloat((timeline[date].avgScore / timeline[date].count).toFixed(2));
    }

    const avgSentiment = parseFloat((totalScore / posts.length).toFixed(2));

    return res.status(200).json({
      brand: brand.trim(),
      query: { subreddit, sort, limit: parseInt(limit), timeframe },
      summary: {
        totalPosts: posts.length,
        avgSentiment,
        sentimentCounts,
        sentimentPercent: {
          positive: Math.round((sentimentCounts.positive / posts.length) * 100),
          negative: Math.round((sentimentCounts.negative / posts.length) * 100),
          neutral: Math.round((sentimentCounts.neutral / posts.length) * 100),
        },
        overallLabel: avgSentiment > 0.3 ? 'Positive' : avgSentiment < -0.3 ? 'Negative' : 'Neutral',
        topPost: posts.sort((a, b) => b.score - a.score)[0] || null
      },
      timeline: Object.entries(timeline)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, ...v })),
      subredditBreakdown: Object.entries(subredditStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 12)
        .map(([name, s]) => ({ subreddit: name, ...s, avgScore: parseFloat((s.totalScore / s.count).toFixed(2)) })),
      keywords: extractTopKeywords(posts),
      posts: posts.sort((a, b) => b.score - a.score)
    });
  } catch (err) {
    console.error('Reddit sentiment error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch Reddit data' });
  }
}
