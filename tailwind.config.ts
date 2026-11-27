import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        eve: {
          bg: 'var(--eve-bg)',
          panel: 'var(--eve-panel)',
          elevated: 'var(--eve-panel-elevated)',
          border: 'var(--eve-border)',
          'border-strong': 'var(--eve-border-strong)',
          accent: 'var(--eve-accent)',
          'accent-muted': 'var(--eve-accent-muted)',
          warning: 'var(--eve-warning)',
          danger: 'var(--eve-danger)',
          success: 'var(--eve-success)',
          text: 'var(--eve-text)',
          muted: 'var(--eve-text-muted)'
        }
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Cascadia Code"', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
};

export default config;

