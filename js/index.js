// SkillLens — Landing page logic

(function () {
  const keyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveKey');
  const statusEl = document.getElementById('keyStatus');

  // Load saved key
  const saved = localStorage.getItem('skilllens_api_key');
  if (saved) {
    keyInput.value = saved;
    showStatus('Key saved', 'saved');
  }

  saveBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (!key) {
      showStatus('Please enter a key', 'missing');
      return;
    }
    localStorage.setItem('skilllens_api_key', key);
    showStatus('Key saved', 'saved');
  });

  // Quick demo loads default barista SOP and goes to coach
  const demoCard = document.getElementById('demoCard');
  if (demoCard) {
    demoCard.addEventListener('click', (e) => {
      const key = localStorage.getItem('skilllens_api_key');
      if (!key) {
        e.preventDefault();
        showStatus('Set your API key first', 'missing');
        keyInput.focus();
      }
    });
  }

  const extractCard = document.getElementById('extractCard');
  if (extractCard) {
    extractCard.addEventListener('click', (e) => {
      const key = localStorage.getItem('skilllens_api_key');
      if (!key) {
        e.preventDefault();
        showStatus('Set your API key first', 'missing');
        keyInput.focus();
      }
    });
  }

  function showStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'key-status ' + type;
  }
})();
