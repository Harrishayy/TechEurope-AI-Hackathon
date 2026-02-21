// FOV — Landing page logic

(function () {
  const demoCard = document.getElementById('demoCard');
  const extractCard = document.getElementById('extractCard');

  async function getConfig() {
    if (window.SkillLensConfig?.load) {
      return window.SkillLensConfig.load();
    }

    const res = await fetch('/api/config');
    if (!res.ok) return { geminiApiKey: '', dustConfigured: false };
    return res.json().catch(() => ({ geminiApiKey: '', dustConfigured: false }));
  }

  async function requireApiKey(event) {
    const cfg = await getConfig();
    if (!cfg?.geminiApiKey) {
      event.preventDefault();
      alert('No API key configured in .env. Set GEMINI_API_KEY and restart the server.');
    }
  }

  if (demoCard) {
    demoCard.addEventListener('click', requireApiKey);
  }

  if (extractCard) {
    extractCard.addEventListener('click', requireApiKey);
  }
})();
