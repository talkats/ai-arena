import './globals.css';

export const metadata = {
  title: 'AI Arena — Compare & Collaborate Across AI Engines',
  description: 'Compare responses from Claude, Gemini, and ChatGPT side-by-side, or let them collaborate on complex questions.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
