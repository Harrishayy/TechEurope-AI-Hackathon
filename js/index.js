// SkillLens — Landing page logic

(function () {
  const keyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveKey');
  const statusEl = document.getElementById('keyStatus');
  const accountInput = document.getElementById('accountId');
  const saveAccountBtn = document.getElementById('saveAccount');
  const accountStatusEl = document.getElementById('accountStatus');

  // Load saved key
  const saved = localStorage.getItem('skilllens_api_key');
  if (saved) {
    keyInput.value = saved;
    showStatus('Key saved', 'saved');
  }
  const savedAccount = localStorage.getItem('skilllens_account_id') || 'default';
  if (accountInput) {
    accountInput.value = savedAccount;
    showAccountStatus(`Account: ${savedAccount}`, 'saved');
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

  if (saveAccountBtn) {
    saveAccountBtn.addEventListener('click', () => {
      const accountId = (accountInput.value || '').trim().toLowerCase().replace(/\s+/g, '-');
      if (!accountId) {
        showAccountStatus('Enter an account name', 'missing');
        return;
      }
      localStorage.setItem('skilllens_account_id', accountId);
      showAccountStatus(`Account saved: ${accountId}`, 'saved');
    });
  }

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

  function showAccountStatus(text, type) {
    if (!accountStatusEl) return;
    accountStatusEl.textContent = text;
    accountStatusEl.className = 'key-status ' + type;
  }
})();
