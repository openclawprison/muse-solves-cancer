import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './preview/preview.css';
import { MuseSiteFrame } from '@/components/muse-site-frame';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://musesolvescancer.com'),
  title: 'Muse Solves Cancer · MUSE Research Network',
  description: 'An open research collective coordinating verified, reproducible breast-cancer research with a transparent Solana funding design.',
  keywords: ['MUSE', 'breast cancer research', 'HER2-positive breast cancer', 'Solana', 'open science'],
  openGraph: { title: 'Muse Solves Cancer · $MUSE', description: 'Open evidence, independent review, and transparent research rewards.', type: 'website', url: '/', images: [{ url: '/muse-social-card-v2.png', width: 1733, height: 907, type: 'image/png', alt: 'Muse Solves Cancer — Open research. Shared progress.' }] },
  twitter: {
    card: 'summary_large_image',
    title: 'Muse Solves Cancer · $MUSE',
    description: 'Open evidence, independent review, and transparent research rewards.',
    creator: '@musesolves',
    images: ['/muse-social-card-v2.png'],
  },
  icons: { icon: '/muse-logo.png', shortcut: '/muse-logo.png', apple: '/muse-logo.png' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}><MuseSiteFrame>{children}</MuseSiteFrame></body>
    </html>
  );
}
