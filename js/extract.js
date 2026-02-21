// SkillLens — SOP Extraction logic

(function () {
  const contentInput = document.getElementById('contentInput');
  const generateBtn = document.getElementById('generateBtn');
  const spinner = document.getElementById('spinner');
  const msgEl = document.getElementById('msg');
  const sopPreview = document.getElementById('sopPreview');
  const sopSteps = document.getElementById('sopSteps');
  const sopTitle = document.getElementById('sopTitle');
  const startBtn = document.getElementById('startCoaching');
  const editBtn = document.getElementById('editSop');

  let generatedSOP = null;

  generateBtn.addEventListener('click', handleGenerate);

  startBtn.addEventListener('click', () => {
    if (generatedSOP) {
      localStorage.setItem('skilllens_current_sop', JSON.stringify(generatedSOP));
      window.location.href = 'coach.html';
    }
  });

  editBtn.addEventListener('click', () => {
    sopPreview.classList.remove('active');
    contentInput.value = JSON.stringify(generatedSOP, null, 2);
    contentInput.focus();
  });

  async function handleGenerate() {
    const content = contentInput.value.trim();
    if (!content) {
      showMsg('Please paste some training content first.', 'error');
      return;
    }

    const apiKey = localStorage.getItem('skilllens_api_key');
    if (!apiKey) {
      showMsg('No API key found. Go back to the home page and set your Gemini key.', 'error');
      return;
    }

    // Show loading
    generateBtn.disabled = true;
    spinner.classList.add('active');
    sopPreview.classList.remove('active');
    hideMsg();

    try {
      const client = new GeminiClient(apiKey);

      const systemPrompt = `You are an expert at creating Standard Operating Procedures (SOPs) for physical, hands-on trades.

Convert the user's training content into a structured SOP.

Output a JSON object with this EXACT structure and nothing else — no markdown fences, no explanation:
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

      const result = await client.generateText(
        systemPrompt,
        `Convert this training content into an SOP:\n\n${content}`,
        { temperature: 0.3 }
      );

      // Parse JSON from response
      const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      generatedSOP = JSON.parse(jsonStr);

      renderSOP(generatedSOP);
      sopPreview.classList.add('active');
      showMsg('SOP generated successfully!', 'success');

    } catch (err) {
      console.error('Generation error:', err);
      if (err instanceof SyntaxError) {
        showMsg('Failed to parse SOP from AI response. Try again or simplify your input.', 'error');
      } else {
        showMsg(`Error: ${err.message}`, 'error');
      }
    } finally {
      generateBtn.disabled = false;
      spinner.classList.remove('active');
    }
  }

  function renderSOP(sop) {
    sopTitle.textContent = sop.title || 'Generated SOP';
    sopSteps.innerHTML = '';

    sop.steps.forEach((s) => {
      const div = document.createElement('div');
      div.className = 'sop-step';
      div.innerHTML = `
        <div class="sop-step-num">Step ${s.step}</div>
        <div class="sop-step-action">${s.action}</div>
        <div class="sop-step-detail">Look for: ${s.look_for || '—'}</div>
      `;
      sopSteps.appendChild(div);
    });
  }

  function showMsg(text, type) {
    msgEl.textContent = text;
    msgEl.className = `msg msg-${type} active`;
  }

  function hideMsg() {
    msgEl.classList.remove('active');
  }
})();
