// FOV — Two-Phase Coaching Engine (Identify → Track)

(function () {
  const video = document.getElementById('camera');
  const statusLine = document.getElementById('statusLine');
  const stepListEl = document.getElementById('stepList');
  const stepBadge = document.getElementById('stepBadge');
  const statusDot = document.getElementById('statusDot');
  const nextBtn = document.getElementById('nextBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const sopSelect = document.getElementById('sopSelect');
  const loadSopBtn = document.getElementById('loadSopBtn');

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Debug thumbnail
  const DEBUG = location.search.includes('debug');
  if (DEBUG) {
    canvas.style.cssText = 'position:fixed;bottom:80px;right:8px;width:120px;border:2px solid #00e5a0;border-radius:8px;z-index:999;opacity:0.85;';
    document.body.appendChild(canvas);
  }

  const CAPTURE_WIDTH = 1024;
  const JPEG_QUALITY = 0.85;
  const CAPTURE_INTERVAL = 2500;
  const MAX_BACKOFF = 120000;

  let client = null;
  let mode = 'ready'; // 'ready' | 'identifying' | 'coaching' | 'complete'
  let steps = [];           // { action: string, look_for: string, completed: boolean }[]
  let currentStep = 0;      // Index of first uncompleted step
  let availableSops = [];
  let isRunning = false;
  let isPaused = false;
  let isProcessing = false;
  let consecutiveErrors = 0;
  let backoffUntil = 0;
  let currentObject = '';
  let lostObjectStreak = 0;

  init();

  async function init() {
    const apiKey = localStorage.getItem('skilllens_api_key');
    if (!apiKey) {
      showError('No API key found. Go back and set your Gemini key first.');
      return;
    }
    client = new GeminiClient(apiKey);

    updateBadge();
    updateButton();
    nextBtn.addEventListener('click', handleMainButton);
    pauseBtn.addEventListener('click', togglePause);
    loadSopBtn.addEventListener('click', loadSelectedSop);
    hydrateSopSelector();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      video.srcObject = stream;

      await new Promise((resolve) => {
        video.onloadeddata = resolve;
        video.play();
      });

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(1, CAPTURE_WIDTH / vw);
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);

      console.log(`[FOV] Camera: ${vw}x${vh} → Capture: ${canvas.width}x${canvas.height}`);

      if (steps.length > 0) {
        setStatus('Loaded SOP. Tap Start to track progress.');
      } else {
        setStatus('Point your camera at an object, then tap Start.');
      }
      startCaptureLoop();
    } catch (err) {
      console.error('Camera error:', err);
      showError('Camera access denied. Please allow camera permissions and refresh the page.');
    }
  }

  // ── Voice Commands ──────────────────────────────────────────
  //
  // Strategy: Try Gemini Live API (WebSocket, native audio) first.
  // If it fails after a few attempts, fall back to
  // Web Speech API (transcription) + Gemini REST (classification).

  const micIndicator = document.getElementById('micIndicator');
  const voiceLabel = document.getElementById('voiceLabel');
  const transcriptText = document.getElementById('transcriptText');
  let flashTimer = null;
  let voiceMode = 'none'; // 'none' | 'live' | 'fallback'

  // ── Gemini Live API (primary) ──

  const LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  // Models to try in order — first one that connects wins
  const LIVE_MODELS = [
    'models/gemini-2.5-flash-native-audio-preview-12-2025',
    'models/gemini-2.0-flash-live-001',
  ];

  let liveSocket = null;
  let audioContext = null;
  let micStream = null;
  let audioWorklet = null;
  let liveModelIndex = 0;
  let liveFailCount = 0;
  const MAX_LIVE_FAILURES = 4; // after this many failures, switch to fallback

  function buildClassifierPrompt() {
    return `You are a voice command classifier for a hands-free coaching app. The user is performing a physical task and will speak short commands.

Available actions: skip, done, start, pause, resume, reset.
- skip/done = advance to the next step
- start = begin coaching
- pause = pause the session
- resume = unpause the session
- reset = start over

Classify the user's speech into ONE action name. If it is not a command (noise, irrelevant speech, silence), respond "none".

RESPOND WITH ONLY ONE WORD: skip, done, start, pause, resume, reset, or none.`;
  }

  async function initVoice() {
    const apiKey = localStorage.getItem('skilllens_api_key');
    if (!apiKey) return;

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
    } catch (err) {
      console.warn('[FOV] Mic access failed:', err);
      if (err.name === 'NotAllowedError' && micIndicator) {
        micIndicator.classList.add('denied');
      }
      // Mic denied — try fallback which requests its own mic via Web Speech API
      initFallbackVoice();
      return;
    }

    // Use Web Speech API + Gemini REST for voice command classification
    initFallbackVoice();
  }

  function connectLiveApi(apiKey) {
    if (voiceMode === 'fallback') return; // already switched
    if (liveSocket && liveSocket.readyState === WebSocket.OPEN) return;

    const modelName = LIVE_MODELS[liveModelIndex] || LIVE_MODELS[0];
    const url = `${LIVE_WS_URL}?key=${apiKey}`;
    console.log(`[FOV] Trying Live API with ${modelName}...`);
    liveSocket = new WebSocket(url);

    liveSocket.onopen = () => {
      console.log('[FOV] Live API WebSocket open, sending setup...');
      const setup = {
        setup: {
          model: modelName,
          generationConfig: {
            responseModalities: ['TEXT'],
          },
          systemInstruction: {
            parts: [{ text: buildClassifierPrompt() }]
          },
        }
      };
      liveSocket.send(JSON.stringify(setup));
    };

    liveSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.setupComplete) {
          console.log('[FOV] Live API ready — streaming audio');
          voiceMode = 'live';
          liveFailCount = 0;
          if (micIndicator) micIndicator.classList.add('active');
          startAudioStreaming();
          return;
        }

        if (msg.serverContent) {
          const parts = msg.serverContent.modelTurn?.parts || [];
          for (const part of parts) {
            if (part.text) {
              const action = part.text.trim().toLowerCase().replace(/[^a-z]/g, '');
              console.log(`[FOV] Live API: "${part.text.trim()}" → ${action}`);
              if (action && action !== 'none') {
                executeVoiceCommand(action);
                flashMic(action);
              }
            }
          }
          if (msg.serverContent.inputTranscription?.text) {
            console.log(`[FOV] Heard: "${msg.serverContent.inputTranscription.text}"`);
            if (transcriptText) transcriptText.textContent = msg.serverContent.inputTranscription.text;
          }
        }
      } catch (err) {
        console.warn('[FOV] Live API parse error:', err);
      }
    };

    liveSocket.onerror = (err) => {
      console.warn('[FOV] Live API WebSocket error:', err);
    };

    liveSocket.onclose = (event) => {
      console.log(`[FOV] Live API disconnected (code: ${event.code}, reason: "${event.reason}")`);
      if (micIndicator) micIndicator.classList.remove('active');
      stopAudioStreaming();

      if (voiceMode === 'fallback') return; // already switched

      liveFailCount++;

      // If this model failed, try the next one
      if (liveFailCount <= 2 && liveModelIndex < LIVE_MODELS.length - 1) {
        liveModelIndex++;
        console.log(`[FOV] Trying next model: ${LIVE_MODELS[liveModelIndex]}`);
        setTimeout(() => connectLiveApi(apiKey), 500);
        return;
      }

      // If we've exhausted models and retries, switch to fallback
      if (liveFailCount >= MAX_LIVE_FAILURES) {
        console.log('[FOV] Live API failed — switching to Web Speech + Gemini REST fallback');
        initFallbackVoice();
        return;
      }

      // Otherwise retry same model
      if (isRunning) {
        setTimeout(() => connectLiveApi(apiKey), 2000);
      }
    };
  }

  function startAudioStreaming() {
    if (!audioContext || !micStream || !liveSocket) return;

    const source = audioContext.createMediaStreamSource(micStream);
    audioWorklet = new AudioWorkletNode(audioContext, 'pcm-processor');

    audioWorklet.port.onmessage = (event) => {
      if (liveSocket && liveSocket.readyState === WebSocket.OPEN) {
        const base64 = arrayBufferToBase64(event.data);
        liveSocket.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: 'audio/pcm;rate=16000',
              data: base64
            }]
          }
        }));
      }
    };

    source.connect(audioWorklet);
    audioWorklet.connect(audioContext.destination);
  }

  function stopAudioStreaming() {
    if (audioWorklet) {
      try { audioWorklet.disconnect(); } catch { /* ignore */ }
      audioWorklet = null;
    }
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // ── Fallback: Web Speech API transcription + Gemini REST classification ──

  let fallbackProcessing = false;

  function initFallbackVoice() {
    if (voiceMode === 'fallback') return; // already running
    voiceMode = 'fallback';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[FOV] No speech recognition available');
      if (micIndicator) micIndicator.classList.add('unsupported');
      return;
    }

    console.log('[FOV] Using fallback: Web Speech API + Gemini REST');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (micIndicator) micIndicator.classList.add('active');
    };

    recognition.onend = () => {
      if (micIndicator) micIndicator.classList.remove('active');
      if (isRunning) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    recognition.onerror = (event) => {
      console.warn('[FOV] Speech error:', event.error);
      if (event.error === 'not-allowed') {
        if (micIndicator) micIndicator.classList.add('denied');
        return;
      }
      if (isRunning) {
        setTimeout(() => {
          try { recognition.start(); } catch { /* ignore */ }
        }, 1000);
      }
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        const transcript = event.results[i][0].transcript.trim();
        if (transcript.length < 2) continue;
        console.log(`[FOV] Heard: "${transcript}"`);
        if (transcriptText) transcriptText.textContent = transcript;
        classifyWithGemini(transcript);
      }
    };

    try { recognition.start(); } catch { /* ignore */ }

    window.addEventListener('beforeunload', () => {
      try { recognition.stop(); } catch { /* ignore */ }
    });
  }

  async function classifyWithGemini(transcript) {
    // Quick match for obvious short commands (instant, no API call)
    const t = transcript.toLowerCase();
    const wordCount = t.split(/\s+/).length;
    if (wordCount <= 3) {
      const quickMap = [
        { words: ['skip', 'next'], action: 'skip' },
        { words: ['done', 'finished'], action: 'done' },
        { words: ['start', 'begin'], action: 'start' },
        { words: ['pause', 'stop', 'wait', 'hold'], action: 'pause' },
        { words: ['resume', 'continue'], action: 'resume' },
        { words: ['reset', 'restart'], action: 'reset' },
      ];
      for (const entry of quickMap) {
        for (const w of entry.words) {
          if (t.includes(w)) {
            console.log(`[FOV] Quick match: "${transcript}" → ${entry.action}`);
            executeVoiceCommand(entry.action);
            flashMic(entry.action);
            return;
          }
        }
      }
    }

    // Use Gemini REST API for natural language classification
    if (fallbackProcessing || !client) return;
    fallbackProcessing = true;

    try {
      const availableActions = [];
      if (mode === 'ready') availableActions.push('start — begin coaching');
      if (mode === 'coaching') {
        availableActions.push('skip — skip current step');
        availableActions.push('done — mark step complete');
      }
      if (mode === 'coaching' && !isPaused) availableActions.push('pause — pause session');
      if (mode === 'coaching' && isPaused) availableActions.push('resume — resume session');
      if (mode === 'complete') availableActions.push('reset — start over');

      if (availableActions.length === 0) { fallbackProcessing = false; return; }

      const response = await client.generateText(
        `You are a voice command classifier. The user spoke a command to control a coaching app.

Available actions:
${availableActions.map(a => `- ${a}`).join('\n')}

Classify the user's speech into ONE action name, or "none" if irrelevant.
RESPOND WITH ONE WORD ONLY: skip, done, start, pause, resume, reset, or none.`,
        `User said: "${transcript}"`,
        { temperature: 0, maxTokens: 10 }
      );

      const action = response.trim().toLowerCase().replace(/[^a-z]/g, '');
      console.log(`[FOV] Gemini classified: "${transcript}" → ${action}`);

      if (action && action !== 'none') {
        executeVoiceCommand(action);
        flashMic(action);
      }
    } catch (err) {
      console.warn('[FOV] Classification error:', err);
    } finally {
      fallbackProcessing = false;
    }
  }

  // ── Gemini Audio REST API voice commands ──

  let geminiAudioRecorder = null;
  let geminiAudioChunks = [];
  let geminiAudioProcessing = false;
  const AUDIO_CHUNK_DURATION = 3000; // ms per clip

  function initGeminiAudioVoice() {
    if (!micStream) {
      initFallbackVoice();
      return;
    }

    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];
    const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

    try {
      geminiAudioRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : {});
    } catch (err) {
      console.warn('[FOV] MediaRecorder init failed, using Web Speech fallback:', err);
      initFallbackVoice();
      return;
    }

    geminiAudioRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) geminiAudioChunks.push(e.data);
    };

    geminiAudioRecorder.onstop = async () => {
      if (geminiAudioChunks.length === 0) return;
      const blob = new Blob(geminiAudioChunks, { type: geminiAudioRecorder.mimeType });
      geminiAudioChunks = [];
      await classifyAudioWithGemini(blob);
    };

    function recordLoop() {
      if (!isRunning) return;
      geminiAudioChunks = [];
      try {
        geminiAudioRecorder.start();
        setTimeout(() => {
          if (geminiAudioRecorder.state === 'recording') {
            geminiAudioRecorder.stop();
          }
          setTimeout(recordLoop, 200);
        }, AUDIO_CHUNK_DURATION);
      } catch (err) {
        console.warn('[FOV] Audio record loop error:', err);
        setTimeout(recordLoop, 1000);
      }
    }

    voiceMode = 'gemini-audio';
    if (micIndicator) micIndicator.classList.add('active');
    console.log('[FOV] Using Gemini audio REST API for voice commands');
    recordLoop();
  }

  async function classifyAudioWithGemini(blob) {
    if (geminiAudioProcessing || !client) return;
    geminiAudioProcessing = true;

    try {
      const base64 = await blobToBase64(blob);
      const mimeType = blob.type.split(';')[0]; // strip codec params for Gemini
      const response = await client.analyzeAudio(buildClassifierPrompt(), base64, mimeType);
      const action = response.trim().toLowerCase().replace(/[^a-z]/g, '');
      console.log(`[FOV] Gemini audio: "${response.trim()}" → ${action}`);

      if (action && action !== 'none') {
        if (transcriptText) transcriptText.textContent = action;
        executeVoiceCommand(action);
        flashMic(action);
      }
    } catch (err) {
      console.warn('[FOV] Gemini audio classify error:', err);
    } finally {
      geminiAudioProcessing = false;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Shared voice execution ──

  function executeVoiceCommand(command) {
    switch (command) {
      case 'skip':
      case 'done':
        if (mode === 'coaching' && currentStep >= 0 && currentStep < steps.length) {
          markCompleted(currentStep);
        }
        break;
      case 'start':
        if (mode === 'ready') {
          handleMainButton();
        }
        break;
      case 'pause':
        if (!isPaused) togglePause();
        break;
      case 'resume':
        if (isPaused) togglePause();
        break;
      case 'reset':
        if (mode === 'complete') {
          handleMainButton();
        }
        break;
    }
  }

  function flashMic(command) {
    if (!micIndicator) return;
    if (voiceLabel) voiceLabel.textContent = command.toUpperCase();
    clearTimeout(flashTimer);
    micIndicator.classList.add('heard');
    flashTimer = setTimeout(() => {
      micIndicator.classList.remove('heard');
      if (voiceLabel) voiceLabel.textContent = 'LISTENING';
    }, 2000);
  }

  initVoice();

  // ── Capture Loop ──────────────────────────────────────────

  async function startCaptureLoop() {
    isRunning = true;
    statusDot.className = 'status-dot live';
    await sleep(1000);

    while (isRunning) {
      if (!isPaused) {
        if (mode === 'identifying') {
          await identifyObject();
          // One-shot — if it failed, go back to ready
          if (mode === 'identifying') {
            mode = 'ready';
            updateBadge();
            updateButton();
          }
        } else if (mode === 'coaching') {
          await checkProgress();
        }
      }
      await sleep(CAPTURE_INTERVAL);
    }
  }

  // ── Phase 1: Identify ─────────────────────────────────────

  async function identifyObject() {
    if (isProcessing) return;

    const base64 = captureFrame();
    if (!base64) return;

    isProcessing = true;
    setStatus('Identifying object...');

    try {
      const response = await client.analyzeImage(
        `You are FOV, a vision AI that identifies objects and generates step-by-step instructions.

Look at this image. Identify the main object, product, or piece of equipment visible.
Then generate a clear, practical set of 4–8 steps for how to use or interact with it.

RESPOND WITH ONLY a valid JSON object in this exact format:
{
  "object": "name of the object",
  "steps": [
    {
      "action": "short action instruction",
      "look_for": "visual cue that confirms this step"
    }
  ]
}

Rules:
- Each step action should be short and actionable (e.g. "Pull the tab on the top of the can")
- Reference physical features you can see (buttons, handles, labels, etc.)
- Each look_for should describe a visual state the camera can verify
- Steps should follow a logical sequence from start to finish
- If the image is too blurry or dark, respond with: {"object": "unknown", "steps": []}
- No markdown, no extra text — ONLY the JSON object`,
        'Identify this object and generate usage steps.',
        base64,
        { temperature: 0.3, maxTokens: 500 }
      );

      consecutiveErrors = 0;
      const parsed = parseIdentifyResponse(response);

      if (parsed && parsed.steps.length > 0) {
        steps = parsed.steps.map(step => ({ action: step.action, look_for: step.look_for, completed: false }));
        currentStep = 0;
        currentObject = parsed.object;
        lostObjectStreak = 0;
        mode = 'coaching';
        setStatus(`${parsed.object} — follow the steps below`);
        renderSteps();
        updateBadge();
        updateButton();
        console.log(`[FOV] Identified: ${parsed.object}, ${steps.length} steps`);
      } else {
        setStatus('Can\'t identify — move closer or adjust the angle, then tap Start.');
      }
    } catch (err) {
      handleError(err);
    } finally {
      isProcessing = false;
    }
  }

  function parseIdentifyResponse(text) {
    function normalizeSteps(rawSteps) {
      if (!Array.isArray(rawSteps)) return [];

      return rawSteps.map((step) => {
        if (typeof step === 'string' && step.trim()) {
          return {
            action: step.trim(),
            look_for: 'Look for visible completion of this action.'
          };
        }

        if (!step || typeof step !== 'object') return null;

        const action = typeof step.action === 'string'
          ? step.action.trim()
          : (typeof step.text === 'string' ? step.text.trim() : '');

        const lookFor = typeof step.look_for === 'string' && step.look_for.trim()
          ? step.look_for.trim()
          : 'Look for visible completion of this action.';

        if (!action) return null;
        return { action, look_for: lookFor };
      }).filter(Boolean);
    }

    try {
      let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      if (parsed.object && Array.isArray(parsed.steps)) {
        const steps = normalizeSteps(parsed.steps);
        if (steps.length) {
          return { object: parsed.object, steps };
        }
      }
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.object && Array.isArray(parsed.steps)) {
            const steps = normalizeSteps(parsed.steps);
            if (steps.length) {
              return { object: parsed.object, steps };
            }
          }
        } catch { /* give up */ }
      }
    }
    return null;
  }

  // ── Phase 2: Coaching ─────────────────────────────────────

  async function checkProgress() {
    if (isProcessing) return;

    const base64 = captureFrame();
    if (!base64) return;

    isProcessing = true;

    try {
      const stepList = steps.map((s, i) =>
        `${i + 1}. [${s.completed ? 'DONE' : 'TODO'}] ACTION: ${s.action} | LOOK FOR: ${s.look_for}`
      ).join('\n');

      const currentStepText = steps[currentStep] ? steps[currentStep].action : '';
      const currentStepLookFor = steps[currentStep] ? steps[currentStep].look_for : '';

      const response = await client.analyzeImage(
        `You are FOV, a vision AI coach tracking a user's progress through a checklist.

Here is the current step checklist:
${stepList}

The user should be working on step ${currentStep + 1}: "${currentStepText}"
Visual cue for this step: "${currentStepLookFor}"

Look at the camera frame carefully. Describe what you see the user doing or what state the object is in, then determine which step they have reached.

RESPOND WITH ONLY a valid JSON object in this exact format:
{"observation": "brief description of what you see", "completed_step": N, "object_visible": true}

Where N is:
- The highest step number that appears to be done (e.g. 3 means steps 1-3 are complete)
- 0 if the user hasn't visibly started or completed any TODO step yet
- object_visible should be false if the target object is no longer clearly visible

Rules:
- Focus ONLY on the checklist steps — ignore anything else in the scene
- Be generous — if the object looks like it's in the state described by a step, count that step as done
- Look at the physical state of the object, not the user's hands
- For example: if step 2 says "open the lid" and the lid appears open, return 2 even if you didn't see them open it
- If the camera angle changed or a different object is visible, just return 0 — do NOT reset
- No markdown, no extra text — ONLY the JSON object`,
        'What do you see? Which step has been completed? Respond with JSON only.',
        base64,
        { temperature: 0.3, maxTokens: 150 }
      );

      consecutiveErrors = 0;

      const result = parseProgressResponse(response);
      console.log(`[FOV] Progress check:`, response.trim(), '→ parsed:', result);

      if (!result) return;

      if (result.object_visible === false) {
        lostObjectStreak++;
        setStatus(`Lost ${currentObject || 'object'} — bring it back into frame.`);
        return;
      }

      lostObjectStreak = 0;

      if (result.completed_step > 0 && result.completed_step <= steps.length) {
        markCompleted(result.completed_step - 1);
      } else if (currentStep >= 0 && currentStep < steps.length) {
        setStatus(`Step ${currentStep + 1}: ${steps[currentStep].look_for}`);
      }
    } catch (err) {
      handleError(err);
    } finally {
      isProcessing = false;
    }
  }

  function parseProgressResponse(text) {
    try {
      let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      if (typeof parsed.completed_step === 'number') {
        return {
          ...parsed,
          object_visible: typeof parsed.object_visible === 'boolean' ? parsed.object_visible : true
        };
      }
    } catch { /* fall through */ }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.completed_step === 'number') {
          return {
            ...parsed,
            object_visible: typeof parsed.object_visible === 'boolean' ? parsed.object_visible : true
          };
        }
      } catch { /* fall through */ }
    }

    const numMatch = text.match(/-?\d+/);
    if (numMatch) {
      return { observation: text.trim(), completed_step: parseInt(numMatch[0], 10), object_visible: true };
    }

    return null;
  }

  // ── Step Management ───────────────────────────────────────

  function markCompleted(upToIndex) {
    let changed = false;
    for (let i = 0; i <= upToIndex; i++) {
      if (!steps[i].completed) {
        steps[i].completed = true;
        changed = true;
      }
    }

    if (changed) {
      currentStep = steps.findIndex(s => !s.completed);

      if (currentStep === -1) {
        mode = 'complete';
        setStatus('All done — nice work!');
        stepBadge.textContent = 'Complete';
        updateButton();
      } else {
        updateBadge();
      }

      renderSteps();
    }
  }

  function handleMainButton() {
    if (mode === 'ready') {
      mode = steps.length > 0 ? 'coaching' : 'identifying';
      updateBadge();
      updateButton();
      return;
    }

    if (mode === 'identifying') return;

    if (mode === 'complete') {
      resetState();
      setStatus('Point your camera at a new object, then tap Start.');
      return;
    }

    // Coaching mode — skip current step
    if (currentStep >= 0 && currentStep < steps.length) {
      markCompleted(currentStep);
    }
  }

  function resetState() {
    mode = 'ready';
    if (steps.length > 0) {
      steps = steps.map((step) => ({
        action: step.action,
        look_for: step.look_for,
        completed: false
      }));
      currentStep = 0;
    } else {
      steps = [];
      currentStep = 0;
      currentObject = '';
    }
    lostObjectStreak = 0;
    stepListEl.innerHTML = '';
    updateBadge();
    updateButton();
    renderSteps();
  }

  function hydrateSopSelector() {
    const accountId = getAccountId();
    availableSops = loadSopsForAccount(accountId);
    const currentSop = safeJson(localStorage.getItem('skilllens_current_sop'));

    sopSelect.innerHTML = '';
    const identifyOption = document.createElement('option');
    identifyOption.value = '';
    identifyOption.textContent = 'Auto-identify object';
    sopSelect.appendChild(identifyOption);

    availableSops.forEach((sop) => {
      const opt = document.createElement('option');
      opt.value = sop.id;
      opt.textContent = sop.title || `SOP ${sop.id}`;
      sopSelect.appendChild(opt);
    });

    if (currentSop && currentSop.id && availableSops.some((sop) => sop.id === currentSop.id)) {
      sopSelect.value = currentSop.id;
      applySop(currentSop);
    } else {
      sopSelect.value = '';
    }
  }

  function loadSelectedSop() {
    const selectedId = sopSelect.value;
    if (!selectedId) {
      steps = [];
      currentStep = 0;
      currentObject = '';
      lostObjectStreak = 0;
      mode = 'ready';
      renderSteps();
      updateBadge();
      updateButton();
      setStatus('Auto-identify mode enabled. Tap Start to detect object.');
      return;
    }

    const selected = availableSops.find((sop) => sop.id === selectedId);
    if (!selected) {
      showError('Could not load selected SOP.');
      return;
    }

    applySop(selected);
  }

  function applySop(sop) {
    const normalized = normalizeSopSteps(sop);
    if (!normalized.length) {
      showError('Selected SOP has no usable steps.');
      return;
    }

    localStorage.setItem('skilllens_current_sop', JSON.stringify(sop));
    steps = normalized;
    currentStep = 0;
    currentObject = sop.title || '';
    lostObjectStreak = 0;
    mode = 'ready';
    renderSteps();
    updateBadge();
    updateButton();
    setStatus(`${sop.title || 'SOP'} loaded. Tap Start to begin.`);
  }

  function normalizeSopSteps(sop) {
    const rawSteps = Array.isArray(sop.steps) ? sop.steps : [];
    return rawSteps.map((step) => {
      if (typeof step === 'string') {
        const action = step.trim();
        if (!action) return null;
        return {
          action,
          look_for: 'Look for visible completion of this action.',
          completed: false
        };
      }

      const action = typeof step.action === 'string'
        ? step.action.trim()
        : (typeof step.text === 'string' ? step.text.trim() : '');
      if (!action) return null;

      const lookFor = typeof step.look_for === 'string' && step.look_for.trim()
        ? step.look_for.trim()
        : 'Look for visible completion of this action.';

      return { action, look_for: lookFor, completed: false };
    }).filter(Boolean);
  }

  function loadSopsForAccount(accountId) {
    const raw = localStorage.getItem(`skilllens_sops_${accountId}`);
    const parsed = safeJson(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  function getAccountId() {
    return (localStorage.getItem('skilllens_account_id') || 'default').trim();
  }

  function safeJson(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  // ── Rendering ─────────────────────────────────────────────

  function renderSteps() {
    stepListEl.innerHTML = '';

    steps.forEach((step, i) => {
      const el = document.createElement('div');
      el.className = 'step-item';

      if (step.completed) {
        el.classList.add('completed');
      } else if (i === currentStep) {
        el.classList.add('active');
      }

      el.innerHTML =
        `<span class="step-num">${step.completed ? '✓' : i + 1}</span>` +
        `<span class="step-content">` +
          `<span class="step-text">${escapeHtml(step.action)}</span>` +
          `<span class="step-lookfor">Look for: ${escapeHtml(step.look_for)}</span>` +
        `</span>`;

      stepListEl.appendChild(el);
    });

    const activeEl = stepListEl.querySelector('.step-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Frame Capture ─────────────────────────────────────────

  function captureFrame() {
    const now = Date.now();
    if (now < backoffUntil) {
      const waitSec = Math.ceil((backoffUntil - now) / 1000);
      setStatus(`Rate limited — retrying in ${waitSec}s.`);
      return null;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const sample = ctx.getImageData(
      Math.floor(canvas.width / 4),
      Math.floor(canvas.height / 4),
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2)
    );
    if (isFrameBlank(sample)) {
      console.warn('[FOV] Blank frame — skipping');
      return null;
    }

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return dataUrl.split(',')[1];
  }

  function isFrameBlank(imageData) {
    const data = imageData.data;
    let total = 0;
    for (let i = 0; i < data.length; i += 40 * 4) {
      total += data[i] + data[i + 1] + data[i + 2];
    }
    const avgBrightness = total / (data.length / (40 * 4)) / 3;
    return avgBrightness < 5;
  }

  // ── UI Helpers ────────────────────────────────────────────

  function setStatus(text) {
    statusLine.textContent = text;
    statusLine.classList.remove('error');
  }

  function showError(text) {
    statusLine.textContent = text;
    statusLine.classList.add('error');
  }

  function updateBadge() {
    if (mode === 'ready') {
      stepBadge.textContent = steps.length ? 'SOP READY' : 'READY';
    } else if (mode === 'identifying') {
      stepBadge.textContent = 'SCANNING';
    } else if (mode === 'coaching') {
      const done = steps.filter(s => s.completed).length;
      stepBadge.textContent = `${done}/${steps.length}`;
    } else {
      stepBadge.textContent = 'COMPLETE';
    }
  }

  function updateButton() {
    if (mode === 'ready') {
      nextBtn.textContent = steps.length ? 'ENGAGE' : 'SCAN';
    } else if (mode === 'identifying') {
      nextBtn.textContent = 'SCANNING...';
    } else if (mode === 'coaching') {
      nextBtn.innerHTML = 'SKIP \u2192';
    } else {
      nextBtn.textContent = 'NEW TARGET';
    }
  }

  function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
      statusDot.className = 'status-dot paused';
      pauseBtn.textContent = '\u25B6';
      pauseBtn.title = 'Resume';
    } else {
      statusDot.className = 'status-dot live';
      pauseBtn.textContent = '\u23F8';
      pauseBtn.title = 'Pause';
    }
  }

  // ── Error Handling ────────────────────────────────────────

  function handleError(err) {
    console.error('[FOV] Error:', err);
    consecutiveErrors++;

    if (err.message.includes('429')) {
      const retryMatch = err.message.match(/retryDelay.*?(\d+)s/);
      const serverDelay = retryMatch ? parseInt(retryMatch[1]) * 1000 : 0;
      const expBackoff = Math.min(MAX_BACKOFF, CAPTURE_INTERVAL * Math.pow(2, consecutiveErrors));
      const delay = Math.max(serverDelay, expBackoff);
      backoffUntil = Date.now() + delay;
      const delaySec = Math.ceil(delay / 1000);
      console.warn(`[FOV] Rate limited — backing off ${delaySec}s`);
      setStatus(`Rate limited — waiting ${delaySec}s before retrying.`);
    } else if (err.message.includes('400')) {
      showError('Invalid API key. Go back and check your Gemini key.');
      isRunning = false;
    } else if (err.message.includes('403')) {
      showError('API key not authorized. Enable the Gemini API in Google AI Studio.');
      isRunning = false;
    } else {
      setStatus('Connection issue — retrying...');
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  window.addEventListener('beforeunload', () => {
    isRunning = false;
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
    }
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
    }
    if (liveSocket) {
      try { liveSocket.close(); } catch { /* ignore */ }
    }
    if (audioContext) {
      try { audioContext.close(); } catch { /* ignore */ }
    }
  });
})();
