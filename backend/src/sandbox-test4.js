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

  // 1. Google Trends (India RSS)
  let googleTrends = [];
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=IN');
    if (res.ok) {
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (let i = 0; i < Math.min(items.length, 5); i++) {
        const title = items[i].match(/<title>(.*?)<\/title>/)?.[1] || '';
        googleTrends.push(title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim());
      }
    }
  } catch (e) {
    console.log('[Data Collector] Google Trends fetch failed:', e.message);
  }
  if (googleTrends.length === 0) {
    googleTrends = ["Monsoon updates India", "India cricket match", "Sensex record high", "Mergers and acquisitions", "Tech start-ups Bengaluru"];
  }

  // 2. Positive news (Good News Network RSS)
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

  // 3. Polymarket (Top 3 markets by volume)
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

  // 4. Spotify top song globally (scraped from Kworb)
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

  // 5. Weird news (Reddit r/nottheonion)
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

  // 6. Wikipedia On This Day
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

  // 7. NASA APOD
  let nasaApod = {
    title: "Unknown Sky",
    explanation: "",
    url: ""
  };

  try {
    const res = await fetch(
      `https://api.nasa.gov/planetary/apod?api_key=${process.env.NASA_API_KEY}`
    );

    if (res.ok) {
      const data = await res.json();

      nasaApod = {
        title: data.title,
        explanation: data.explanation,
        url: data.url,
        media_type: data.media_type
      };
    }
  } catch (e) {
    console.log('[Data Collector] NASA APOD fetch failed:', e.message);
  }

  return {
    date,
    collective_attention: googleTrends,
    positive_news: positiveNews,
    polymarket,
    top_song: topSong,
    weird_news: weirdNews,
    wikipedia_on_this_day: wikipediaOnThisDay,
    nasa_apod: nasaApod
  };
};

// 4. Main test execution
async function runSandboxTest4() {
  console.log('--- STARTING MULTI-SIGNAL SANDBOX TEST 4 ---');

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
SERIES CRUX — FIELD NOTES FROM THE DAY
===========================================

This artwork series is a long-running collectible visual archive.

Every artwork belongs to the same universe.
Every artwork should be immediately recognizable as part of the collection.
The subject matter changes daily, but the visual language does not.
The goal is recognizable evolution within a stable visual identity.

========================================
FRONT/BACK ARCHITECTURE
=======================

Each day's print consists of a Front Artwork and a Back Artwork.

FRONT ARTWORK:
- Contains a dominant central illustration representing the day's compressed data signals.
- Utilizes the Fixed Border Architecture.
- Integrates the NASA APOD Panel above the central artifact.

BACK ARTWORK

Create a second artwork.

The back artwork contains:

FIELD NOTES FROM THE DAY

Seven icons:

1. Collective Attention
2. Positive News
3. Polymarket
4. Top Song
5. Weird News
6. Wikipedia Event
7. NASA APOD

Each icon must summarize the most important event from that category.

Below the icons:

back_microcaption

Format:

Caption A • Caption B • Caption C • Caption D • Caption E • Caption F • Caption G

========================================
7 SIGNAL SYSTEM
===============

All 7 daily signal categories must contribute:
1. Collective Attention (formerly Google Trends)
2. Positive News
3. Polymarket
4. Top Song
5. Weird News
6. Wikipedia Event
7. NASA APOD

========================================
NASA APOD PANEL

Always present.

Occupies roughly 15–20% of the composition.

Positioned above the central artifact.

Rendered in the same monochrome engraved language.

Acts as the celestial witness to the day's events.

========================================
FIXED VISUAL LANGUAGE
=====================

Every artwork (front and back) must use:
- Monochrome only: black ink on warm off-white paper.
- Vector illustration aesthetic, crisp edges, high contrast, strong silhouette, graphic clarity, clean negative space.
- Allowed mark-making: contour lines, crosshatching, stippling, engraved linework, geometric fills, ornamental line systems, symbolic patterns.
- Avoid: painterly rendering, gradients, soft airbrushing, cinematic lighting, photographic realism, 3D rendering, glossy/watercolor/oil effects.

========================================
FIXED BORDER ARCHITECTURE (FRONT ONLY)
======================================

The front artwork uses a border structure (occupying 10-15% of the area):
- TOP BORDER: Always contains "FIELD NOTES FROM THE DAY"
- LEFT BORDER: Contains positions for signal markers.
- RIGHT BORDER: Contains Date, Edition Number, and Day of Week.
- BOTTOM BORDER: Contains Title, Subtitle, and Micro-Caption.

========================================
FRONT TYPOGRAPHY & CAPTIONS
===========================

TITLE: 1–4 words. A memorable symbolic name.
SUBTITLE: 3–10 words. Witty and reflective.
MICRO-CAPTION: One sentence. Poetic, symbolic, and reflective.

========================================
OUTPUT FORMAT
=============

Return a JSON object with this exact structure:

{
  "date":"",

  "data_signals_used":[],

  "essence":"",

  "visual_joke":"",

  "title":"",

  "subtitle":"",

  "front_artwork_prompt":"",

  "back_artwork_prompt":"",

  "signal_icons":[
    {
      "category":"",
      "icon_description":"",
      "caption":""
    }
  ],

  "back_microcaption":"",

  "interpretive_statement":""
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

    // Add icon metadata file
    const iconPath = join(
      __dir,
      `../signal-icons-${dateString}-${runId}.json`
    );

    writeFileSync(
      iconPath,
      JSON.stringify(parsedResult.signal_icons, null, 2),
      'utf8'
    );
    console.log(`Saved signal icons JSON to: ${iconPath}`);

  } catch (err) {
    console.error('Failed Gemini synthesis:', err.message || err);
    return;
  }

  // 3. Generate Image using Vertex AI Imagen 4
  console.log('\nGenerating image using Vertex AI Imagen 4 (imagen-4.0-generate-001)...');
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: parsedResult.front_artwork_prompt,
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
    const imagePath = join(__dir, `../front-${dateString}-${runId}.png`);
    writeFileSync(imagePath, buffer);

    console.log('\n--- SUCCESS ---');
    console.log(`Saved the generated image to: ${imagePath}`);

    // Wait for 15 seconds to avoid Vertex AI rate limits (429 Resource exhausted)
    console.log('\nWaiting 15 seconds to avoid API rate limit...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Add BACK image generation immediately after FRONT generation
    console.log('\nGenerating BACK artwork...');

    const backResponse = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: parsedResult.back_artwork_prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '3:4',
        outputMimeType: 'image/png'
      }
    });

    const backImageBytes = backResponse?.generatedImages?.[0]?.image?.imageBytes;
    if (!backImageBytes) {
      throw new Error('No back image bytes returned');
    }

    const backBuffer = Buffer.from(backImageBytes, 'base64');
    const backPath = join(__dir, `../back-${dateString}-${runId}.png`);
    writeFileSync(backPath, backBuffer);

    console.log(`Saved back artwork: ${backPath}`);

  } catch (err) {
    console.error('Failed image generation:', err.message || err);
  }
}

runSandboxTest4();
