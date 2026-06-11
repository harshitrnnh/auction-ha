import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { prisma } from './prisma.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Helper to decode HTML/XML entities and clean tags
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ==========================================
// INDIVIDUAL DATA COLLECTORS
// ==========================================

async function fetchUpiOddNews() {
  const urls = [
    'https://rss.upi.com/news/odd_news.rss',
    'https://www.upi.com/rss/Odd_News/'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      const news = [];

      for (const item of items) {
        const title = item.match(/<title>(.*?)<\/title>/)?.[1] || '';
        if (title) {
          news.push(cleanText(title));
        }
      }
      if (news.length > 0) return news.slice(0, 5);
    } catch (e) {
      console.log(`[Data Collector - UPI Odd News] Failed for ${url}:`, e.message);
    }
  }
  return [];
}

async function fetchWikipediaPageviews(date) {
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
        return filtered.slice(0, 5).map(art => cleanText(art.article.replace(/_/g, ' ')));
      }
      return null;
    };
    return await fetchWiki(1) || await fetchWiki(2) || [];
  } catch (e) {
    console.log('[Data Collector - Wikipedia Pageviews] Failed:', e.message);
    return [];
  }
}

async function fetchPositiveNews() {
  try {
    const res = await fetch('https://www.goodnewsnetwork.org/feed/');
    if (res.ok) {
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      if (items.length > 0) {
        const title = items[0].match(/<title>(.*?)<\/title>/)?.[1] || '';
        let desc = items[0].match(/<description>(.*?)<\/description>/)?.[1] || '';
        desc = desc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim();
        return {
          headline: cleanText(title),
          summary: cleanText(desc) || 'An inspiring story of progress and community-driven success.'
        };
      }
    }
  } catch (e) {
    console.log('[Data Collector - Good News Network] Fetch failed:', e.message);
  }
  return null;
}

async function fetchOddityCentral() {
  try {
    const res = await fetch('https://www.odditycentral.com/feed/');
    if (res.ok) {
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      const news = [];
      for (const item of items) {
        const title = item.match(/<title>(.*?)<\/title>/)?.[1] || '';
        if (title) {
          news.push(cleanText(title));
        }
      }
      return news.slice(0, 5);
    }
  } catch (e) {
    console.log('[Data Collector - Oddity Central] Fetch failed:', e.message);
  }
  return [];
}

async function fetchOptimistDaily() {
  try {
    const res = await fetch('https://www.optimistdaily.com/feed/');
    if (res.ok) {
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      if (items.length > 0) {
        const title = items[0].match(/<title>(.*?)<\/title>/)?.[1] || '';
        let desc = items[0].match(/<description>(.*?)<\/description>/)?.[1] || '';
        desc = desc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim();
        return {
          headline: cleanText(title),
          summary: cleanText(desc) || 'A constructive solutions journalism story.'
        };
      }
    }
  } catch (e) {
    console.log('[Data Collector - Optimist Daily] Fetch failed:', e.message);
  }
  return null;
}

async function fetchPolymarket() {
  try {
    const res = await fetch('https://gamma-api.polymarket.com/markets?limit=3&order=volume_24hr&ascending=false&active=true');
    if (res.ok) {
      const data = await res.json();
      return data.map(m => {
        let prob = null;
        if (m.outcomePrices) {
          try {
            const prices = JSON.parse(m.outcomePrices);
            prob = parseFloat(prices[0]);
          } catch { }
        }
        return { question: cleanText(m.question), yes_probability: prob };
      });
    }
  } catch (e) {
    console.log('[Data Collector - Polymarket] Fetch failed:', e.message);
  }
  return [];
}

async function fetchAppleMusic() {
  try {
    const res = await fetch('https://rss.applemarketingtools.com/api/v2/us/music/most-played/10/songs.json');
    if (res.ok) {
      const data = await res.json();
      const results = data.feed?.results || [];
      if (results.length > 0) {
        return {
          title: cleanText(results[0].name),
          artist: cleanText(results[0].artistName)
        };
      }
    }
  } catch (e) {
    console.log('[Data Collector - Apple Music] Fetch failed:', e.message);
  }
  return null;
}

