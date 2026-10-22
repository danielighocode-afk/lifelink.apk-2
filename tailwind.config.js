/* Build-time Tailwind config (used by scripts/prepare-www.js). Union of the inline configs that the pages used with the CDN. */
module.exports = {
  content: ['./*.html', './*.js', '!./tailwind.config.js', '!./www/**', '!./node_modules/**', '!./android/**'],
  theme: {
    extend: {
      colors: {
        emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46' },
        slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
        charcoal: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' }
      },
      fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] }
    }
  }
};
