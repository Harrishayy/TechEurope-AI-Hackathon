// SkillLens — Live Coaching Engine

(function () {
  const video = document.getElementById('camera');
  const instructionEl = document.getElementById('instruction');
  const stepBadge = document.getElementById('stepBadge');
  const statusDot = document.getElementById('statusDot');
  const nextBtn = document.getElementById('nextBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 640;
  canvas.height = 480;

  let client = null;
  let sop = null;
  let currentStep = 0;
  let lastInstruction = '';
  let intervalId = null;
  let isProcessing = false;
  let isPaused = false;

  init();

  async function init() {
    // Load API key
    const apiKey = localStorage.getItem('skilllens_api_key');
    if (!apiKey) {
      showError('No API key found. Go back and set your Gemini key first.');
      return;
    }
    client = new GeminiClient(apiKey);

    // Load SOP
    const sopData = localStorage.getItem('skilllens_current_sop');
    if (sopData) {
      try {
        sop = JSON.parse(sopData);
      } catch {
        sop = DEFAULT_BARISTA_SOP;
      }
    } else {
      sop = DEFAULT_BARISTA_SOP;
    }

    updateStepBadge();

    // Wire controls
    nextBtn.addEventListener('click', advanceStep);
    pauseBtn.addEventListener('click', togglePause);

    // Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      video.srcObject = stream;
      await video.play();

      setInstruction('Point your camera at the equipment to begin.');
      startCapture();
    } catch (err) {
      console.error('Camera error:', err);
      showError('Camera access denied. Please allow camera permissions and refresh the page.');
    }
  }

  function startCapture() {
    // First analysis after a short delay
    setTimeout(() => captureAndAnalyze(), 1500);
    // Then every 2 seconds
    intervalId = setInterval(() => captureAndAnalyze(), 2000);
    statusDot.className = 'status-dot live';
  }

  function stopCapture() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    statusDot.className = 'status-dot paused';
  }

  async function captureAndAnalyze() {
    if (isProcessing || isPaused) return;
    isProcessing = true;

    try {
      // Capture frame from video
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const base64 = dataUrl.split(',')[1];

      // Build prompt
      const systemPrompt = buildSystemPrompt();

      // Call Gemini
      const response = await client.analyzeImage(
        systemPrompt,
        'Look at this camera frame carefully. What specific equipment, controls, and physical state can you see right now? Based on exactly what is visible, what should the trainee do next?',
        base64,
        { temperature: 0.4, maxTokens: 200 }
      );

      if (response && response !== lastInstruction) {
        setInstruction(response);
        lastInstruction = response;
        maybeAutoAdvance(response);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      // Don't show transient errors to user — just skip this frame
    } finally {
      isProcessing = false;
    }
  }

  function buildSystemPrompt() {
    const stepsJson = JSON.stringify(sop.steps, null, 2);
    const role = sop.role || 'trade';

    return `You are an expert ${role} trainer watching a trainee through their phone camera in real time.

PROCEDURE REFERENCE (use as a guide, NOT a script):
${stepsJson}

CRITICAL RULES — follow these exactly:
1. LOOK AT THE IMAGE FIRST. Identify the specific equipment, brand, model, buttons, dials, lights, and physical state you can actually see. Ground every instruction in what is visible.
2. Based on what you SEE — not what you assume — determine what the trainee has just done or is currently doing. What position are things in? What state is the equipment in?
3. Give ONE short instruction for what to do NEXT, referencing the specific physical objects visible in the frame. Use spatial language: "the silver handle on the left", "the black dial near the top", "the button with the cup icon". Never give generic instructions.
4. If the image is blurry or you cannot see the equipment clearly, say exactly what you need: "Move closer to the group head so I can see it" or "Tilt your camera down toward the portafilter."
5. If the trainee appears to have made a mistake (wrong position, skipped step, spill), call it out helpfully and tell them how to fix it based on what you see.
6. Never repeat the same instruction. If the scene hasn't changed, acknowledge that: "Looks the same — keep going with [previous action]" or "I can see you're still working on that, take your time."
7. If all steps appear complete, congratulate them specifically based on what you see (e.g., "I can see a nice shot with good crema — well done!").

Previous instruction given: "${lastInstruction || 'None — this is the very first frame.'}"

Respond with ONLY the instruction. No labels, no step numbers, no markdown. One or two sentences max. Be warm but direct.`;
  }

  function maybeAutoAdvance(response) {
    // Simple heuristic: if the response mentions a later step or congratulations,
    // try to advance the step counter
    const lower = response.toLowerCase();
    if (lower.includes('congratulat') || lower.includes('well done') ||
        lower.includes('great job') || lower.includes('all done') ||
        lower.includes('nice work') || lower.includes('ready')) {
      if (currentStep < sop.steps.length - 1) {
        currentStep = sop.steps.length - 1;
        updateStepBadge();
      }
    }
    // Check if instruction seems to reference a step ahead
    for (let i = currentStep + 1; i < sop.steps.length; i++) {
      const keywords = sop.steps[i].action.toLowerCase().split(' ').filter(w => w.length > 4);
      const matches = keywords.filter(kw => lower.includes(kw));
      if (matches.length >= 2) {
        currentStep = i;
        updateStepBadge();
        break;
      }
    }
  }

  function advanceStep() {
    if (currentStep < sop.steps.length - 1) {
      currentStep++;
      lastInstruction = ''; // Reset so next analysis gives fresh instruction
      updateStepBadge();

      // Show the next step action as immediate feedback
      const step = sop.steps[currentStep];
      setInstruction(step.action);
    } else {
      setInstruction('You\'ve completed all steps. Great work!');
    }
  }

  function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
      stopCapture();
      pauseBtn.textContent = '\u25B6';
      pauseBtn.title = 'Resume';
    } else {
      startCapture();
      pauseBtn.textContent = '\u23F8';
      pauseBtn.title = 'Pause';
    }
  }

  function setInstruction(text) {
    instructionEl.classList.add('fade-out');
    setTimeout(() => {
      instructionEl.textContent = text;
      instructionEl.classList.remove('fade-out', 'error');
      instructionEl.classList.add('fade-in');
      setTimeout(() => instructionEl.classList.remove('fade-in'), 300);
    }, 200);
  }

  function showError(text) {
    instructionEl.textContent = text;
    instructionEl.classList.add('error');
  }

  function updateStepBadge() {
    stepBadge.textContent = `Step ${currentStep + 1} / ${sop.steps.length}`;
  }

  // Cleanup on page leave
  window.addEventListener('beforeunload', () => {
    stopCapture();
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
    }
  });
})();
