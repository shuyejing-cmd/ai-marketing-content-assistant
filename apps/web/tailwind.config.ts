import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2328',
        muted: '#69717d',
        line: '#e4e7eb',
        canvas: '#f7f5f0',
        surface: '#ffffff',
        accent: '#0476d0',
        'accent-strong': '#0368b8',
        'accent-soft': '#e6f2ff',
        warm: '#d9552f',
        success: '#22a46f',
        warning: '#f4a24d',
      },
      boxShadow: {
        soft: '0 12px 30px rgba(34, 52, 72, 0.06), 0 2px 8px rgba(34, 52, 72, 0.04)',
        control: '0 5px 12px rgba(4, 118, 208, 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
