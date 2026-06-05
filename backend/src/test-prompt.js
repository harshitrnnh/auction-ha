import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// 1. Load .env environment variables
const __dir = dirname(fileURLToPath(import.meta.url));
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
    console.log('[Test Prompt] Loaded GCP credentials to:', keyPath);
  } catch (err) {
    console.error('[Test Prompt] Failed to write GCP_SERVICE_ACCOUNT_JSON:', err.message);
  }
}

// 3. Define the Prompt to test
// ---> Feel free to edit the prompt string below to refine it! <---
const testPrompt = `A striking streetwear T-shirt graphic design, minimal vector artwork, flat screen-printed style, deep black background. Theme is inspired by today's main story: " Delhi hotel fire: Hotel building owner arrested after Malviya Nagar fire kills 21". Neo-noir, retro-futurism aesthetic, cosmic stardust gradients, sharp cybernetic lines. Clean, high contrast, isolated on black background. Absolutely no text, no words, no letters, no signature, no borders.`;

async function runPromptTest() {
  console.log('--- STARTING IMAGEN PROMPT TEST ---');
  const isGeminiKey = !!process.env.GEMINI_API_KEY;
  console.log('Mode:', isGeminiKey ? 'Gemini Developer API (Google AI Studio Key)' : 'Vertex AI Project');
  if (isGeminiKey) {
    console.log('Gemini API Key: Found');
  } else {
    console.log('Project ID:', process.env.GOOGLE_CLOUD_PROJECT);
    console.log('Location:', process.env.GOOGLE_CLOUD_LOCATION || 'us-central1');
  }
  console.log('Testing prompt:', `"${testPrompt}"`);

  if (!isGeminiKey && !process.env.GOOGLE_CLOUD_PROJECT) {
    console.error('ERROR: Neither GEMINI_API_KEY nor GOOGLE_CLOUD_PROJECT is configured in backend/.env');
    return;
  }

  try {
    const ai = isGeminiKey
      ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
      : new GoogleGenAI({
          vertexai: true,
          project: process.env.GOOGLE_CLOUD_PROJECT,
          location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        });

    console.log('Sending request to Google Gen AI (imagen-3.0-generate-002)...');
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: testPrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '3:4', // Best aspect ratio for T-shirt print graphics
        outputMimeType: 'image/png',
      },
    });

    const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) {
      throw new Error('No image bytes returned from Google Gen AI');
    }

    const buffer = Buffer.from(imageBytes, 'base64');
    const outputPath = join(__dir, '../test-artwork.png');
    writeFileSync(outputPath, buffer);

    console.log('--- GENERATION COMPLETED ---');
    console.log(`Success! Saved the generated image to: ${outputPath}`);
  } catch (err) {
    console.error('--- GENERATION FAILED ---');
    console.error(err.message || err);
  }
}

runPromptTest();
