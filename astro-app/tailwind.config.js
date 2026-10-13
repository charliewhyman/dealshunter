/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media', // Enable system-level dark mode
  content: [
  './src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};