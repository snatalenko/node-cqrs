(() => {
  const root = document.documentElement;
  const button = document.querySelector('.theme-toggle');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  if (!button) return;

  const currentTheme = () => root.dataset.theme || (systemTheme.matches ? 'dark' : 'light');
  const updateLabel = () => {
    const nextTheme = currentTheme() === 'dark' ? 'light' : 'dark';
    const label = `Use ${nextTheme} theme`;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  };

  button.addEventListener('click', () => {
    const nextTheme = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = nextTheme;
    try { localStorage.setItem('theme', nextTheme); } catch (_) {}
    updateLabel();
  });

  systemTheme.addEventListener?.('change', () => {
    if (!root.dataset.theme) updateLabel();
  });
  updateLabel();
})();
