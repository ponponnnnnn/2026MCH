/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFBFC",
        ink: "#202124",
        "ink-soft": "#5F6368",
        blue: { 50: "#E8F0FE", 500: "#4285F4", 700: "#1A56C4" },
        red: { 50: "#FCE8E6", 500: "#EA4335", 700: "#B0281E" },
        yellow: { 50: "#FEF7E0", 500: "#FBBC05", 700: "#B88400" },
        green: { 50: "#E6F4EA", 500: "#34A853", 700: "#1E7E37" },
      },
      fontFamily: {
        ui: [
          "'Noto Sans TC'",
          "'PingFang TC'",
          "'Microsoft JhengHei'",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
