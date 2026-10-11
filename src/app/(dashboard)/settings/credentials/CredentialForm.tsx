import { CheckCircle2, LockKeyhole, MonitorCog } from 'lucide-react'

const platforms = [
  { name: '네이버', use: '블로그 발행 준비' },
  { name: '유튜브', use: '영상 업로드 준비' },
  { name: '인스타그램', use: '카드뉴스 발행 준비' },
]

export default function CredentialForm() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 shrink-0 text-emerald-700" size={21} aria-hidden="true" />
          <div>
            <h2 className="font-bold text-emerald-950">로그인정보는 웹사이트에 입력하지 않습니다</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900/80">
              외부 채널의 아이디와 비밀번호는 집포터 로컬 에이전트에서만 입력하고, 이 PC의 운영체제 보안 기능으로 암호화합니다. 웹 서버와 집포터 데이터베이스에는 저장하지 않습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <MonitorCog className="mt-0.5 shrink-0 text-brand-700" size={22} aria-hidden="true" />
          <div>
            <h2 className="font-bold text-slate-950">로컬 에이전트에서 연결하세요</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <li className="flex gap-3"><Step number="1" />현재 PC에 설치된 집포터 AI OS를 실행합니다.</li>
              <li className="flex gap-3"><Step number="2" />트레이의 집포터 아이콘에서 <strong>설정 열기</strong>를 선택합니다.</li>
              <li className="flex gap-3"><Step number="3" />필요한 채널만 연결하고 저장 상태를 확인합니다.</li>
            </ol>
            <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
              보안저장을 적용한 새 AI OS 설치파일을 검증 중입니다. 기존 설치본에는 계정정보를 새로 저장하지 마세요.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="supported-platforms" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 id="supported-platforms" className="font-bold text-slate-950">연결 위치</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {platforms.map(platform => (
            <div key={platform.name} className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <CheckCircle2 size={16} className="text-brand-700" aria-hidden="true" />
                {platform.name}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{platform.use}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs leading-5 text-slate-500">
        각 채널의 공식 연동 또는 이용정책이 확인되지 않은 경우 집포터는 문구 복사·파일 다운로드·공식 등록화면 안내까지만 제공합니다. 최종 등록은 사용자가 확인한 뒤 진행합니다.
      </p>
    </div>
  )
}

function Step({ number }: { number: string }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{number}</span>
}
