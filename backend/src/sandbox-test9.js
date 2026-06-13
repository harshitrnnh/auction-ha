import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { prisma } from './prisma.js';

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


// 2. UPI Odd News RSS Fetcher
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



// 5. Wikipedia Pageviews (Top English articles from yesterday)
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


// 7. Positive News (Good News Network RSS)
async function fetchPositiveNews() {
    try {
        const res = await fetch('https://www.goodnewsnetwork.org/feed/');
        if (res.ok) {
            const xml = await res.text();
            const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
            const stories = [];
            for (const item of items) {
                const title = item.match(/<title>(.*?)<\/title>/)?.[1] || '';
                let desc = item.match(/<description>(.*?)<\/description>/)?.[1] || '';
                desc = desc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim();
                if (title) {
                    stories.push({
                        headline: cleanText(title),
                        summary: cleanText(desc) || 'An inspiring story of progress and community-driven success.'
                    });
                }
            }
            return stories.slice(0, 10);
        }
    } catch (e) {
        console.log('[Data Collector - Good News Network] Fetch failed:', e.message);
    }
    return [];
}

// Oddity Central RSS Fetcher (Weird News)
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

// Optimist Daily RSS Fetcher (Positive News)
async function fetchOptimistDaily() {
    try {
        const res = await fetch('https://www.optimistdaily.com/feed/');
        if (res.ok) {
            const xml = await res.text();
            const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
            const stories = [];
            for (const item of items) {
                const title = item.match(/<title>(.*?)<\/title>/)?.[1] || '';
                let desc = item.match(/<description>(.*?)<\/description>/)?.[1] || '';
                desc = desc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim();
                if (title) {
                    stories.push({
                        headline: cleanText(title),
                        summary: cleanText(desc) || 'A constructive solutions journalism story.'
                    });
                }
            }
            return stories.slice(0, 10);
        }
    } catch (e) {
        console.log('[Data Collector - Optimist Daily] Fetch failed:', e.message);
    }
    return [];
}

// 8. Polymarket (Top 3 markets by volume)
async function fetchPolymarket() {
    try {
        const res = await fetch('https://gamma-api.polymarket.com/markets?limit=15&order=volume_24hr&ascending=false&active=true');
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
            return results.map(r => ({
                title: cleanText(r.name),
                artist: cleanText(r.artistName)
            }));
        }
    } catch (e) {
        console.log('[Data Collector - Apple Music] Fetch failed:', e.message);
    }
    return [];
}

