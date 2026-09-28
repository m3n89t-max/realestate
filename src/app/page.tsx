import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquareText,
  PlaySquare,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: { absolute: `공인중개사를 위한 매물 콘텐츠 자동화 | ${BRAND.name}` },
  description: BRAND.description,
  openGraph: {
    title: `공인중개사를 위한 매물 콘텐츠 자동화 | ${BRAND.name}`,
    description: BRAND.description,
  },
}

const signupHref = '/login?mode=signup'

const outputs = [
  {
    icon: MapPin,
    label: '입지분석',
    title: '주변의 강점을 설명하기 쉽게 정리',
    description: '주소를 기준으로 생활·교통·교육·상권 정보를 모아 상담과 콘텐츠 작성에 참고할 내용을 정리합니다.',
    items: ['생활 편의시설', '교통·교육 환경', '상권 및 배후 환경'],
    sampleTitle: '입지 포인트 요약',
    sampleLines: ['생활·교통·교육 환경을 항목별로 정리', '확인한 정보를 상담용 문장으로 구성'],
    tone: 'bg-emerald-50 text-emerald-800',
  },
  {
    icon: FileText,
    label: '블로그 글',
    title: '빈 화면 대신 매물 정보에서 시작',
    description: '가격, 면적, 특징과 입지 내용을 바탕으로 제목부터 문의 안내까지 블로그 초안을 구성합니다.',
    items: ['매물 정보 정리', '입지 장점', '자주 묻는 내용'],
    sampleTitle: '블로그 도입부',
    sampleLines: ['제주시 주거 매물을 찾고 계신가요?', '가격·면적·특징을 한눈에 살펴보세요.'],
    tone: 'bg-sky-50 text-sky-800',
  },
  {
    icon: ImageIcon,
    label: '카드뉴스',
    title: '핵심만 넘겨볼 수 있는 카드로 구성',
    description: '매물의 주요 장점을 카드별 문구로 나누고 등록한 사진을 활용해 한눈에 확인할 수 있게 구성합니다.',
    items: ['대표 매물 정보', '핵심 장점', '입지 포인트'],
    sampleTitle: '3장 카드 구성',
    sampleLines: ['1장 · 매물 한눈에 보기', '2장 · 생활환경  3장 · 핵심 장점'],
    tone: 'bg-amber-50 text-amber-800',
  },
  {
    icon: PlaySquare,
    label: '쇼츠 스크립트',
    title: '짧은 영상에 맞는 흐름과 문장 준비',
    description: '첫 문장부터 매물 소개와 문의 안내까지 촬영·편집에 활용할 장면별 스크립트를 구성합니다.',
    items: ['시작 문구', '장면별 설명', '자막 문안'],
    sampleTitle: '장면 1 · 외관',
    sampleLines: ['화면: 건물 외관과 진입로', '자막: 오늘 소개할 매물을 만나보세요.'],
    tone: 'bg-rose-50 text-rose-800',
  },
]

const steps = [
  { icon: Building2, number: '01', title: '매물 정보 입력', description: '주소, 거래 유형, 가격, 면적과 매물의 특징을 입력합니다.' },
  { icon: Upload, number: '02', title: '사진 추가', description: '홍보에 사용할 매물 사진과 동영상을 등록합니다.' },
  { icon: Sparkles, number: '03', title: '필요한 결과 선택', description: '입지분석, 블로그, 카드뉴스, 쇼츠 중 필요한 작업을 선택합니다.' },
  { icon: ClipboardCheck, number: '04', title: '결과 확인 및 수정', description: '생성된 내용을 실제 매물과 중개사무소 기준에 맞게 확인하고 고칩니다.' },
]

