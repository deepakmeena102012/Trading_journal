/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#111110',
        surface: '#1a1a19',
        raised: '#222220',
        line: '#2e2e2b',
        ink: '#f5f5f2',
        soft: '#c3c2b7',
        muted: '#8f8e86',
        accent: '#3987e5',
        profit: '#26a69a',
        loss: '#ef5350',
        neutral: '#a8a79f',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