async function fetchWikipediaOnThisDay(date) {
    try {
        const [yearStr, monthStr, dayStr] = date.split('-');
        const mm = monthStr || '06';
        const dd = dayStr || '08';
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`);
        if (res.ok) {
            const data = await res.json();
            const filtered = data.events.filter(ev => ev.year < (new Date().getFullYear() - 30));
            return filtered.map(ev => ({
                year: String(ev.year),
                event: cleanText(ev.text)
            }));
        }
    } catch (e) {
        console.log('[Data Collector - Wikipedia On This Day] Fetch failed:', e.message);
    }
    return [];
}

// ==========================================
// CORE COLLECT DATA FUNCTION
// ==========================================
const collectDailyData = async (dateString) => {
    console.log('[Data Collector] Gathering all signals for date:', dateString);

    // 1. Fetch yesterday's signals from the database to exclude
    let excludedSignals = [];
    try {
        const lastLot = await prisma.lot.findFirst({
            orderBy: { lotNumber: 'desc' },
        });
        if (lastLot?.artworkHeadline && lastLot.artworkHeadline.startsWith('{')) {
            const parsed = JSON.parse(lastLot.artworkHeadline);
            excludedSignals = parsed.data_signals_used || [];
        }
    } catch (err) {
        console.error('[Data Collector] Failed to load previous lot signals:', err.message);
    }

    const isExcluded = (sigText) => {
        if (!sigText || excludedSignals.length === 0) return false;
        const normSig = String(sigText).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!normSig) return false;
        for (const excluded of excludedSignals) {
            const normExcluded = String(excluded).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normSig.includes(normExcluded) || normExcluded.includes(normSig)) {
                return true;
            }
        }
        return false;
    };

    const upiOddNews = (await fetchUpiOddNews()).filter(item => !isExcluded(item));
    const oddityCentral = (await fetchOddityCentral()).filter(item => !isExcluded(item));
    const wikipediaPageviews = (await fetchWikipediaPageviews(dateString)).filter(item => !isExcluded(item));
    
    const positiveNewsRaw = await fetchPositiveNews();
    const positiveNews = positiveNewsRaw
        .filter(item => !isExcluded(item.headline) && !isExcluded(item.summary))
        .slice(0, 3);
    
    const optimistDailyRaw = await fetchOptimistDaily();
    const optimistDaily = optimistDailyRaw
        .filter(item => !isExcluded(item.headline) && !isExcluded(item.summary))
        .slice(0, 3);
    
    const polymarketRaw = await fetchPolymarket();
    const polymarket = polymarketRaw
        .filter(item => !isExcluded(item.question))
        .slice(0, 5);
    
    const topSongRaw = await fetchAppleMusic();
    const topSong = topSongRaw
        .filter(item => !isExcluded(item.title) && !isExcluded(item.artist))
        .slice(0, 5);
    
    const wikipediaOnThisDayRaw = await fetchWikipediaOnThisDay(dateString);
    const wikipediaOnThisDayFiltered = wikipediaOnThisDayRaw.filter(item => !isExcluded(item.event));
    const wikipediaOnThisDay = wikipediaOnThisDayFiltered.length > 0
        ? wikipediaOnThisDayFiltered[Math.floor(Math.random() * wikipediaOnThisDayFiltered.length)]
        : null;

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
// MAIN TEST EXECUTION (SANDBOX-TEST9)
// ==========================================
async function runSandboxTest9() {
    console.log('--- STARTING REFINED DATA SIGNALS TEST 9 ---');

    const argDate = process.argv[2];
    let dateString = argDate;
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const today = new Date();
        dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    const runId = Date.now();

    // 1. Collect all signals
    const collectedData = await collectDailyData(dateString);
    console.log('\n============================================================');
    console.log('  COLLECTED DATA SIGNALS SUMMARY');
    console.log('============================================================');
    console.log(JSON.stringify(collectedData, null, 2));

    // Resolve Date and Edition dynamically BEFORE Gemini synthesis
    let formattedDate = dateString;
    try {
        const [year, month, day] = dateString.split('-');
        const d = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        formattedDate = d.toLocaleDateString('en-US', {
            timeZone: 'UTC',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }).toUpperCase();
    } catch (e) {
        console.log('[Date Formatting Failed]:', e.message);
    }

    let editionNumber = 1;
    try {
        const lots = await prisma.lot.findMany({
            orderBy: { startsAt: 'asc' }
        });
        const matchingLot = lots.find(l => {
            const d = new Date(l.startsAt);
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const parts = formatter.formatToParts(d);
            const dateMap = {};
            parts.forEach(p => dateMap[p.type] = p.value);
            const istDateStr = `${dateMap.year}-${dateMap.month}-${dateMap.day}`;
            return istDateStr === dateString;
        });
        if (matchingLot) {
            editionNumber = matchingLot.lotNumber;
        } else {
            editionNumber = lots.length + 1;
        }
    } catch (err) {
        console.log('[Prisma Edition Lookup Failed] Using fallback calculation:', err.message);
        const startDate = new Date('2026-05-01');
        const targetDate = new Date(dateString);
        const diffTime = Math.abs(targetDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        editionNumber = Math.max(1, diffDays);
    }

    // 2. Synthesize using Gemini
    const isGeminiKey = !!process.env.GEMINI_API_KEY;
    if (!isGeminiKey && !process.env.GOOGLE_CLOUD_PROJECT) {
        console.log('\n[Gemini Info] No GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT configured. Stopping before API call.');
        return;
    }

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
  "data_signals_used": ["A detailed list of at least 5 daily signals selected from the daily run. For each signal, format it as 'Source Name: specific details' (e.g. 'UPI Weird News: Man solves two Rubik\\'s cubes...'). The Source Name MUST be one of: 'UPI Weird News', 'Oddity Central', 'Wikipedia Top Search', 'Optimist Daily', 'Good News Network', 'Polymarket Trending', 'Top Song', or 'Wikipedia On this Day' (do NOT use category names like 'Positive News' or generic names like 'Daily News' or 'Wikipedia' or 'Future Prediction'). Ensure each signal is from a completely different category (maximum 1 per category, across at least 5 of the 6 defined categories)."],
  "data_signals_used_summarized": ["A summarized list of the selected signals, using exactly 3-4 words per signal, formatted as a clear and parsable list of strings."],
  "essence": "A brief sentence summarizing the thematic essence of the day.",
  "title": "A surrealist title of 3-4 words maximum.",
  "image_prompt": "Highly detailed prompt to generate the complete visual artwork in a vertical 3:4 ratio. The prompt MUST start with: 'Strictly monochrome black and white line art on a 100% solid pitch-black background. Absolutely no color, no green, no yellow, no red, no blue. Absolutely NO text, NO letters, NO words, NO labels, and NO numbers of any kind in the entire image. The entire image is pure visual artwork on a solid pitch-black canvas.' Following this, the prompt must detail the single, large, highly integrated, seamless, surrealist central graphic with absolutely no elements outside of this single connected entity. The entire artwork must be one connected, seamless, surrealist entity drawn in white and light-silver line art, with absolutely no elements, floating details, or shapes outside of this connected entity. Describe how the 5+ selected daily signals from different categories seamlessly morph and fuse into this single continuous composite entity, flowing out of one another, with absolutely NO separate elements placed next to each other, and absolutely NO borders, NO frames, or NO framing lines around the graphic or the canvas. The entire background of the image must be a uniform, continuous, solid pitch-black background. All graphics must be rendered directly on this continuous black background.",
  "interpretive_statement": "A paragraph explaining the artwork's concept. In this statement, you MUST mention the 5 selected daily signals clearly (including their specific news headlines, song titles, probabilities, or historical events) and then explain how they are fused into the unified art statement that formed the visual artwork."
}
`;

    console.log('\nSynthesizing signals via Gemini (gemini-2.5-pro)...');

    let parsedResult = null;
    try {
        const synthResponse = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: `${systemInstruction}\n\nTODAY'S DATA:\n${JSON.stringify(collectedData, null, 2)}\n\nRESOLVED DATE AND EDITION INFO FOR POSTER TEXT:\n- [Resolved Date String] value to use: "${formattedDate}"\n- [Resolved Edition Number] value to use: "${editionNumber}"`,
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
    } finally {
        try {
            await prisma.$disconnect();
        } catch (e) { }
    }
}

runSandboxTest9();
