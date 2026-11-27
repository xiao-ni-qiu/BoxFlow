/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'var(--bg-app)',
        panel: 'var(--bg-panel)',
        surface: 'var(--bg-surface)',
        sunken: 'var(--bg-sunken)',
        hair: 'var(--hair)',
        'hair-strong': 'var(--hair-strong)',
        t1: 'var(--text-1)',
        t2: 'var(--text-2)',
        t3: 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)'
      },
      borderRadius: {
        card: '12px',
        ctl: '8px'
      },
      transitionDuration: {
        fast: '140ms'
      }
    }
  },
  plugins: []
}
