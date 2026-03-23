'use client'

import type { Project, Organization } from '@/lib/types'

const sqmToPyeong = (sqm: number) => (sqm * 0.3025).toFixed(0)

function formatPrice(won: number | undefined) {
  if (!won) return '-'
  const eok = Math.floor(won / 100000000)
  const man = Math.floor((won % 100000000) / 10000)
  if (eok > 0 && man > 0) return `${eok}억 ${man}만원`
  if (eok > 0) return `${eok}억원`
  return `${man}만원`
}

function formatArea(sqm: number | undefined) {
  if (!sqm) return '-'
  return `${sqm}㎡(${sqmToPyeong(sqm)}평)`
}

const TX_LABEL: Record<string, string> = {
  sale: '매매',
  lease: '전세',
  rent: '임대',
}

interface Row {
  label: string
  value: React.ReactNode
  highlight?: boolean
  wide?: boolean  // 값 칸이 3칸 span
}

function Cell({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <>
      <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">
        {label}
      </td>
      <td className={`border border-gray-300 px-3 py-2 text-xs ${highlight ? 'text-red-600 font-bold' : 'text-gray-800'}`}>
        {value || '-'}
      </td>
    </>
  )
}

interface PropertyInfoTableProps {
  project: Project
  org?: Organization | null
  agentName?: string
  className?: string
}

