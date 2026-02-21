// Gemini API wrapper for SkillLens

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_FALLBACK_MODELS = [
  'models/gemini-2.5-flash',
  'models/gemini-2.5-flash-lite',
  'models/gemini-2.0-flash',
  'models/gemini-2.0-flash-lite'
];

class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.modelNamesPromise = null;
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
    const modelNames = await this.getGenerateContentModels();

    for (const model of modelNames) {
      const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${this.apiKey}`;
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

  async getGenerateContentModels() {
    if (!this.modelNamesPromise) {
      this.modelNamesPromise = this.fetchGenerateContentModels();
    }

    const names = await this.modelNamesPromise;
    if (Array.isArray(names) && names.length) return names;
    return GEMINI_FALLBACK_MODELS;
  }

  async fetchGenerateContentModels() {
    const url = `${GEMINI_API_BASE}/models?key=${this.apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return GEMINI_FALLBACK_MODELS;

      const data = await res.json();
      const models = Array.isArray(data?.models) ? data.models : [];

      const usable = models
        .filter((m) => {
          const name = String(m?.name || '');
          const methods = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
          return name.startsWith('models/gemini-') && methods.includes('generateContent');
        })
        .map((m) => m.name)
        .sort((a, b) => rankModelName(a) - rankModelName(b));

      return usable.length ? usable : GEMINI_FALLBACK_MODELS;
    } catch {
      return GEMINI_FALLBACK_MODELS;
    }
  }
}

function rankModelName(name) {
  const lower = String(name || '').toLowerCase();
  const rank = [
    'models/gemini-2.5-flash',
    'models/gemini-2.5-flash-lite',
    'models/gemini-2.0-flash',
    'models/gemini-2.0-flash-lite'
  ];

  const idx = rank.indexOf(lower);
  return idx === -1 ? rank.length + 1 : idx;
}
