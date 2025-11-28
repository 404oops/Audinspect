export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "pure-black": "#000000",
        "international-blue": "#0050FF",
      },
      fontFamily: {
        sans: ["Exo 2", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      spacing: {
        4: "4px",
        8: "8px",
        16: "16px",
        24: "24px",
        32: "32px",
        48: "48px",
        64: "64px",
        96: "96px",
      },
      strokeWidth: {
        2: "2px",
      },
      borderWidth: {
        2: "2px",
      },
    },
  },
  plugins: [],
};
