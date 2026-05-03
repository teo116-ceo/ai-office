/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        office: {
          bg: '#1a1a2e',
          sidebar: '#16213e',
          panel: '#0f3460',
          accent: '#e94560',
          text: '#a8b2d8',
          active: '#64ffda',
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
      },
    },
  },
  plugins: [],
}
