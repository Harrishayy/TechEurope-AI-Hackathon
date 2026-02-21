// Gemini API wrapper for SkillLens

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash'
];

class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async generateText(systemPrompt, userMessage, options = {}) {
    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: userMessage }]
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.4,
        maxOutputTokens: options.maxTokens ?? 2048,
        responseMimeType: 'application/json'
      }
    };

    const data = await this.generateWithModelFallback(body);
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  async analyzeImage(systemPrompt, userMessage, imageBase64, options = {}) {
    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [
          { text: userMessage },
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 150,
        responseMimeType: 'application/json'
      }
    };

    const data = await this.generateWithModelFallback(body);
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  async analyzeImages(systemPrompt, userMessage, imagesBase64, options = {}) {
    const imageParts = (imagesBase64 || []).map((imageBase64) => ({
      inlineData: { mimeType: 'image/jpeg', data: imageBase64 }
    }));

    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [
          { text: userMessage },
          ...imageParts
        ]
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 2048,
        responseMimeType: 'application/json'
      }
    };

    const data = await this.generateWithModelFallback(body);
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  async analyzeAudio(prompt, audioBase64, mimeType) {
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: audioBase64 } }
        ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 10,
        responseMimeType: 'text/plain'
      }
    };

    const data = await this.generateWithModelFallback(body);
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'none';
  }

  async generateWithModelFallback(body) {
    let lastErr = null;

    for (const model of GEMINI_MODELS) {
      const url = `${GEMINI_BASE}/${model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        return res.json();
      }

      const errText = await res.text();
      lastErr = new Error(`Gemini API error (${res.status}) [${model}]: ${errText}`);
      const shouldTryNextModel = res.status === 404 || res.status === 400 || res.status === 403;
      if (!shouldTryNextModel) {
        throw lastErr;
      }
    }

    throw lastErr || new Error('Gemini API error: no models available.');
  }
}
