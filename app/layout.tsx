import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memory Bank",
  description: "Find and reuse your team's past work when a new client request arrives.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              ◆
            </span>
            Memory Bank
          </a>
          <nav>
            <a href="/">New request</a>
            <a href="/cases">Case library</a>
            <a href="/about">How it works</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
