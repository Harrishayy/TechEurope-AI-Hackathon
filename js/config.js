// FOV — Runtime config loaded from server-side .env
(function () {
  let configPromise = null;

  async function loadConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/config')
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`Config request failed (${res.status})`);
          }
          return res.json();
        })
        .then((data) => ({
          geminiApiKey: String(data?.geminiApiKey || ''),
          accountId: String(data?.accountId || 'default'),
          dustConfigured: Boolean(data?.dustConfigured)
        }))
        .catch(() => ({
          geminiApiKey: '',
          accountId: 'default',
          dustConfigured: false
        }));
    }
    return configPromise;
  }

  window.SkillLensConfig = {
    async load() {
      const cfg = await loadConfig();
      this.geminiApiKey = cfg.geminiApiKey;
      this.accountId = cfg.accountId;
      this.dustConfigured = cfg.dustConfigured;
      this.loaded = true;
      return cfg;
    },
    geminiApiKey: '',
    accountId: 'default',
    dustConfigured: false,
    loaded: false
  };
})();
