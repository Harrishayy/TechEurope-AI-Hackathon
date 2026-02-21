// FOV — Landing page logic

(function () {
  const demoCard = document.getElementById('demoCard');
  if (demoCard) {
    demoCard.addEventListener('click', (e) => {
      const key = localStorage.getItem('skilllens_api_key');
      if (!key) {
        e.preventDefault();
        alert('No API key configured. Update js/config.js with your Gemini key.');
      }
    });
  }

  const extractCard = document.getElementById('extractCard');
  if (extractCard) {
    extractCard.addEventListener('click', (e) => {
      const key = localStorage.getItem('skilllens_api_key');
      if (!key) {
        e.preventDefault();
        alert('No API key configured. Update js/config.js with your Gemini key.');
      }
    });
  }
})();