export default function PropertyInfoTable({ project, org, agentName, className = '' }: PropertyInfoTableProps) {
  const txType = TX_LABEL[project.transaction_type ?? 'sale'] ?? '매매'
  const priceLabel = project.transaction_type === 'rent'
    ? `보증금/임대료: ${formatPrice(project.deposit)} / ${formatPrice(project.monthly_rent)}`
    : project.transaction_type === 'lease'
    ? `전세보증금: ${formatPrice(project.deposit)}`
    : `매매가: ${formatPrice(project.price)}`

  return (
    <div className={`w-full font-sans text-sm ${className}`}>
      <table className="w-full border-collapse border border-gray-400 text-xs">
        <tbody>
          {/* Row 1: 소재지 + 중개대상물 종류 */}
          <tr>
            <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">소 재 지</td>
            <td className="border border-gray-300 px-3 py-2 text-xs text-gray-800" colSpan={3}>
              {project.address}
            </td>
            <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">중개대상물 종류</td>
            <td className="border border-gray-300 px-3 py-2 text-xs text-gray-800">
              {project.property_category || '-'}
            </td>
          </tr>

          {/* Row 2: 주용도 + 해당층/총층 */}
          <tr>
            <Cell label="주 용 도" value={project.main_use} />
            <Cell label="해당층/총층" value={
              project.floor || project.total_floors
                ? `${project.floor ?? '-'}층 / ${project.total_floors ?? '-'}층`
                : '-'
            } />
            <Cell label="거 래 형 태" value={txType} />
            <Cell label="방 / 화장실" value={
              project.rooms_count !== undefined || project.bathrooms_count !== undefined
                ? `${project.rooms_count ?? '-'} / ${project.bathrooms_count ?? '-'}`
                : '-'
            } />
          </tr>

          {/* Row 3: 대지면적 + 사용승인일 */}
          <tr>
            <Cell label="대지 면적(㎡)" value={formatArea(project.land_area)} />
            <Cell label="사용승인일" value={project.approval_date} />
            <Cell label="연 면 적(㎡)" value={formatArea(project.total_area)} />
            <Cell label="주차대수" value={
              project.parking_legal || project.parking_actual
                ? `대장상: ${project.parking_legal ?? '-'}대 / 실주차: ${project.parking_actual ?? '-'}대`
                : '-'
            } />
          </tr>

          {/* Row 4: 전용면적 + 입주가능일 */}
          <tr>
            <Cell label="전용 면적(㎡)" value={formatArea(project.area)} />
            <Cell label="입주가능일" value={project.move_in_date || '협의'} />
            <Cell label="방 향" value={project.direction} />
            <Cell label="건물 상태" value={project.building_condition} />
          </tr>

          {/* Row 5: 가격 + 관리비 */}
          <tr>
            <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">
              {project.transaction_type === 'rent' ? '보증금/임대료' : project.transaction_type === 'lease' ? '전세보증금' : '매 매 가'}
            </td>
            <td className="border border-gray-300 px-3 py-2 text-xs text-red-600 font-bold">
              {project.transaction_type === 'rent'
                ? `${formatPrice(project.deposit)} / ${formatPrice(project.monthly_rent)}`
                : project.transaction_type === 'lease'
                ? formatPrice(project.deposit)
                : formatPrice(project.price)}
            </td>
            <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">권 리 금</td>
            <td className="border border-gray-300 px-3 py-2 text-xs text-gray-800">
              {project.key_money ? formatPrice(project.key_money) : '무권리'}
            </td>
            <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">관 리 비</td>
            <td className="border border-gray-300 px-3 py-2 text-xs text-gray-800 whitespace-pre-line">
              {project.management_fee_detail || '-'}
            </td>
          </tr>

          {/* Row 6: 특징 */}
          {(project.features?.length ?? 0) > 0 && (
            <tr>
              <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">특 장 점</td>
              <td className="border border-gray-300 px-3 py-2 text-xs text-gray-800" colSpan={5}>
                {project.features?.join(' · ')}
              </td>
            </tr>
          )}

          {/* Row 7: 임대현황 */}
          {project.rental_status && (
            <tr>
              <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-gray-700 whitespace-nowrap">임대 현황</td>
              <td className="border border-gray-300 px-3 py-2 text-xs text-gray-800 whitespace-pre-line" colSpan={5}>
                {project.rental_status}
              </td>
            </tr>
          )}

          {/* Row 8: 중개사 정보 */}
          {org && (
            <tr>
              <td className="border border-gray-300 bg-gray-100 px-3 py-3 text-xs text-gray-700" colSpan={6}>
                <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
                  {org.name && <span>■ 상호: {org.name}</span>}
                  {org.business_number && <span>■ 중개등록번호: {org.business_number}</span>}
                  {org.address && <span>■ 주소: {org.address}</span>}
                  {org.phone && <span>■ 전화번호: {org.phone}</span>}
                  {agentName && <span>■ 개업공인중개사: {agentName}</span>}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** 블로그/네이버 삽입용 HTML 문자열 생성 */
export function buildPropertyInfoTableHtml(project: Project, org?: Organization | null, agentName?: string): string {
  const txType = TX_LABEL[project.transaction_type ?? 'sale'] ?? '매매'

  const priceValue = project.transaction_type === 'rent'
    ? `${formatPrice(project.deposit)} / ${formatPrice(project.monthly_rent)}`
    : project.transaction_type === 'lease'
    ? formatPrice(project.deposit)
    : formatPrice(project.price)

  const priceLabel = project.transaction_type === 'rent' ? '보증금/임대료'
    : project.transaction_type === 'lease' ? '전세보증금' : '매매가'

  const agencyRows = org ? `
    <tr>
      <td colspan="6" style="border:1px solid #bbb;padding:8px 12px;background:#f5f5f5;font-size:12px;color:#444;line-height:1.8;">
        ${org.name ? `■ 상호: ${org.name}&nbsp;&nbsp;` : ''}
        ${org.business_number ? `■ 중개등록번호: ${org.business_number}&nbsp;&nbsp;` : ''}
        ${org.address ? `■ 주소: ${org.address}&nbsp;&nbsp;` : ''}
        ${org.phone ? `■ 전화번호: ${org.phone}&nbsp;&nbsp;` : ''}
        ${agentName ? `■ 개업공인중개사: ${agentName}` : ''}
      </td>
    </tr>` : ''

  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
  <tbody>
    <tr>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;white-space:nowrap;">소재지</td>
      <td style="border:1px solid #bbb;padding:6px 10px;" colspan="3">${project.address}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;white-space:nowrap;">중개대상물 종류</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.property_category || '-'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">주용도</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.main_use || '-'}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">해당층/총층</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.floor || project.total_floors ? `${project.floor ?? '-'}층 / ${project.total_floors ?? '-'}층` : '-'}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">거래형태</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${txType}</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">대지면적</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${formatArea(project.land_area)}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">사용승인일</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.approval_date || '-'}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">연면적</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${formatArea(project.total_area)}</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">전용면적</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${formatArea(project.area)}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">방/화장실</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.rooms_count !== undefined || project.bathrooms_count !== undefined ? `${project.rooms_count ?? '-'} / ${project.bathrooms_count ?? '-'}` : '-'}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">주차대수</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.parking_legal || project.parking_actual ? `대장: ${project.parking_legal ?? '-'}대 / 실주차: ${project.parking_actual ?? '-'}대` : '-'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">${priceLabel}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;color:#dc2626;font-weight:bold;">${priceValue}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">입주가능일</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.move_in_date || '협의'}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">방향</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.direction || '-'}</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">권리금</td>
      <td style="border:1px solid #bbb;padding:6px 10px;">${project.key_money ? formatPrice(project.key_money) : '무권리'}</td>
      <td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">관리비</td>
      <td style="border:1px solid #bbb;padding:6px 10px;white-space:pre-line;" colspan="3">${project.management_fee_detail || '-'}</td>
    </tr>
    ${agencyRows}
  </tbody>
</table>`
}
