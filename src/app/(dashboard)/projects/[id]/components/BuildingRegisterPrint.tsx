'use client'

import { Printer } from 'lucide-react'

interface Props {
  data: {
    title?: any[]
    floors?: any[]
    exclusive?: any[]
  }
  address?: string
  fetchedAt?: string
}

export default function BuildingRegisterPrint({ data, address, fetchedAt }: Props) {
  const title = Array.isArray(data.title) ? data.title[0] : null
  const floors = Array.isArray(data.floors) ? data.floors : []
  const exclusive = Array.isArray(data.exclusive) ? data.exclusive : []

  const handlePrint = () => {
    window.print()
  }

  return (
    <div>
      <div className="flex justify-end mb-3 print:hidden">
        <button onClick={handlePrint} className="btn-secondary text-xs py-1.5">
          <Printer size={12} />
          인쇄
        </button>
      </div>

      {/* 프린트 영역 */}
      <div id="print-area" className="font-sans text-sm text-gray-900 print:text-black">
        {/* 헤더 */}
        <div className="text-center border-b-2 border-gray-800 pb-3 mb-4 print:border-black">
          <h1 className="text-xl font-bold tracking-widest">건 축 물 대 장</h1>
          <p className="text-xs text-gray-500 mt-1 print:text-black">
            (공공데이터포털 건축HUB API · 열람일: {fetchedAt ? new Date(fetchedAt).toLocaleDateString('ko-KR') : '-'})
          </p>
        </div>

        {/* 표제부 */}
        <section className="mb-4">
          <div className="bg-gray-100 print:bg-gray-200 px-3 py-1 font-semibold text-xs mb-2">■ 표제부 (기본 정보)</div>
          {title ? (
            <table className="w-full border-collapse text-xs">
              <tbody>
                <Row label="대지위치" value={address ?? title.platPlc ?? '-'} />
                <Row label="건물명" value={title.bldNm ?? '-'} />
                <Row label="주용도" value={title.mainPurpsCdNm ?? '-'} />
                <Row label="기타용도" value={title.etcPurps || '-'} />
                <Row label="구조" value={title.strctCdNm ?? '-'} />
                <Row label="지붕" value={title.roofCdNm || '-'} />
                <Row label="연면적" value={title.totArea ? `${title.totArea}㎡` : '-'} />
                <Row label="건축면적" value={title.archArea ? `${title.archArea}㎡` : '-'} />
                <Row label="대지면적" value={title.platArea ? `${title.platArea}㎡` : '-'} />
                <Row label="건폐율" value={title.bcRat ? `${title.bcRat}%` : '-'} />
                <Row label="용적률" value={title.vlRat ? `${title.vlRat}%` : '-'} />
                <Row label="지상층수" value={title.grndFlrCnt ? `${title.grndFlrCnt}층` : '-'} />
                <Row label="지하층수" value={title.ugrndFlrCnt ? `${title.ugrndFlrCnt}층` : '-'} />
                <Row label="승강기" value={title.rideUseElvtCnt ? `${title.rideUseElvtCnt}대` : '-'} />
                <Row label="사용승인일" value={title.useAprDay ? formatDate(title.useAprDay) : '-'} />
                <Row label="허가일" value={title.pmsDay ? formatDate(title.pmsDay) : '-'} />
                <Row label="착공일" value={title.stcnsDay ? formatDate(title.stcnsDay) : '-'} />
                <Row label="기계주차" value={title.indrMechUtcnt != null ? `${title.indrMechUtcnt}대` : '-'} />
                <Row label="옥외주차" value={title.oudrMechUtcnt != null ? `${title.oudrMechUtcnt}대` : '-'} />
                <Row label="위반건축물" value={title.vltnBldYn === '1' ? '위반건축물' : '해당없음'} highlight={title.vltnBldYn === '1'} />
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400 px-2">데이터 없음</p>
          )}
        </section>

        {/* 층별 개요 */}
        {floors.length > 0 && (
          <section className="mb-4">
            <div className="bg-gray-100 print:bg-gray-200 px-3 py-1 font-semibold text-xs mb-2">■ 층별 개요</div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 print:bg-gray-100">
                  <Th>층구분</Th>
                  <Th>층번호</Th>
                  <Th>구조</Th>
                  <Th>용도</Th>
                  <Th>면적(㎡)</Th>
                </tr>
              </thead>
              <tbody>
                {floors.map((f: any, i: number) => (
                  <tr key={i} className="border-b border-gray-200">
                    <Td>{f.flrGbCdNm ?? '-'}</Td>
                    <Td>{f.flrNo ?? '-'}</Td>
                    <Td>{f.strctCdNm ?? '-'}</Td>
                    <Td>{f.mainPurpsCdNm ?? f.etcPurps ?? '-'}</Td>
                    <Td>{f.area ?? '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 전유부 (집합건물) */}
        {exclusive.length > 0 && (
          <section className="mb-4">
            <div className="bg-gray-100 print:bg-gray-200 px-3 py-1 font-semibold text-xs mb-2">■ 전유부 (집합건물)</div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 print:bg-gray-100">
                  <Th>동명</Th>
                  <Th>호명</Th>
                  <Th>층번호</Th>
                  <Th>용도</Th>
                  <Th>면적(㎡)</Th>
                </tr>
              </thead>
              <tbody>
                {exclusive.map((e: any, i: number) => (
                  <tr key={i} className="border-b border-gray-200">
                    <Td>{e.dongNm ?? '-'}</Td>
                    <Td>{e.hoNm ?? '-'}</Td>
                    <Td>{e.flrNo ?? '-'}</Td>
                    <Td>{e.mainPurpsCdNm ?? '-'}</Td>
                    <Td>{e.area ?? '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 푸터 */}
        <div className="mt-6 pt-3 border-t border-gray-300 text-xs text-gray-400 print:text-gray-600 text-right">
          본 자료는 공공데이터포털 건축HUB API를 통해 자동 수집된 참고용 자료입니다.
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <tr className="border-b border-gray-200">
      <td className="py-1.5 px-2 font-medium text-gray-600 w-28 bg-gray-50 print:bg-gray-100 border-r border-gray-200">
        {label}
      </td>
      <td className={`py-1.5 px-3 ${highlight ? 'text-red-600 font-semibold' : ''}`}>
        {value}
      </td>
    </tr>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-1.5 px-2 text-left font-semibold text-gray-600 border border-gray-200">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-1.5 px-2 border border-gray-200">
      {children}
    </td>
  )
}

function formatDate(d: string): string {
  if (!d || d.length !== 8) return d
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}
