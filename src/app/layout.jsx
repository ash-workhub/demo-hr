// src/app/layout.jsx
// Root layout — replaces scaffolded layout.tsx (your JS preference).
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers.jsx';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: 'FegHR V1 — HR Prototype',
  description: 'FegHR Demo HR prototype: directory, attendance, leave, approvals, notifications, dashboard.',
  icons: { icon: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