const faqs = [
  ['컴퓨터를 잘 다루지 못해도 사용할 수 있나요?', '매물 주소와 기본 정보를 입력한 뒤 필요한 결과물을 선택하는 순서로 구성되어 있습니다. 화면에 표시되는 단계에 따라 진행하면 됩니다.'],
  ['무엇을 입력해야 하나요?', '주소를 기본으로 거래 유형, 가격, 면적, 사진과 매물의 특징을 입력할 수 있습니다. 입력 내용이 구체적일수록 실제 매물에 맞게 결과를 다듬기 쉽습니다.'],
  ['입지분석에서는 무엇을 볼 수 있나요?', '매물 주변의 시설과 생활·교통·교육·상권 관련 정보를 바탕으로 정리된 내용을 확인할 수 있습니다. 제공 범위는 매물 위치와 연동 데이터에 따라 달라질 수 있습니다.'],
  ['만들어진 글과 이미지를 바로 올려도 되나요?', '생성 결과는 초안으로 확인해 주세요. 게시 전 실제 매물 정보, 가격, 면적, 주소 노출 범위, 사진 사용 권한과 광고 표현을 직접 검토해야 합니다.'],
  ['쇼츠 영상도 완성되나요?', '현재 집포터는 영상 제작에 활용할 장면별 쇼츠 스크립트를 제공합니다. 완성된 영상 파일이 아니라 촬영과 편집 전에 이야기 흐름을 잡는 결과물입니다.'],
]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: BRAND.name,
      alternateName: BRAND.englishName,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: BRAND.description,
      audience: {
        '@type': 'Audience',
        audienceType: '공인중개사',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      })),
    },
  ],
}

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#fbfaf7]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label={`${BRAND.name} 홈`}>
            <span className="grid size-9 place-items-center rounded-xl bg-brand-700 text-white shadow-sm">
              <Building2 size={19} aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-[-0.04em]">{BRAND.name}</span>
          </Link>

          <nav aria-label="랜딩페이지 주요 메뉴" className="hidden items-center gap-8 md:flex">
            <a href="#results" className="text-sm font-semibold text-slate-600 transition-colors hover:text-brand-700">무엇을 만들어주나요</a>
            <a href="#how" className="text-sm font-semibold text-slate-600 transition-colors hover:text-brand-700">이용 방법</a>
            <a href="#faq" className="text-sm font-semibold text-slate-600 transition-colors hover:text-brand-700">자주 묻는 질문</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-slate-700 hover:text-brand-700">로그인</Link>
            <Link href={signupHref} className="hidden min-h-11 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-800 sm:inline-flex">
              내 매물로 결과 받아보기 <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className="min-h-screen overflow-hidden bg-[#fbfaf7] pb-24 text-[#18302d] md:pb-0">

      <section className="relative">
        <div className="absolute inset-x-0 top-0 z-0 h-[720px] bg-[radial-gradient(circle_at_80%_15%,rgba(40,125,109,0.14),transparent_36%),radial-gradient(circle_at_12%_40%,rgba(217,235,230,0.7),transparent_32%)]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-28">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-brand-800 shadow-sm">
              <Sparkles size={14} aria-hidden="true" /> 공인중개사를 위한 매물 콘텐츠 자동화
            </p>
            <h1 className="max-w-3xl text-[2.65rem] font-bold leading-[1.05] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[4.25rem]">
              매물 정보는<br />한 번만 입력하세요.
              <span className="mt-2 block text-brand-700">홍보 초안까지 이어집니다.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              주소, 사진, 가격과 매물의 장점을 입력하면 입지분석, 블로그 글, 카드뉴스, 쇼츠 스크립트를 한곳에서 만들고 확인할 수 있습니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 text-base font-bold text-white shadow-[0_8px_24px_rgba(20,81,71,0.2)] transition-all hover:-translate-y-0.5 hover:bg-brand-800">
                내 매물로 결과 받아보기 <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#results" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/80 px-6 text-base font-bold text-slate-700 hover:bg-white">
                결과물 먼저 보기 <ChevronRight size={18} aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500">계정을 만들거나 로그인한 뒤 실제 매물 정보를 입력합니다.</p>
            <div className="mt-8 flex flex-wrap gap-2" aria-label="집포터 결과물">
              {outputs.map(({ label }) => <span key={label} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{label}</span>)}
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section id="results" className="scroll-mt-24 border-y border-black/5 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="결과물 미리보기" title="매물 하나로, 필요한 홍보 자료를 한곳에서" description="먼저 어떤 결과를 받을 수 있는지 확인해 보세요." />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {outputs.map(({ icon: Icon, label, title, description, items, sampleTitle, sampleLines, tone }) => (
              <article key={label} className="group rounded-3xl border border-black/10 bg-[#fbfaf7] p-6 transition-all hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(19,34,32,0.08)] sm:p-8">
                <div className={`grid size-12 place-items-center rounded-2xl ${tone}`}><Icon size={23} aria-hidden="true" /></div>
                <p className="mt-6 text-sm font-bold text-brand-700">{label}</p>
                <h3 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-slate-950">{title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{description}</p>
                <ul className="mt-6 flex flex-wrap gap-2" aria-label={`${label} 주요 구성`}>
                  {items.map(item => <li key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{item}</li>)}
                </ul>
                <div className="mt-6 rounded-2xl border border-brand-100 bg-white p-4" aria-label={`${label} 가상 예시`}>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-700">예시 결과</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">{sampleTitle}</p>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                    {sampleLines.map(line => <li key={line}>{line}</li>)}
                  </ul>
                  <p className="mt-3 text-[11px] font-medium text-slate-600">이해를 돕기 위한 가상 예시이며, 실제 결과는 입력 정보에 따라 달라집니다.</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-24 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="이용 방법" title="주소부터 넣고, 순서대로 따라가세요" description="처음 사용하는 분도 현재 단계와 다음 할 일을 알 수 있도록 매물 단위로 진행합니다." />
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, number, title, description }) => (
              <li key={number} className="relative rounded-3xl border border-black/10 bg-white p-6 shadow-[0_4px_18px_rgba(0,0,0,0.035)]">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon size={21} aria-hidden="true" /></span>
                  <span className="text-sm font-bold tracking-[0.12em] text-brand-700">{number}</span>
                </div>
                <h3 className="mt-8 text-xl font-bold tracking-[-0.03em] text-slate-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 text-center">
            <Link href={signupHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-6 text-base font-bold text-white hover:bg-brand-800">
              내 매물로 결과 받아보기 <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-brand-900 py-20 text-white sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-bold text-brand-200">안심하고 검토하세요</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">AI가 초안을 만들고,<br />최종 판단은 중개사가 합니다.</h2>
            <p className="mt-6 max-w-xl leading-7 text-brand-100">집포터는 업무를 돕기 위한 초안을 만듭니다. 고객에게 안내하거나 게시하기 전에 실제 매물 정보와 광고 관련 표현을 확인해 주세요.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              '생성 결과를 화면에서 확인합니다.',
              '실제 매물과 다른 표현은 수정합니다.',
              '상세 주소와 개인정보 노출을 점검합니다.',
              '게시 전 관련 기준과 표현을 확인합니다.',
            ].map(item => (
              <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-400 text-brand-900"><Check size={15} strokeWidth={3} aria-hidden="true" /></span>
                <p className="text-sm font-semibold leading-6 text-white/90">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 rounded-[2rem] bg-[#f3f0e8] p-7 sm:p-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-bold text-brand-700">이런 중개사무소에 맞습니다</p>
              <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-4xl">반복되는 매물 홍보를<br />한 흐름으로 정리하세요.</h2>
            </div>
            <ul className="space-y-4">
              {[
                '매물 홍보를 직접 챙기지만 글쓰기와 디자인이 부담스러운 곳',
                '한 매물을 블로그와 SNS에 맞게 다시 정리해야 하는 곳',
                '담당자가 바뀌어도 매물별 자료를 한곳에서 이어서 보고 싶은 곳',
                '새로운 도구를 오래 배우기보다 실제 매물로 시작하고 싶은 곳',
              ].map(item => <li key={item} className="flex gap-3 text-sm font-semibold leading-6 text-slate-700"><Check className="mt-0.5 shrink-0 text-brand-700" size={19} aria-hidden="true" />{item}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading eyebrow="FAQ" title="자주 묻는 질문" description="시작하기 전에 궁금한 내용을 확인해 보세요." centered />
          <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-bold text-slate-900 marker:content-none">
                  {question}
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-brand-700 transition-transform group-open:rotate-90"><ChevronRight size={18} aria-hidden="true" /></span>
                </summary>
                <p className="max-w-2xl pb-6 pr-10 text-sm leading-7 text-slate-600">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-brand-700 px-6 py-14 text-center text-white shadow-[0_24px_70px_rgba(20,81,71,0.22)] sm:px-12 sm:py-20">
          <MessageSquareText className="mx-auto text-brand-200" size={36} aria-hidden="true" />
          <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-bold leading-tight tracking-[-0.045em] sm:text-5xl">다음 매물 홍보는,<br />빈 문서가 아니라 매물 정보에서 시작하세요.</h2>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-brand-100">실제 매물을 등록하고 입지분석, 블로그, 카드뉴스, 쇼츠 스크립트 결과를 확인해 보세요.</p>
          <Link href={signupHref} className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-bold text-brand-800 hover:bg-brand-50">
            내 매물로 결과 받아보기 <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      </main>

      <footer className="border-t border-black/5 bg-white pb-24 text-[#18302d] md:pb-0">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 font-bold text-slate-950"><Building2 className="text-brand-700" size={20} aria-hidden="true" />{BRAND.name}</div>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">공인중개사의 매물 분석과 홍보 콘텐츠 작성을 돕는 업무 도구</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-slate-600">
            <Link href="/login" className="hover:text-brand-700">로그인</Link>
            <Link href="/terms" className="hover:text-brand-700">이용약관</Link>
            <Link href="/privacy" className="hover:text-brand-700">개인정보처리방침</Link>
          </div>
        </div>
        <div className="border-t border-slate-100 px-4 py-5 text-center text-xs leading-5 text-slate-500">생성된 분석과 콘텐츠는 참고용 초안이며, 사용 전 실제 매물 정보와 관련 기준을 확인해야 합니다.</div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 p-3 text-[#18302d] backdrop-blur md:hidden">
        <Link href={signupHref} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-bold text-white shadow-lg">
          내 매물로 결과 받아보기 <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </>
  )
}

function SectionHeading({ eyebrow, title, description, centered = false }: { eyebrow: string; title: string; description: string; centered?: boolean }) {
  return (
    <div className={centered ? 'text-center' : ''}>
      <p className="text-sm font-bold text-brand-700">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.045em] text-slate-950 sm:text-5xl">{title}</h2>
      <p className={`mt-4 text-base leading-7 text-slate-600 ${centered ? 'mx-auto max-w-2xl' : 'max-w-2xl'}`}>{description}</p>
    </div>
  )
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-brand-200/35 blur-2xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-[0_30px_80px_rgba(19,34,32,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-red-300" /><span className="size-2.5 rounded-full bg-amber-300" /><span className="size-2.5 rounded-full bg-emerald-300" /></div>
          <span className="text-xs font-bold text-slate-600">집포터 업무 공간 · 예시 화면</span>
        </div>
        <div className="grid sm:grid-cols-[0.74fr_1.26fr]">
          <div className="border-b border-slate-100 bg-[#f8f7f3] p-5 sm:border-b-0 sm:border-r">
            <p className="text-xs font-bold text-brand-700">입력한 매물</p>
            <div className="mt-4 rounded-2xl bg-[linear-gradient(135deg,#d9ebe6,#86bfb1)] p-5 text-brand-900">
              <Building2 size={28} aria-hidden="true" />
              <p className="mt-10 text-sm font-bold">제주시 주거 매물</p>
              <p className="mt-1 text-xs text-brand-900">사진 8장 · 매매 · 예시</p>
            </div>
            <div className="mt-4 space-y-2">
              {['주소와 가격', '사진과 특징', '거래 정보'].map(item => <div key={item} className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Check size={14} className="text-brand-600" aria-hidden="true" />{item}</div>)}
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-brand-700">한 매물에서 이어지는 결과물</p><p className="mt-1 text-sm font-bold text-slate-900">필요한 작업을 선택하세요</p></div><BarChart3 className="text-brand-500" size={22} aria-hidden="true" /></div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {outputs.map(({ icon: Icon, label, tone }, index) => (
                <div key={label} className="rounded-2xl border border-slate-100 p-4 shadow-[0_2px_10px_rgba(19,34,32,0.04)]">
                  <span className={`grid size-9 place-items-center rounded-xl ${tone}`}><Icon size={17} aria-hidden="true" /></span>
                  <p className="mt-4 text-sm font-bold text-slate-900">{label}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-600">{index < 2 ? '내용 준비됨' : '초안 만들기'}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-xs font-semibold text-brand-800"><ShieldCheck size={16} aria-hidden="true" />결과를 확인하고 수정한 뒤 사용합니다.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
