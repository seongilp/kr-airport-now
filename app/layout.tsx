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
  title: '인천공항 지금 — 주차 · 출국장 실시간',
  description:
    '인천국제공항 T1·T2 주차장 잔여면과 출국장 대기시간을 한 화면에서. 어디에 대고 어느 출국장으로 갈지, 캐리어 끌면서 폰으로 확인하세요. 인천국제공항공사 공공데이터 기반.',
  applicationName: '인천공항 지금',
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
