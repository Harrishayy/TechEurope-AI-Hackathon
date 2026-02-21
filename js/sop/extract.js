// SkillLens — SOP Extraction logic

(function () {
  const GEMINI_SOP_SYSTEM_PROMPT = `You are an expert at creating Standard Operating Procedures (SOPs) for physical, hands-on trades.

Convert the user's training content into a structured SOP.

Output a JSON object with this EXACT structure and nothing else - no markdown fences, no explanation:
{
  "title": "Name of the procedure",
  "role": "job role (e.g., barista, electrician, plumber)",
  "steps": [
    {
      "step": 1,
      "action": "Clear, concise instruction for what to do",
      "look_for": "Visual cue that confirms this step is being performed correctly",
      "common_mistakes": "What could go wrong at this step"
    }
  ]
}

Rules:
- Each step should be a single physical action
- Keep action descriptions under 15 words
- Include 8-15 steps for a typical procedure
- Order steps chronologically
- Be specific about quantities, times, and positions where relevant
- Return ONLY the JSON object`;

  const sourceMode = document.getElementById('sourceMode');
  const textSection = document.getElementById('textSection');
  const videoSection = document.getElementById('videoSection');
  const liveSection = document.getElementById('liveSection');

  const contentInput = document.getElementById('contentInput');
  const contextInput = document.getElementById('contextInput');
  const videoFileInput = document.getElementById('videoFile');

  const livePreviewWrap = document.getElementById('livePreviewWrap');
  const livePreview = document.getElementById('livePreview');
  const recordingBadge = document.getElementById('recordingBadge');
  const recordTimer = document.getElementById('recordTimer');
  const recordedPreviewWrap = document.getElementById('recordedPreviewWrap');
  const recordedPreview = document.getElementById('recordedPreview');
  const startRecordBtn = document.getElementById('startRecordBtn');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  const recordStatus = document.getElementById('recordStatus');

  const generateBtn = document.getElementById('generateBtn');
  const spinner = document.getElementById('spinner');
  const msgEl = document.getElementById('msg');
  const sopPreview = document.getElementById('sopPreview');
  const sopSteps = document.getElementById('sopSteps');
  const sopTitle = document.getElementById('sopTitle');
  const saveBtn = document.getElementById('saveSop');
  const editBtn = document.getElementById('editSop');
  const coachingLink = document.getElementById('coachingLink');

  let generatedSOP = null;
  let generatedSourceType = 'text';
  let liveStream = null;
  let recorder = null;
  let recordedChunks = [];
  let recordedBlob = null;
  let recordedBlobUrl = '';
  let recordStartAt = 0;
  let recordTimerId = null;
  let liveSampleTimerId = null;
  let liveCapturedFrames = [];

  sourceMode.addEventListener('change', updateModeUI);
  generateBtn.addEventListener('click', handleGenerate);
  saveBtn.addEventListener('click', saveGeneratedSop);
  editBtn.addEventListener('click', editGeneratedSop);
  startRecordBtn.addEventListener('click', startRecording);
  stopRecordBtn.addEventListener('click', stopRecording);

  updateModeUI();

  async function handleGenerate() {
    const mode = sourceMode.value;
    const context = (contextInput.value || '').trim();

    generateBtn.disabled = true;
    spinner.classList.add('active');
    sopPreview.classList.remove('active');
    hideMsg();
    if (coachingLink) coachingLink.style.display = 'none';

    try {
      let sop;

      if (mode === 'text') {
        const content = (contentInput.value || '').trim();
        if (!content) throw new Error('Please paste some training content first.');
        sop = await generateSopWithFallback({
          mode,
          text: content,
          context,
          accountId: getAccountId()
        });
      } else if (mode === 'video') {
        const file = videoFileInput.files[0];
        if (!file) throw new Error('Please upload a video file first.');

        showMsg('Sampling video frames...', 'success');
        const frames = await sampleVideoFramesFromBlob(file);
        if (!frames.length) throw new Error('Could not extract frames from this video.');

        sop = await generateSopWithFallback({
          mode,
          frames,
          context,
          accountId: getAccountId()
        });
      } else {
        if (!recordedBlob && !liveCapturedFrames.length) {
          throw new Error('Record a live clip first, then generate SOP.');
        }

        let frames = [...liveCapturedFrames];
        if (!frames.length && recordedBlob) {
          showMsg('Sampling recorded frames...', 'success');
          frames = await sampleVideoFramesFromBlob(recordedBlob);
        }
        if (!frames.length) throw new Error('Could not extract frames from the recorded clip.');

        sop = await generateSopWithFallback({
          mode,
          frames,
          context,
          accountId: getAccountId()
        });
      }

      generatedSOP = normalizeSOP(sop);
      generatedSourceType = mode;

      renderSOP(generatedSOP);
      sopPreview.classList.add('active');
      showMsg('SOP generated successfully!', 'success');
    } catch (err) {
      console.error('Generation error:', err);
      showMsg(err.message || 'Failed to generate SOP. Try again.', 'error');
    } finally {
      generateBtn.disabled = false;
      spinner.classList.remove('active');
    }
  }

  async function generateSopWithFallback(payload) {
    return generateViaGemini(payload);
  }

  async function generateViaBackend(payload) {
    const res = await fetch('/api/sop/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'SOP generation failed.');
    }

    if (!data.sop || typeof data.sop !== 'object') {
      throw new Error('Invalid SOP response from server.');
    }
    return data.sop;
  }

  async function generateViaGemini(payload) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key is missing in server .env (GEMINI_API_KEY).');
    }

    const client = new GeminiClient(apiKey);
    const contextLine = payload.context ? `\nContext: ${payload.context}` : '';

    let result;
    if (payload.mode === 'text') {
      result = await client.generateText(
        GEMINI_SOP_SYSTEM_PROMPT,
        `Convert this training content into an SOP:\n\n${payload.text || ''}${contextLine}`,
        { temperature: 0.3 }
      );
    } else {
      const frames = Array.isArray(payload.frames) ? payload.frames.slice(0, 12) : [];
      if (!frames.length) {
        throw new Error('Gemini fallback could not run because no frames were provided.');
      }
      result = await client.analyzeImages(
        GEMINI_SOP_SYSTEM_PROMPT,
        `Generate an SOP from these chronological workflow frames.${contextLine}`,
        frames,
        { temperature: 0.3 }
      );
    }

    return parseSopFromAiResult(result);
  }

  async function getGeminiApiKey() {
    if (window.SkillLensConfig?.load) {
      const cfg = await window.SkillLensConfig.load();
      if (cfg?.geminiApiKey) return cfg.geminiApiKey;
    }

    const res = await fetch('/api/config');
    if (!res.ok) return '';
    const data = await res.json().catch(() => ({}));
    return String(data?.geminiApiKey || '');
  }

  function parseSopFromAiResult(text) {
    const raw = String(text || '').trim();
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
      return JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        const extracted = match[0];
        try {
          return JSON.parse(extracted);
        } catch {
          const repaired = repairLikelyJson(extracted);
          try {
            return JSON.parse(repaired);
          } catch {
            // Continue to loose text parsing below.
          }
        }
      }

      const fromLooseText = parseSopFromLooseText(clean);
      if (fromLooseText) return fromLooseText;
      throw new Error('Gemini returned malformed JSON for SOP. Please try again.');
    }
  }

  function repairLikelyJson(jsonText) {
    let value = String(jsonText || '');

    value = value
      .replace(/\r\n/g, '\n')
      .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
      .replace(/}\s*{/g, '},{') // insert missing commas between objects
      .replace(/]\s*\[/g, '],['); // insert missing commas between arrays

    return value;
  }

  function parseSopFromLooseText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return null;

    let title = 'Generated SOP';
    let role = 'operator';
    const steps = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('title:')) {
        title = line.slice(line.indexOf(':') + 1).trim() || title;
        continue;
      }
      if (lower.startsWith('role:')) {
        role = line.slice(line.indexOf(':') + 1).trim() || role;
        continue;
      }

      const stepMatch = line.match(/^(?:step\s*)?(\d+)[\).\-\:]\s*(.+)$/i);
      if (stepMatch) {
        steps.push({
          step: Number(stepMatch[1]) || steps.length + 1,
          action: stepMatch[2].trim(),
          look_for: '',
          common_mistakes: ''
        });
      }
    }

    if (!steps.length) {
      const bulletSteps = lines.filter((line) => /^[-*]\s+/.test(line));
      bulletSteps.forEach((line, index) => {
        steps.push({
          step: index + 1,
          action: line.replace(/^[-*]\s+/, '').trim(),
          look_for: '',
          common_mistakes: ''
        });
      });
    }

    if (!steps.length) return null;
    return { title, role, steps };
  }

  function normalizeSOP(sop) {
    const normalized = {
      title: sop.title || 'Generated SOP',
      role: sop.role || 'operator',
      steps: []
    };

    const rawSteps = Array.isArray(sop.steps) ? sop.steps : [];
    normalized.steps = rawSteps.map((step, index) => {
      if (typeof step === 'string') {
        return {
          step: index + 1,
          action: step,
          look_for: '',
          common_mistakes: ''
        };
      }
      return {
        step: Number(step.step) || index + 1,
        action: step.action || step.text || `Step ${index + 1}`,
        look_for: step.look_for || '',
        common_mistakes: step.common_mistakes || ''
      };
    });

    if (!normalized.steps.length) {
      throw new Error('No SOP steps were generated. Try a clearer input.');
    }

    return normalized;
  }

  async function sampleVideoFramesFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    await once(video, 'loadedmetadata');

    const duration = Number(video.duration || 0);
    if (!duration || !Number.isFinite(duration)) {
      URL.revokeObjectURL(url);
      return [];
    }

    const maxFrames = 12;
    const stepSeconds = Math.max(1, duration / maxFrames);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = Math.min(960, video.videoWidth || 960);
    const height = Math.round(width * ((video.videoHeight || 540) / (video.videoWidth || 960)));
    canvas.width = width;
    canvas.height = height;

    const frames = [];

    if (video.readyState < 2) {
      await once(video, 'loadeddata');
    }

    for (let t = 0; t < duration && frames.length < maxFrames; t += stepSeconds) {
      if (t > 0) {
        video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
        await once(video, 'seeked');
      }
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      frames.push(dataUrl.split(',')[1]);
    }

    URL.revokeObjectURL(url);
    return frames;
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showMsg('Live recording is not supported in this browser.', 'error');
      return;
    }

    try {
      liveStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });

      livePreview.srcObject = liveStream;
      livePreviewWrap.classList.remove('hidden');
      await livePreview.play().catch(() => {});

      recordedChunks = [];
      recordedBlob = null;
      liveCapturedFrames = [];
      clearRecordedPreview();

      const recordingType = pickRecordingType();
      recorder = recordingType
        ? new MediaRecorder(liveStream, { mimeType: recordingType })
        : new MediaRecorder(liveStream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunks.push(event.data);
      };
      recorder.onstop = () => {
        recordedBlob = new Blob(recordedChunks, { type: recorder.mimeType || 'video/webm' });
        recordStatus.textContent = `Recorded ${(recordedBlob.size / (1024 * 1024)).toFixed(1)} MB clip.`;
        showRecordedPreview();
        stopLiveStream();
        recorder = null;
      };

      recorder.start(1000);
      startRecordTimer();
      startLiveSampling();
      recordingBadge.classList.remove('hidden');
      recordStatus.textContent = 'Recording... perform the task now, then tap Stop.';
      startRecordBtn.disabled = true;
      stopRecordBtn.disabled = false;
    } catch (err) {
      console.error('Record error:', err);
      showMsg('Could not start recording. Check camera permission.', 'error');
    }
  }

  function stopRecording() {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    stopRecordTimer();
    stopLiveSampling();
    recordingBadge.classList.add('hidden');
    startRecordBtn.disabled = false;
    stopRecordBtn.disabled = true;
  }

  function stopLiveStream() {
    if (liveStream) {
      liveStream.getTracks().forEach((track) => track.stop());
      liveStream = null;
    }
  }

  function pickRecordingType() {
    const preferred = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    return preferred.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function updateModeUI() {
    const mode = sourceMode.value;
    textSection.classList.toggle('hidden', mode !== 'text');
    videoSection.classList.toggle('hidden', mode !== 'video');
    liveSection.classList.toggle('hidden', mode !== 'live');

    if (mode !== 'live') {
      stopRecording();
      stopLiveStream();
      livePreviewWrap.classList.add('hidden');
      recordingBadge.classList.add('hidden');
      stopRecordTimer();
      stopLiveSampling();
    }
  }

  function startRecordTimer() {
    recordStartAt = Date.now();
    updateRecordTimer();
    stopRecordTimer();
    recordTimerId = setInterval(updateRecordTimer, 1000);
  }

  function stopRecordTimer() {
    if (recordTimerId) {
      clearInterval(recordTimerId);
      recordTimerId = null;
    }
  }

  function updateRecordTimer() {
    const sec = Math.floor((Date.now() - recordStartAt) / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    recordTimer.textContent = `${mm}:${ss}`;
  }

  function showRecordedPreview() {
    clearRecordedPreview();
    if (!recordedBlob) return;
    recordedBlobUrl = URL.createObjectURL(recordedBlob);
    recordedPreview.src = recordedBlobUrl;
    recordedPreviewWrap.classList.remove('hidden');
  }

  function startLiveSampling() {
    stopLiveSampling();
    captureLiveFrameSample();
    liveSampleTimerId = setInterval(captureLiveFrameSample, 1250);
  }

  function stopLiveSampling() {
    if (liveSampleTimerId) {
      clearInterval(liveSampleTimerId);
      liveSampleTimerId = null;
    }
  }

  function captureLiveFrameSample() {
    if (!livePreview || livePreview.readyState < 2) return;
    if (!livePreview.videoWidth || !livePreview.videoHeight) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = Math.min(960, livePreview.videoWidth);
    const height = Math.round(width * (livePreview.videoHeight / livePreview.videoWidth));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(livePreview, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    liveCapturedFrames.push(dataUrl.split(',')[1]);

    if (liveCapturedFrames.length > 16) {
      liveCapturedFrames = liveCapturedFrames.slice(liveCapturedFrames.length - 16);
    }
  }

  function clearRecordedPreview() {
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      recordedBlobUrl = '';
    }
    recordedPreview.removeAttribute('src');
    recordedPreview.load();
    recordedPreviewWrap.classList.add('hidden');
  }

  function renderSOP(sop) {
    sopTitle.textContent = sop.title || 'Generated SOP';
    sopSteps.innerHTML = '';

    sop.steps.forEach((s) => {
      const div = document.createElement('div');
      div.className = 'sop-step';
      div.innerHTML = `
        <div class="sop-step-num">Step ${s.step}</div>
        <div class="sop-step-action">${escapeHtml(s.action)}</div>
        <div class="sop-step-detail">Look for: ${escapeHtml(s.look_for || '-')}</div>
      `;
      sopSteps.appendChild(div);
    });
  }

  function saveGeneratedSop() {
    if (!generatedSOP) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    const origText = 'Save SOP';

    const accountId = getAccountId();
    const listKey = `skilllens_sops_${accountId}`;
    const current = {
      ...generatedSOP,
      id: `sop_${Date.now()}`,
      source_type: generatedSourceType,
      created_at: new Date().toISOString(),
      account_id: accountId
    };

    localStorage.setItem('skilllens_current_sop', JSON.stringify(current));

    const list = safeJsonParse(localStorage.getItem(listKey), []);
    list.unshift(current);
    localStorage.setItem(listKey, JSON.stringify(list.slice(0, 100)));

    saveBtn.textContent = 'Saved ✓';
    saveBtn.classList.add('saved');
    showMsg(`SOP saved. Start Coaching →`, 'success');
    showCoachingLink();

    setTimeout(() => {
      saveBtn.textContent = origText;
      saveBtn.disabled = false;
      saveBtn.classList.remove('saved');
    }, 2000);
  }

  function editGeneratedSop() {
    if (!generatedSOP) return;
    if (coachingLink) coachingLink.style.display = 'none';
    sourceMode.value = 'text';
    updateModeUI();
    sopPreview.classList.remove('active');
    contentInput.value = JSON.stringify(generatedSOP, null, 2);
    contentInput.focus();
  }

  function getAccountId() {
    const raw = (localStorage.getItem('skilllens_account_id') || 'default').trim();
    return raw ? raw.toLowerCase().replace(/\s+/g, '-') : 'default';
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function once(target, eventName) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), 10000);
      const onDone = () => {
        clearTimeout(timer);
        target.removeEventListener(eventName, onDone);
        resolve();
      };
      target.addEventListener(eventName, onDone, { once: true });
    });
  }

  function showMsg(text, type) {
    msgEl.textContent = text;
    msgEl.className = `msg msg-${type} active`;
  }

  function showCoachingLink() {
    if (coachingLink) coachingLink.style.display = '';
  }

  function hideMsg() {
    msgEl.classList.remove('active');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  window.addEventListener('beforeunload', () => {
    stopRecording();
    stopLiveStream();
    stopLiveSampling();
    clearRecordedPreview();
  });
})();
