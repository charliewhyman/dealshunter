/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media', // Enable system-level dark mode
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};