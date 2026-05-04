import './globals.css';

export const metadata = {
  title: 'AI Arena - Compare & Collaborate Across AI Engines',
  description: 'Compare responses from Claude, Gemini, ChatGPT, Ollama, and more side-by-side, or let them debate complex questions.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
