/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { DEFAULT: '#0b1220', soft: '#1a2436' },
        brand: { DEFAULT: '#1f6feb', dark: '#1550b3', light: '#e8f0fe' },
        surface: '#f6f8fb', line: '#e6eaf0',
      },
    },
  },
  plugins: [],
};