async function fetchWikipediaOnThisDay(date) {
  try {
    const [yearStr, monthStr, dayStr] = date.split('-');
    const mm = monthStr || '06';
    const dd = dayStr || '11';
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`);
    if (res.ok) {
      const data = await res.json();
      const filtered = data.events.filter(ev => ev.year < (new Date().getFullYear() - 30));
      if (filtered.length > 0) {
        const randomEvent = filtered[Math.floor(Math.random() * filtered.length)];
        return {
          year: String(randomEvent.year),
          event: cleanText(randomEvent.text)
        };
      }
    }
  } catch (e) {
    console.log('[Data Collector - Wikipedia On This Day] Fetch failed:', e.message);
  }
  return null;
}

const collectDailyData = async (dateString) => {
  console.log('[Data Collector] Gathering all signals for date:', dateString);

  const upiOddNews = await fetchUpiOddNews();
  const oddityCentral = await fetchOddityCentral();
  const wikipediaPageviews = await fetchWikipediaPageviews(dateString);
  const positiveNews = await fetchPositiveNews();
  const optimistDaily = await fetchOptimistDaily();
  const polymarket = await fetchPolymarket();
  const topSong = await fetchAppleMusic();
  const wikipediaOnThisDay = await fetchWikipediaOnThisDay(dateString);

  return {
    date: dateString,
    data_signals_of_the_day: {
      upi_weird_news: upiOddNews,
      oddity_central: oddityCentral,
      top_wikipedia: wikipediaPageviews,
      positive_news: positiveNews,
      optimist_daily: optimistDaily,
      polymarket: polymarket,
      top_song: topSong,
      wikipedia_on_this_day: wikipediaOnThisDay
    }
  };
};

// ==========================================
// BACKWARD COMPATIBLE EXPORTS & HELPERS
// ==========================================

export async function fetchTopHeadlines(count = 7) {
  return [];
}

export async function fetchDailyHeadline() {
  return 'Mysterious Alignment of Outer Space Cosmic Anomalies';
}

async function saveAndUploadArtwork(buffer, lotNumber, headline, prompt, filePath, localUrl) {
  // 1. Save locally
  await fs.writeFile(filePath, buffer);
  console.log(`[Art Generator] Saved artwork locally to ${filePath}`);

  // 2. Upload to GCS if configured
  if (process.env.GCS_BUCKET_NAME) {
    console.log(`[Art Generator] GCS_BUCKET_NAME configured: "${process.env.GCS_BUCKET_NAME}". Uploading...`);
    try {
      const storage = new Storage();
      const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
      const destination = `artwork/lot-${lotNumber}.png`;
      const file = bucket.file(destination);
      
      await file.save(buffer, {
        contentType: 'image/png',
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });

      try {
        await file.makePublic();
      } catch (e) {
        console.log('[Art Generator] GCS makePublic() skipped/failed. Ensure your bucket permissions allow public reads.');
      }

      const gcsUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${destination}`;
      console.log(`[Art Generator] Uploaded to GCS successfully! URL: ${gcsUrl}`);
      return { artworkUrl: gcsUrl, artworkHeadline: headline, artworkPrompt: prompt };
    } catch (gcsErr) {
      console.error('[Art Generator] GCS Upload failed, falling back to local URL:', gcsErr.message);
    }
  }

  return { artworkUrl: localUrl, artworkHeadline: headline, artworkPrompt: prompt };
}

// ==========================================
// CORE GENERATION SERVICE
// ==========================================

