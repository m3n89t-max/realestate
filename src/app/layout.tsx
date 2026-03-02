import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: {
    default: 'RealEstate AI OS',
    template: '%s | RealEstate AI OS',
  },
  description: '공인중개사를 위한 AI 기반 부동산 마케팅 & 업무 자동화 플랫폼',
  keywords: ['부동산', '공인중개사', 'AI', '마케팅자동화', '블로그자동화'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#f9fafb',
              borderRadius: '10px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#f9fafb' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#f9fafb' },
            },
          }}
        />
      </body>
    </html>
  )
}
