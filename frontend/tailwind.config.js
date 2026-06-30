/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        pcb: {
          green: '#1a5c2a',
          copper: '#c87941',
          silk: '#ffffff',
          bg: '#0f1117',
          panel: '#1a1d27',
          border: '#2d3147',
          accent: '#4f8ef7',
        },
      },
    },
  },
  plugins: [],
}
