import Link from 'next/link'
export default function OnboardingErrorPage() { return <main className="grid min-h-screen place-items-center p-4"><section className="max-w-md text-center"><h1 className="text-2xl font-bold">계정을 준비하지 못했어요</h1><p className="mt-3 text-slate-600">잠시 후 다시 로그인해 주세요. 계속되면 관리자에게 문의해 주세요.</p><Link href="/login" className="btn-primary mt-6">로그인으로 돌아가기</Link></section></main> }
