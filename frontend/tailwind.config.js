/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF9F4",
        ink: "#262922",
        pine: {
          50: "#EEF3ED",
          100: "#D7E3D4",
          300: "#93B38B",
          500: "#4B7A45",
          700: "#33552F",
          900: "#1E331B",
        },
        amber: {
          50: "#FBF2E3",
          300: "#E7B463",
          500: "#C98A2E",
          700: "#8C5F1E",
        },
        brick: {
          50: "#FAEEEB",
          300: "#DE9280",
          500: "#B54B3A",
          700: "#7E3426",
        },
      },
      fontFamily: {
        ui: [
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
