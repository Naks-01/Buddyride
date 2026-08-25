/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brandOrange: '#F97316',
        brandBlue: '#3B82F6',
        brandPurple: '#8B5CF6',
        darkBg: '#0F172A',
      },
    },
  },
  plugins: [],
}

