import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));

// 1. Load .env environment variables
try {
  const envContent = readFileSync(join(__dir, '../.env'), 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"](.*)['"]$/, '$1');
    if (k && !process.env[k]) process.env[k] = v;
  }
} catch (e) {
  console.log('No .env found or read error:', e.message);
}

// 2. Load Google Cloud Service Account Credentials
if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
  try {
    const keyPath = join(tmpdir(), 'gcp-key.json');
    const parsed = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    writeFileSync(keyPath, JSON.stringify(parsed), 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  } catch (err) {
    console.error('Failed to write GCP key:', err.message);
  }
}

// Helper to decode HTML entities
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// 3. Robust Data Signals Collector
const collectDailyData = async (date) => {
  console.log('[Data Collector] Gathering signals for date:', date);

  // 1. Wikipedia Pageviews (Top English articles from yesterday)
  let topWikipedia = [];
  try {
    const fetchWiki = async (offset) => {
      const d = new Date(date);
      d.setDate(d.getDate() - offset);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const res = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia.org/all-access/${yyyy}/${mm}/${dd}`, {
        headers: { 'User-Agent': 'academic-art-research-bot/1.0 (contact@example.com)' }
      });
      if (res.ok) {
        const data = await res.json();
        const articles = data.items?.[0]?.articles || [];
        const exclude = ['Main_Page', 'Special:', 'Wikipedia:', 'File:', 'Help:', 'Portal:', 'Template:', 'Talk:', 'Category:', 'Search'];
        const filtered = articles
          .filter(art => !exclude.some(ex => art.article.startsWith(ex)) && art.article !== '-');
        return filtered.slice(0, 5).map(art => art.article.replace(/_/g, ' '));
      }
      return null;
    };
    topWikipedia = await fetchWiki(1) || await fetchWiki(2);
  } catch (e) {
    console.log('[Data Collector] Wiki Pageviews failed:', e.message);
  }
  if (!topWikipedia || topWikipedia.length === 0) {
    topWikipedia = ["Apple WWDC 2026", "Nvidia Market Cap", "F1 Monaco Grand Prix", "Kyrie Irving", "Cannes Film Festival Winners"];
  }

  // 2. Reddit Global Popular Stories
  let topReddit = [];
  try {
    const res = await fetch('https://www.reddit.com/r/popular/hot.json?limit=10', {
      headers: { 'User-Agent': 'academic-art-research-bot/1.0 (contact@example.com)' }
    });
    if (res.ok) {
      const data = await res.json();
      topReddit = data.data.children.slice(0, 5).map(c => c.data.title);
    }
  } catch (e) {
    console.log('[Data Collector] Reddit top stories failed:', e.message);
  }
  if (topReddit.length === 0) {
    topReddit = [
      "NASA's Webb Telescope discovers the oldest black hole ever observed",
      "New self-healing concrete can repair its own cracks with water",
      "Indie developer shows off impressive water physics in custom engine"
    ];
  }

  // 3. Top Global News Entities (Google News US RSS)
  let topGlobalNews = [];
  try {
    const res = await fetch('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
    if (res.ok) {
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (let i = 0; i < Math.min(items.length, 5); i++) {
        const title = items[i].match(/<title>(.*?)<\/title>/)?.[1] || '';
        const cleaned = title.split(' - ').slice(0, -1).join(' - ') || title;
        topGlobalNews.push(decodeHtmlEntities(cleaned.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim()));
      }
    }
  } catch (e) {
    console.log('[Data Collector] Google News fetch failed:', e.message);
  }
  if (topGlobalNews.length === 0) {
    topGlobalNews = [
      "Global climate summit agrees on new emissions targets",
      "SpaceX launches next-generation communications satellite cluster",
      "Major breakthrough reported in quantum computing coherence times"
    ];
  }

  const collectiveAttention = {
    top_wikipedia: topWikipedia,
    top_reddit: topReddit,
    top_global_news: topGlobalNews
  };

  // 4. Positive news (Good News Network RSS)
  let positiveNews = { headline: "Mangrove Recovery Globally Speeds Up", summary: "Denser mangrove forests are returning around the world due to conservation efforts." };
  try {
    const res = await fetch('https://www.goodnewsnetwork.org/feed/');
    if (res.ok) {
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      if (items.length > 0) {
        const title = items[0].match(/<title>(.*?)<\/title>/)?.[1] || '';
        let desc = items[0].match(/<description>(.*?)<\/description>/)?.[1] || '';
        desc = desc.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim();
        positiveNews = {
          headline: title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
          summary: desc || 'An inspiring story of progress and community-driven success.'
        };
      }
    }
  } catch (e) {
    console.log('[Data Collector] GNN fetch failed:', e.message);
  }

  // 5. Polymarket (Top 3 markets by volume)
  let polymarket = [
    { question: "Will OpenAI go public in 2026?", yes_probability: 0.83 },
    { question: "Will interest rates drop in next Fed meeting?", yes_probability: 0.65 },
    { question: "Will space tourism reach new heights this year?", yes_probability: 0.42 }
  ];
  try {
    const res = await fetch('https://gamma-api.polymarket.com/markets?limit=3&order=volume&ascending=false&active=true');
    if (res.ok) {
      const data = await res.json();
      polymarket = data.map(m => {
        let prob = null;
        if (m.outcomePrices) {
          try {
            const prices = JSON.parse(m.outcomePrices);
            prob = parseFloat(prices[0]);
          } catch { }
        }
        return { question: m.question, yes_probability: prob };
      });
    }
  } catch (e) {
    console.log('[Data Collector] Polymarket fetch failed:', e.message);
  }

  // 6. Spotify top song globally (scraped from Kworb)
  let topSong = { title: "Billie Jean", artist: "Michael Jackson" };
  try {
    const res = await fetch('https://kworb.net/spotify/country/global_daily.html');
    if (res.ok) {
      const html = await res.text();
      const firstRow = html.match(/<td class="text mp"><div>([\s\S]*?)<\/div><\/td>/);
      if (firstRow) {
        const parts = firstRow[1].split(' - ');
        if (parts.length >= 2) {
          topSong = {
            artist: parts[0].replace(/<[^>]*>/g, '').trim(),
            title: parts[1].replace(/<[^>]*>/g, '').trim()
          };
        }
      }
    }
  } catch (e) {
    console.log('[Data Collector] Spotify Kworb scrape failed:', e.message);
  }

  // 7. Weird news (Reddit r/nottheonion)
  let weirdNews = [
    "Man tries to cross Atlantic ocean in giant homemade bubble",
    "Police department hires service puppy as anxiety counselor for officers",
    "Small Italian village declares independence after dispute over local festival"
  ];
  try {
    const res = await fetch('https://www.reddit.com/r/nottheonion/top.json?t=day&limit=3', {
      headers: { 'User-Agent': 'academic-art-research-bot/1.0' }
    });
    if (res.ok) {
      const data = await res.json();
      weirdNews = data.data.children.map(c => c.data.title);
    }
  } catch (e) {
    console.log('[Data Collector] Reddit fetch failed (standard IP block, using fallbacks):', e.message);
  }

  // 8. Wikipedia On This Day
  let wikipediaOnThisDay = { year: "1969", event: "The Cuyahoga River catches fire in Cleveland, Ohio, helping to spur the environmental movement." };
  try {
    const [yearStr, monthStr, dayStr] = date.split('-');
    const mm = monthStr || '06';
    const dd = dayStr || '08';
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`);
    if (res.ok) {
      const data = await res.json();
      const filtered = data.events.filter(ev => ev.year < (new Date().getFullYear() - 30));
      if (filtered.length > 0) {
        const randomEvent = filtered[Math.floor(Math.random() * filtered.length)];
        wikipediaOnThisDay = {
          year: String(randomEvent.year),
          event: decodeHtmlEntities(randomEvent.text)
        };
      }
    }
  } catch (e) {
    console.log('[Data Collector] Wikipedia fetch failed:', e.message);
  }

  return {
    date,
    collective_attention: collectiveAttention,
    positive_news: positiveNews,
    polymarket: polymarket,
    top_song: topSong,
    weird_news: weirdNews,
    wikipedia_on_this_day: wikipediaOnThisDay
  };
};

