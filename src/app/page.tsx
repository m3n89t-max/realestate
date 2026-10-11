import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Building2, Check, FileArchive, ImageIcon, MapPin, MessageSquareText, Newspaper, ShieldCheck, Sparkles } from 'lucide-react'
import { LandingDemoVideo } from '@/components/landing-demo-video'
import { BRAND } from '@/lib/brand'
import { FLOW_STAGES } from '@/lib/jipporter-flow'

export const metadata: Metadata = {
  title: { absolute: `주소와 사진으로 매물 홍보 준비 | ${BRAND.name}` },
  description: '주소와 사진, 매물 특징을 한 번 입력해 블로그 글·카드뉴스와 채널별 등록 자료를 준비하는 공인중개사용 서비스',
}

const signupHref = '/login?mode=signup'
const primaryCta = '내 매물로 시작하기'

const workflow = FLOW_STAGES

const outputs = [
  { icon: MapPin, title: '입지분석', description: '주소를 바탕으로 생활·교통·교육·상권 정보를 정리합니다.' },
  { icon: MessageSquareText, title: '블로그 글', description: '매물 특징과 입지 정보를 읽기 쉬운 홍보 글 초안으로 만듭니다.' },
  { icon: ImageIcon, title: '카드뉴스', description: '핵심 장점과 사진을 모바일용 카드 흐름으로 구성합니다.' },
  { icon: Newspaper, title: '채널 등록 자료', description: '채널별 필수 정보, 사진 묶음과 복사용 문구를 한곳에 준비합니다.' },
]

const channels = [
  { name: '네이버부동산', status: '연동 필요', todo: '문구를 복사하고 사진을 내려받아 직접 등록', detail: '공식 제휴 정보업체 또는 승인된 경로가 확인되면 연동합니다.' },
  { name: '직방', status: '연동 필요', todo: '문구를 복사하고 사진을 내려받아 직접 등록', detail: '공식 사업제휴 전까지는 등록 자료만 준비합니다.' },
  { name: '다방', status: '연동 필요', todo: '문구를 복사하고 사진을 내려받아 직접 등록', detail: '다방프로 및 공식 제휴 범위 안에서 준비합니다.' },
  { name: '지역 오일장', status: '연동 필요', todo: '등록 양식에 맞춘 사진·문구 묶음을 내려받아 직접 등록', detail: '공개 등록 API가 확인되지 않아 제휴 여부를 확인 중입니다.' },
  { name: '교차로', status: '연동 필요', todo: '지역사 공식 등록화면에서 문구를 붙여 넣어 직접 등록', detail: '지역별 법인·상품이 달라 지역사마다 확인이 필요합니다.' },
]

const faqs = [
  { question: '무엇만 입력하면 되나요?', answer: '주소와 사진, 매물 특징부터 입력합니다. 가격과 면적처럼 광고에 필요한 사실정보는 주소 확인 뒤 필요한 항목만 묻고, 등록 전에 중개사가 확인합니다.' },
  { question: '여러 사이트에 한 번에 올라가나요?', answer: '아닙니다. 채널마다 정책과 제휴 방식이 다릅니다. 공개 API 또는 서면 제휴가 확인된 채널만 직접 연동하고, 그 전에는 문구 복사와 사진 다운로드로 직접 등록하시게 됩니다.' },
  { question: 'AI가 만든 내용을 바로 게시해도 되나요?', answer: '아닙니다. 최종 등록은 중개사가 확인해야 합니다. 가격·면적·주소 공개 범위, 사진 권리와 광고 표현을 검토한 뒤 발행합니다.' },
  { question: '외부 채널 비밀번호는 어디에 저장되나요?', answer: '웹사이트에는 저장하지 않습니다. 로컬 앱에서 운영체제 보호 저장소를 사용하고 웹에는 연결 상태만 표시하는 방향으로 제공합니다.' },
]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'SoftwareApplication', name: BRAND.name, alternateName: BRAND.englishName, applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Windows', description: '주소와 사진, 매물 특징을 한 번 입력해 홍보 콘텐츠와 채널별 등록 자료를 준비하는 공인중개사용 서비스', audience: { '@type': 'Audience', audienceType: '공인중개사' } },
    { '@type': 'FAQPage', mainEntity: faqs.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
  ],
}

