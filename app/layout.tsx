import type { Metadata, Viewport } from 'next';
import { Noto_Sans_KR } from 'next/font/google';

import './globals.css';

const notoSansKr = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '공항나우 — 전국 공항 운항 · 인천 주차 · 출국장',
  description:
    '전국 공항의 도착·출발 항공편과 인천국제공항 주차장 잔여면·출국장 대기시간을 한 화면에서. 공항에서 캐리어 끌면서 폰으로 확인하세요. 공공데이터포털(한국공항공사·인천국제공항공사) 기반.',
  applicationName: '공항나우',
  appleWebApp: { title: '공항나우' },
  openGraph: { siteName: '공항나우', locale: 'ko_KR', type: 'website' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#16181d',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`dark ${notoSansKr.variable} antialiased`} suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-dvh">{children}</body>
    </html>
  );
}
