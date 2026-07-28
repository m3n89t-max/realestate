import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  // 네이티브 모듈(canvas)은 번들하지 않고 런타임 require (Turbopack 번들 오류 방지)
  serverExternalPackages: ['@napi-rs/canvas'],
  // 썸네일 합성 API가 서버리스 함수에서 한글 폰트 파일을 읽을 수 있도록 번들에 포함
  outputFileTracingIncludes: {
    '/api/generate-thumbnail': ['./public/fonts/**'],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
}

export default nextConfig
