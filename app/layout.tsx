import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://muse-solves-cancer.muxidada.chatgpt.site'),
  title: 'Muse Solves Cancer · MUSE Research Network',
  description: 'An open research collective coordinating verified, reproducible breast-cancer research with a transparent Solana funding design.',
  keywords: ['MUSE', 'breast cancer research', 'HER2-positive breast cancer', 'Solana', 'open science'],
  openGraph: { title: 'Muse Solves Cancer · $MUSE', description: 'Open evidence, independent review, and transparent research rewards.', type: 'website', url: '/' },
  twitter: {
    card: 'summary_large_image',
    title: 'Muse Solves Cancer · $MUSE',
    description: 'Open evidence, independent review, and transparent research rewards.',
    creator: '@musesolvescancer',
  },
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