export async function generateDailyArtwork(lotNumber) {
  console.log(`--- GENERATING DAILY ARTWORK FOR LOT ${lotNumber} ---`);

  // Resolve current date in IST
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateString = formatter.format(today); // returns YYYY-MM-DD

  // 1. Collect all signals
  const collectedData = await collectDailyData(dateString);

  // Default values in case Gemini fails
  let title = `Untitled (Drift No. ${lotNumber})`;
  let lotHeadlineStr = JSON.stringify({
    title,
    data_signals_used: [],
    data_signals_used_summarized: []
  });
  let prompt = `Strictly monochrome black and white line art on a 100% solid pitch-black background. A vertical 3:4 composition. Pure visual artwork with absolutely no text, letters, or numbers.`;

  const outputDir = join(__dir, '../public/artwork');
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `lot-${lotNumber}.png`;
  const filePath = join(outputDir, fileName);
  const localUrl = `/public/artwork/${fileName}`;

  // 2. Synthesize using Gemini
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_PROJECT) {
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
COMPOSITION & ARTWORK ARCHITECTURE
========================================

- The artwork must be a complete vertical visual composition with a 3:4 aspect ratio, generated on a plain solid black background.
- NO TEXT OF ANY KIND: The generated image must contain absolutely NO text, NO words, NO letters, NO numbers, NO labels, and NO characters of any kind. The entire image must be purely visual artwork. Do NOT print the date, edition number, title, headers, or any other text inside the image.
- Absolutely NO borders, NO framing lines, NO background grids, NO frames, NO cartographic borders, and NO border decorations around the artwork or canvas.
- **SIGNALS INTEGRATION REQUIREMENT**: You must select a minimum of 5 daily signals to incorporate into the central graphic and list in the metadata. Each of these selected signals must come from a completely different category. The 6 categories are:
    1. Weird News: Contains 'upi_weird_news' and 'oddity_central'.
    2. Global Attention: Contains 'top_wikipedia'.
    3. Positive News: Contains 'positive_news' and 'optimist_daily'.
    4. Future Prediction: Contains 'polymarket'.
    5. Cultural Resonance: Contains 'top_song'.
    6. Historical Lens: Contains 'wikipedia_on_this_day'.
  You must select at most 1 signal per category, selecting from at least 5 different categories.
- The structure of the visual artwork is as follows:
  - CENTRAL ARTWORK: A large, perfectly centered, highly surrealist and dream-like graphic, drawn in white and light-silver line art on the solid black background, occupying the entire composition.
  - **CRITICAL - ONE CONNECTED SEAMLESS SURREALIST ENTITY**: The graphic must be ONE SINGLE, unified, connected, seamless, surrealist entity. Absolutely no elements, details, lines, shapes, particles, or visual components of any kind are to exist outside of this single connected entity.
  - **NO EXTRA ELEMENTS**: The entire graphic must form a single, unified, continuous structure. There must be no floating, isolated, or separate objects, elements, or details anywhere in the image. If any detail represents a signal, it must be physically connected to and morphing into/out of the main body of this single entity.
  - **SEAMLESS MORPHING**: All elements representing the 5+ selected categories must physically morph, dissolve, and flow out of one another as a single continuous form. Avoid placing separate elements on top of or next to each other.

========================================
FIXED VISUAL LANGUAGE (CRITICAL)
========================================

Every artwork must strictly adhere to the following visual constraints:
- 100% MONOCHROME: Only white and light-silver linework on a plain solid 100% pitch-black background. Absolutely NO other colors (no green, no yellow, no blue, no red, no grey tones, no color gradients).
- SOLID PITCH-BLACK CANVAS: The entire canvas/background must be completely and uniformly black. Absolutely NO white banners, NO white background strips, NO grey boxes, NO white panels, and NO highlighted containers.
- Vector illustration aesthetic, crisp clean lines, high contrast, strong silhouette, graphic clarity, clean negative space.
- Allowed mark-making: contour lines, crosshatching, stippling, engraved linework.
- STRICTLY FORBIDDEN: Any colors (such as green, yellow, or blue), painterly rendering, color gradients, soft airbrushing, cinematic lighting, photographic realism, 3D rendering, or glossy/watercolor/oil effects.

========================================
OUTPUT FORMAT
=============

Return a JSON object with this exact structure:

{
  "date": "YYYY-MM-DD",
  "data_signals_used": ["A detailed list of at least 5 daily signals selected from the daily run. For each signal, specify the category name followed by the specific headline, song title, probability, or historical event that was fetched and incorporated. Ensure each signal is from a completely different category (maximum 1 per category, across at least 5 of the 6 defined categories)."],
  "data_signals_used_summarized": ["A summarized list of the selected signals, using exactly 3-4 words per signal, formatted as a clear and parsable list of strings."],
  "essence": "A brief sentence summarizing the thematic essence of the day.",
  "title": "A surrealist title of 3-4 words maximum.",
  "image_prompt": "Highly detailed prompt to generate the complete visual artwork in a vertical 3:4 ratio. The prompt MUST start with: 'Strictly monochrome black and white line art on a 100% solid pitch-black background. Absolutely no color, no green, no yellow, no red, no blue. Absolutely NO text, NO letters, NO words, NO labels, and NO numbers of any kind in the entire image. The entire image is pure visual artwork on a solid pitch-black canvas.' Following this, the prompt must detail the single, large, highly integrated, seamless, surrealist central graphic with absolutely no elements outside of this single connected entity. The entire artwork must be one connected, seamless, surrealist entity drawn in white and light-silver line art, with absolutely no elements, floating details, or shapes outside of this connected entity. Describe how the 5+ selected daily signals from different categories seamlessly morph and fuse into this single continuous composite entity, flowing out of one another, with absolutely NO separate elements placed next to each other, and absolutely NO borders, NO frames, or NO framing lines around the graphic or the canvas. The entire background of the image must be a uniform, continuous, solid pitch-black background. All graphics must be rendered directly on this continuous black background.",
  "interpretive_statement": "A paragraph explaining the artwork's concept. In this statement, you MUST mention the 5 selected daily signals clearly (including their specific news headlines, song titles, probabilities, or historical events) and then explain how they are fused into the unified art statement that formed the visual artwork."
}
`;

    try {
      console.log('[Art Generator] Synthesizing headlines via Gemini gemini-2.5-pro...');
      const synthResponse = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `${systemInstruction}\n\nTODAY'S DATA:\n${JSON.stringify(collectedData, null, 2)}`,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const parsedResult = JSON.parse(synthResponse.text);
      console.log('[Art Generator] Gemini Synthesis Output:', JSON.stringify(parsedResult, null, 2));

      title = parsedResult.title;
      prompt = parsedResult.image_prompt;
      lotHeadlineStr = JSON.stringify({
        title: parsedResult.title,
        data_signals_used: parsedResult.data_signals_used,
        data_signals_used_summarized: parsedResult.data_signals_used_summarized,
        essence: parsedResult.essence,
        interpretive_statement: parsedResult.interpretive_statement
      });
    } catch (err) {
      console.error('[Art Generator] Gemini synthesis failed, using default parameters:', err.message);
    }

    // 3. Generate visual artwork using Vertex AI Imagen 4
    try {
      console.log('[Art Generator] Generating image using Vertex AI Imagen 4 (imagen-4.0-generate-001)...');
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '3:4',
          outputMimeType: 'image/png',
        },
      });

      const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
      if (imageBytes) {
        const buffer = Buffer.from(imageBytes, 'base64');
        return await saveAndUploadArtwork(buffer, lotNumber, lotHeadlineStr, prompt, filePath, localUrl);
      } else {
        throw new Error('Empty image bytes received from Imagen API.');
      }
    } catch (err) {
      console.error('[Art Generator] Imagen generation failed:', err.message);
    }
  }

  // Fallback to abstract picsum photos placeholder
  console.log('[Art Generator] Falling back to Picsum placeholder...');
  try {
    const response = await fetch(`https://picsum.photos/seed/${lotNumber}/800/800`);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return await saveAndUploadArtwork(buffer, lotNumber, lotHeadlineStr, prompt, filePath, localUrl);
    }
  } catch (err) {
    console.error('[Art Generator] Picsum fallback failed:', err.message);
  }

  return { artworkUrl: null, artworkHeadline: lotHeadlineStr, artworkPrompt: prompt };
}
