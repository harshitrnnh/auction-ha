import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';

const __dir = dirname(fileURLToPath(import.meta.url));

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export async function fetchDailyHeadline() {
  try {
    console.log('[Art Generator] Fetching latest headlines from Google News RSS...');
    const response = await fetch('https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en');
    if (!response.ok) throw new Error('Failed to fetch RSS feed');
    
    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    
    if (items.length > 0) {
      const firstItem = items[0];
      const titleMatch = firstItem.match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        const rawHeadline = titleMatch[1];
        // Google News titles are usually "Headline - Source". Strip the source.
        const cleaned = rawHeadline.split(' - ').slice(0, -1).join(' - ') || rawHeadline;
        return decodeHtmlEntities(cleaned.trim());
      }
    }
    throw new Error('No items or titles found in news RSS feed');
  } catch (err) {
    console.error('[Art Generator] Error fetching news:', err.message);
    // Fallback headline if fetch fails
    return 'Mysterious Alignment of Outer Space Cosmic Anomalies';
  }
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

export async function generateDailyArtwork(lotNumber) {
  const headline = await fetchDailyHeadline();
  console.log(`[Art Generator] Daily news headline resolved: "${headline}"`);

  // Prompt engineered for streetwear screen-print look on dark T-shirts, isolated on black
  const prompt = `A striking streetwear T-shirt graphic design, minimal vector artwork, flat screen-printed style, deep black background. Theme is inspired by today's main story: "${headline}". Neo-noir, retro-futurism aesthetic, cosmic stardust gradients, sharp cybernetic lines. Clean, high contrast, isolated on black background. Absolutely no text, no words, no letters, no signature, no borders.`;
  console.log(`[Art Generator] Generated prompt: "${prompt}"`);

  const outputDir = join(__dir, '../public/artwork');
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `lot-${lotNumber}.png`;
  const filePath = join(outputDir, fileName);
  
  // URL that frontend will access locally
  const localUrl = `/public/artwork/${fileName}`;

  // 1. Try Vertex AI Imagen 3 if GOOGLE_CLOUD_PROJECT exists
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    console.log('[Art Generator] GOOGLE_CLOUD_PROJECT found. Generating artwork via Vertex AI Imagen 3...');
    try {
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      });

      const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '3:4',
          outputMimeType: 'image/png',
        },
      });

      const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes;
      if (!imageBytes) {
        throw new Error('No image bytes returned from Vertex AI');
      }

      const buffer = Buffer.from(imageBytes, 'base64');
      return await saveAndUploadArtwork(buffer, lotNumber, headline, prompt, filePath, localUrl);
    } catch (err) {
      console.error('[Art Generator] Vertex AI Imagen 3 generation failed, checking fallbacks...', err.message);
    }
  }

  // 2. Try Stability AI if key exists
  if (process.env.STABILITY_API_KEY) {
    console.log('[Art Generator] Stability AI API Key found. Generating artwork via Stable Diffusion...');
    try {
      const response = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
          },
          body: JSON.stringify({
            text_prompts: [{ text: prompt, weight: 1 }],
            cfg_scale: 7,
            height: 1024,
            width: 768,
            steps: 30,
            samples: 1,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stability API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const base64 = data.artifacts[0].base64;
      const buffer = Buffer.from(base64, 'base64');
      return await saveAndUploadArtwork(buffer, lotNumber, headline, prompt, filePath, localUrl);
    } catch (err) {
      console.error('[Art Generator] Stability AI generation failed, checking OpenAI fallback...', err.message);
    }
  }

  // 3. Try OpenAI if key exists
  if (process.env.OPENAI_API_KEY) {
    console.log('[Art Generator] OpenAI API Key found. Generating artwork via DALL-E 3...');
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const base64 = data.data[0].b64_json;
      const buffer = Buffer.from(base64, 'base64');
      return await saveAndUploadArtwork(buffer, lotNumber, headline, prompt, filePath, localUrl);
    } catch (err) {
      console.error('[Art Generator] OpenAI generation failed, falling back to mock...', err.message);
    }
  }

  // 4. Fallback: Download a high-quality abstract image from Picsum Photos
  console.log('[Art Generator] No API Keys found or APIs failed. Fetching seeded placeholder artwork...');
  try {
    const response = await fetch(`https://picsum.photos/seed/${lotNumber}/800/800`);
    if (!response.ok) throw new Error('Picsum fetch failed');
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return await saveAndUploadArtwork(buffer, lotNumber, headline, prompt, filePath, localUrl);
  } catch (err) {
    console.error('[Art Generator] Mock generation failed:', err.message);
    return { artworkUrl: null, artworkHeadline: headline, artworkPrompt: prompt };
  }
}