export default function LandingPage() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[#fbfaf7]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label="집포터 홈"><span className="grid size-9 place-items-center rounded-xl bg-brand-700 text-white"><Building2 size={19} /></span><span className="text-lg font-bold tracking-[-0.04em]">집포터</span></Link>
        <nav aria-label="랜딩페이지 주요 메뉴" className="hidden items-center gap-7 md:flex"><a href="#how" className="text-sm font-semibold text-slate-600 hover:text-brand-700">이용 방법</a><a href="#channels" className="text-sm font-semibold text-slate-600 hover:text-brand-700">채널 준비</a><a href="#faq" className="text-sm font-semibold text-slate-600 hover:text-brand-700">자주 묻는 질문</a></nav>
        <div className="flex items-center gap-2"><Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-slate-700">로그인</Link><Link href={signupHref} className="hidden min-h-11 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-sm font-bold text-white sm:inline-flex">{primaryCta}<ArrowRight size={15} /></Link></div>
      </div>
    </header>

    <main className="min-h-screen overflow-hidden bg-[#fbfaf7] pb-24 text-[#18302d] [word-break:keep-all] md:pb-0">
      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[680px] bg-[radial-gradient(circle_at_80%_15%,rgba(40,125,109,0.14),transparent_36%),radial-gradient(circle_at_12%_40%,rgba(217,235,230,0.7),transparent_32%)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-7 px-4 pb-20 pt-10 sm:px-6 sm:pt-20 lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:px-8 lg:pb-28 lg:pt-28 lg:items-center">
          <div className="order-1 lg:order-none">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-brand-800"><Sparkles size={14} /> 공인중개사를 위한 매물 마케팅 작업실</p>
            <h1 className="max-w-3xl text-[2.1rem] font-bold leading-[1.15] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[3.6rem]">주소·사진·특징만 넣으세요.<span className="mt-1.5 block text-brand-700">홍보와 등록 준비가 이어집니다.</span></h1>
            <p className="mt-4 max-w-xl text-[0.95rem] leading-6 text-slate-600 sm:mt-7 sm:text-lg sm:leading-8">매물 정보는 한 번만 입력하세요. 블로그 글과 카드뉴스를 만들고, 중개사가 최종 검토한 뒤 채널별 발행 준비까지 한곳에서 진행합니다.</p>
            <div className="mt-6 hidden flex-col gap-3 sm:flex sm:flex-row"><Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 text-base font-bold text-white shadow-[0_8px_24px_rgba(20,81,71,0.2)] hover:bg-brand-800">{primaryCta}<ArrowRight size={18} /></Link><a href="#how" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/80 px-6 text-base font-bold text-slate-700">4단계 흐름 보기</a></div>
            <p className="mt-3 hidden text-sm font-medium text-slate-600 sm:block">회원가입 후 바로 매물 입력 화면으로 이동합니다.</p>
            <div className="mt-6 hidden flex-wrap gap-2 sm:flex" aria-label="핵심 결과물">{['입지분석', '블로그 글', '카드뉴스', '채널 등록 자료'].map((label) => <span key={label} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{label}</span>)}</div>
          </div>
          <div className="order-2 lg:order-none"><LandingDemoVideo /></div>
          <div className="order-3 sm:hidden">
            <a href="#how" className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/80 px-6 text-base font-bold text-slate-700">4단계 흐름 보기</a>
            <p className="mt-3 text-sm font-medium text-slate-600">아래 고정 버튼으로 가입하면 바로 매물 입력 화면으로 이동합니다.</p>
            <div className="mt-5 flex flex-wrap gap-2" aria-label="핵심 결과물 요약">{['입지분석', '블로그 글', '카드뉴스', '채널 등록 자료'].map((label) => <span key={label} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{label}</span>)}</div>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-24 border-y border-black/5 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><p className="text-sm font-bold text-brand-700">복잡한 메뉴 대신 한 가지 흐름</p><h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] text-slate-950 sm:text-5xl">한 번 입력하고, 확인하고, 준비하세요</h2>
          <ol className="mt-10 grid list-none gap-4 md:grid-cols-4">{workflow.map((item) => <li key={item.number} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] p-6"><span className="text-sm font-black text-brand-700">{item.number}</span><h3 className="mt-4 text-xl font-bold text-slate-950">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p></li>)}</ol>
        </div>
      </section>

      <section id="results" className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><p className="text-sm font-bold text-brand-700">한 매물에서 함께 준비되는 결과</p><h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] text-slate-950 sm:text-5xl">매물 하나로, 필요한 홍보 자료를 한곳에서</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">{outputs.map(({ icon: Icon, title, description }) => <article key={title} className="rounded-3xl border border-black/10 bg-white p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-800"><Icon size={22} /></span><span className="text-xs font-bold text-brand-700">예시 결과</span></div><h3 className="mt-5 text-2xl font-bold text-slate-950">{title}</h3><p className="mt-3 leading-7 text-slate-600">{description}</p></article>)}</div>
        </div>
      </section>

      <section id="channels" className="scroll-mt-24 bg-[#173b35] py-20 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
          <div><p className="text-sm font-bold text-brand-200">채널 정책에 맞춘 발행 준비</p><h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-5xl">채널마다 가능한 방식으로 준비합니다</h2><p className="mt-5 leading-7 text-emerald-50/80">연동 전에는 문구를 복사하고 사진을 내려받아 공식 등록화면에서 직접 등록합니다. 공식 API 또는 서면 제휴가 확인된 채널만 직접 발행으로 전환합니다.</p><div className="mt-7 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-4"><ShieldCheck className="mt-0.5 shrink-0 text-brand-200" size={21} /><p className="text-sm leading-6 text-emerald-50">최종 등록은 중개사가 확인합니다. 채널 보호조치를 우회하는 방식은 쓰지 않습니다.</p></div></div>
          <div className="space-y-3">{channels.map((channel) => <article key={channel.name} className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">{channel.name}</h3><p className="mt-1 text-sm font-semibold leading-6 text-brand-100">오늘 할 일 · {channel.todo}</p><p className="mt-1 text-sm leading-6 text-emerald-50/70">{channel.detail}</p></div><span className="w-fit shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-800">{channel.status}</span></article>)}</div>
        </div></div>
      </section>

      <section className="bg-white py-20 sm:py-24"><div className="mx-auto grid max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8"><div className="rounded-3xl border border-slate-200 p-7"><FileArchive className="text-brand-700" /><h2 className="mt-4 text-2xl font-bold text-slate-950">채널 계정은 웹에 저장하지 않습니다</h2><p className="mt-3 leading-7 text-slate-600">로컬 앱에서 운영체제 보호 저장소를 사용하고, 웹에는 연결 여부만 보여주는 구조로 준비하고 있습니다.</p></div><div className="rounded-3xl border border-brand-200 bg-brand-50 p-7"><Check className="text-brand-700" /><h2 className="mt-4 text-2xl font-bold text-slate-950">초안과 사실을 구분합니다</h2><p className="mt-3 leading-7 text-slate-600">AI 결과는 출발점입니다. 실제 매물 조건과 법정 표시사항은 중개사가 확인한 뒤 발행합니다.</p></div></div></section>

      <section id="faq" className="scroll-mt-24 py-20 sm:py-24"><div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"><h2 className="text-3xl font-bold tracking-[-0.045em] text-slate-950 sm:text-5xl">자주 묻는 질문</h2><div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">{faqs.map((item, index) => <details key={item.question} className="group py-5" open={index === 0}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-slate-950"><span>{item.question}</span><span aria-hidden="true" className="text-2xl font-normal text-brand-700 group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl leading-7 text-slate-600">{item.answer}</p></details>)}</div></div></section>

      <section className="mx-4 mb-12 rounded-[2rem] bg-brand-700 px-6 py-12 text-center text-white sm:mx-6 sm:py-16 lg:mx-auto lg:max-w-7xl"><h2 className="text-3xl font-bold tracking-[-0.04em] sm:text-5xl">첫 매물부터 흐름을 확인해 보세요</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-brand-100">주소와 사진, 매물 특징을 한 번 입력하는 데서 시작합니다.</p><Link href={signupHref} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-bold text-brand-900">{primaryCta}<ArrowRight size={18} /></Link></section>
    </main>

    <footer className="border-t border-slate-200 bg-white pb-24 pt-8 md:py-8"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><p><span className="font-bold text-slate-900">집포터</span> · 공인중개사의 매물 마케팅 작업실</p><p>생성된 분석과 콘텐츠는 참고용 초안이며, 게시 전 실제 매물 정보를 확인해야 합니다.</p></div></footer>
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"><Link href={signupHref} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 font-bold text-white">{primaryCta}<ArrowRight size={18} /></Link></div>
  </>
}
