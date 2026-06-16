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

// 3. Fetch News RSS headlines helpers
async function fetchGnnHeadlines(count = 5) {
  console.log('Fetching Good News Network headlines...');
  try {
    const response = await fetch('https://www.goodnewsnetwork.org/feed/');
    if (!response.ok) throw new Error('Failed to fetch GNN RSS feed');

    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const headlines = [];

    for (let i = 0; i < Math.min(items.length, count); i++) {
      const titleMatch = items[i].match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        headlines.push(decodeHtmlEntities(titleMatch[1].trim()));
      }
    }
    return headlines;
  } catch (err) {
    console.error('Error fetching GNN news:', err.message);
    return [];
  }
}

async function fetchGoogleHeadlines(count = 5) {
  console.log('Fetching Google News headlines...');
  try {
    const response = await fetch('https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en');
    if (!response.ok) throw new Error('Failed to fetch Google News RSS feed');

    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const headlines = [];

    for (let i = 0; i < Math.min(items.length, count); i++) {
      const titleMatch = items[i].match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        const rawHeadline = titleMatch[1];
        const cleaned = rawHeadline.split(' - ').slice(0, -1).join(' - ') || rawHeadline;
        headlines.push(decodeHtmlEntities(cleaned.trim()));
      }
    }
    return headlines;
  } catch (err) {
    console.error('Error fetching Google news:', err.message);
    return [];
  }
}

// 4. Main test execution
async function runSandboxTest() {
  console.log('--- STARTING PROMPT & NEWS MERGE SANDBOX TEST ---');

  const isGeminiKey = !!process.env.GEMINI_API_KEY;
  const ai = isGeminiKey
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });

  // Step A: Fetch current news headlines
  let gnn = [];
  let google = [];
  try {
    gnn = await fetchGnnHeadlines(5);
    google = await fetchGoogleHeadlines(5);
    console.log('\nCaptured Headlines:');
    console.log('  --- Positive News (GNN) ---');
    gnn.forEach((h, idx) => console.log(`  ${idx + 1}. ${h}`));
    console.log('  --- Regular News (Google) ---');
    google.forEach((h, idx) => console.log(`  ${idx + 1}. ${h}`));
  } catch (err) {
    console.error('Error fetching news:', err.message);
  }

  const headlines = [...gnn, ...google];
  if (headlines.length === 0) {
    headlines.push('Mysterious Alignment of Outer Space Cosmic Anomalies');
  }

  // Step B: Define your prompt refinement instructions here!
  // Feel free to tweak these system instructions to refine the style, vibe, visual structure, etc.
  const systemInstruction = `
    You are a creative director for a high-end witty tongue in cheek streetwear fashion brand.
    Analyze the news headlines of the day (which include a mix of positive stories and general news) and extract a cohesive artistic theme, aesthetic mood, and abstract concepts.
    
    Synthesize them into:
    1. A short note summarizing the day's vibe/theme (reference elements of the day from the news synthesis, keep it conceptually rich).
    2. A t-shirt graphic image generation prompt that blends visual elements/metaphors inspired by these news stories in a witty tongue in cheek humorous way.
       Create a humorous take on a detailed artwork that somehow ties in a relevant artwork from the past. Make the art in semi-minimal pencil sketch style in isolated on a deep black background. Keep it strongly tied to the original artwork- though introduce lots of elements relevant to the news items.
       Write a witty 2-5 word phrase below the artwork which captures the vibe in a poetic semi abstract way. Absolutely no borders.
    3. A brief description of the artwork it generated, written in the style of a witty artist statement (1-2 sentences explaining the concept and the visual metaphor). Make sure to reference the artwork from the past you have chosen to work with in this.

    Return a JSON object with keys "headline", "prompt", and "statement".
  `;

  console.log('\nSynthesizing headlines via Gemini (gemini-2.5-flash)...');
  const listText = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');

  let synthesizedHeadline = '';
  let synthesizedPrompt = '';
  let artistStatement = '';

  try {
    const synthResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${systemInstruction}\n\nHeadlines of the Day:\n${listText}`,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const parsed = JSON.parse(synthResponse.text);
    synthesizedHeadline = parsed.headline;
    synthesizedPrompt = parsed.prompt;
    artistStatement = parsed.statement;

    console.log('\n--- Gemini Synthesis Output ---');
    console.log('Synthesized Vibe/Headline:', `"${synthesizedHeadline}"`);
    console.log('Synthesized Image Prompt:', `"${synthesizedPrompt}"`);
    console.log('Artist Statement:', `"${artistStatement}"\n`);
  } catch (err) {
    console.error('Failed Gemini synthesis:', err.message || err);
    return;
  }

  // Step C: Generate Image using Vertex AI Imagen 3
  console.log('Generating image using Vertex AI Imagen 3 (imagen-3.0-generate-002)...');
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: synthesizedPrompt,
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
    const num = Math.random();
    const outputPath = join(__dir, `../sandbox-artwork${num}.png`);
    writeFileSync(outputPath, buffer);

    console.log('\n--- SUCCESS ---');
    console.log(`Saved the generated image to: ${outputPath}`);
  } catch (err) {
    console.error('Failed image generation:', err.message || err);
  }
}

runSandboxTest();