// 4. Main test execution
async function runSandboxTest2() {
  console.log('--- STARTING MULTI-SIGNAL SANDBOX TEST 2 ---');

  const argDate = process.argv[2];
  let dateString = argDate;
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const today = new Date();
    dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  const runId = Date.now();

  // 1. Gather all signals
  const collectedData = await collectDailyData(dateString);
  console.log('\nCollected Signals Data:');
  console.log(JSON.stringify(collectedData, null, 2));

  // 2. Synthesize using Gemini
  const isGeminiKey = !!process.env.GEMINI_API_KEY;
  const ai = isGeminiKey
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });

  const systemInstruction = `
========================================
SERIES BIBLE — FIELD NOTES FROM THE DAY
===========================================

This artwork series is a long-running collectible visual archive.

Every artwork belongs to the same universe.
Every artwork should be immediately recognizable as part of the collection.
The subject matter changes daily, but the visual language does not.
The goal is recognizable evolution within a stable visual identity.

========================================
COMPOSITION & BORDER ARCHITECTURE
========================================

Every artwork must use the exact same border structure.

The border occupies approximately 10–15% of the image area.
The border must be rendered using the same monochrome vector language as the central illustration.
The top header (containing series title, date, and edition) and the bottom text (containing title and subtitle) must be included cleanly inside the artwork frame.

## TOP HEADER
Contains the fixed series title:
"FIELD NOTES FROM THE DAY"

Directly below this main heading, integrated cleanly as part of the top header area (NOT on the side):
- The Date (e.g., YYYY-MM-DD)
- The Edition Number

## LEFT & RIGHT BORDERS
- Do NOT write any letter or word—absolutely none—on the left and right side borders.
- Instead, place visual icons representing the specific top element of each category for that day (e.g., if the top song is about a broken heart, draw a cracked heart glyph; if weird news is a bubble sea crossing, draw a bubble floating on waves). Each icon must represent the day's specific content rather than a generic category placeholder.
- Render these glyphs cleanly inside the side border ornaments.

## BOTTOM BORDER
Contains:
- Title (1–4 words, a memorable symbolic name)
- Subtitle (3–10 words, witty and poetic)
- Do NOT write the micro-caption on the artwork image.

========================================
CENTRAL ARTWORK
================

- One clean, striking, dominant surrealist graphic in the middle of the composition.
- It occupies roughly 70% of the composition.
- The graphic must be a dreamy, integrated surrealist visual that beautifully merges the day's multiple aspects and signals into a single clean, high-impact main visual element.
- Avoid visual clutter, collage logic, or a literal inventory of news stories. Focus on one unified, powerful, and clean surrealist entity.

========================================
FIXED VISUAL LANGUAGE
=====================

Every artwork must use:
- Monochrome only: black ink on warm off-white paper.
- Vector illustration aesthetic, crisp edges, high contrast, strong silhouette, graphic clarity, clean negative space.
- Allowed mark-making: contour lines, crosshatching, stippling, engraved linework, geometric fills, ornamental line systems, symbolic patterns.
- Avoid: painterly rendering, gradients, soft airbrushing, cinematic lighting, photographic realism, 3D rendering, glossy/watercolor/oil effects.

========================================
OUTPUT FORMAT
=============

Return a JSON object with this exact structure:

{
  "date": "YYYY-MM-DD",
  "data_signals_used": ["A detailed list of all 6 daily signals used for this daily run. For each signal, specify the category name (e.g., Collective Attention, Positive News, Polymarket, Top Song, Weird News, Wikipedia Event) followed by the specific headline, song title, probability, or historical event that was fetched and incorporated into the design."],
  "essence": "",
  "title": "",
  "subtitle": "",
  "micro_caption": "",
  "image_prompt": "Highly detailed prompt to generate the FRONT artwork with the top header (containing title, date, edition) and the bottom border (containing only title and subtitle, with absolutely no micro-caption text written on the artwork) included inside the artwork frame. The left/right side borders must feature only abstract visual icons representing the day's specific top elements of the 6 categories, with absolutely no text/letters/words on the side borders. In the middle of the composition is the central clean surrealist graphic.",
  "interpretive_statement": ""
}
`;

  console.log('\nSynthesizing signals via Gemini (gemini-2.5-pro)...');

  let parsedResult = null;
  try {
    const synthResponse = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: `${systemInstruction}\n\nTODAY'S DATA:\n${JSON.stringify(collectedData, null, 2)}`,
      config: {
        responseMimeType: 'application/json',
      }
    });

    parsedResult = JSON.parse(synthResponse.text);
    console.log('\n--- Gemini Synthesis Output ---');
    console.log(JSON.stringify(parsedResult, null, 2));

    // Save JSON to unique file
    const jsonPath = join(__dir, `../sandbox-metadata-${dateString}-${runId}.json`);
    writeFileSync(jsonPath, JSON.stringify(parsedResult, null, 2), 'utf8');
    console.log(`\nSaved synthesized metadata JSON to: ${jsonPath}`);
  } catch (err) {
    console.error('Failed Gemini synthesis:', err.message || err);
    return;
  }

  // 3. Generate Image using Vertex AI Imagen 4
  console.log('\nGenerating image using Vertex AI Imagen 4 (imagen-4.0-generate-001)...');
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: parsedResult.image_prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '3:4',
        outputMimeType: 'image/png',
      },
    });

    const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) {
      throw new Error('No image bytes returned from Google Gen AI');
    }

    const buffer = Buffer.from(imageBytes, 'base64');
    const imagePath = join(__dir, `../sandbox-artwork-${dateString}-${runId}.png`);
    writeFileSync(imagePath, buffer);

    console.log('\n--- SUCCESS ---');
    console.log(`Saved the generated image to: ${imagePath}`);
  } catch (err) {
    console.error('Failed image generation:', err.message || err);
  }
}

runSandboxTest2();
