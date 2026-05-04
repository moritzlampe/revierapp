import type { Jagdjahr } from '@/lib/diary/season'
import type { DiaryStats } from '@/lib/diary/queries'
import SeasonPicker from './SeasonPicker'

interface Props {
  jagdjahr: Jagdjahr
  stats: DiaryStats
}

export default function DiaryHeader({ jagdjahr, stats }: Props) {
  return (
    <div className="px-6 pt-1 pb-3">
      <SeasonPicker jagdjahr={jagdjahr} />
      <div
        className="mt-2 flex flex-wrap"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          letterSpacing: '0.04em',
          color: 'var(--text-2)',
          lineHeight: 1.45,
          columnGap: '14px',
          rowGap: '4px',
        }}
      >
        <span
          className="inline-flex items-baseline whitespace-nowrap"
          style={{ gap: '4px' }}
        >
          <b style={{ color: 'var(--text)', fontWeight: 600 }}>
            {stats.jagdtage}
          </b>
          Jagdtage
        </span>
        <span
          className="inline-flex items-baseline whitespace-nowrap"
          style={{ gap: '4px' }}
        >
          <b style={{ color: 'var(--text)', fontWeight: 600 }}>
            {stats.erlegungen}
          </b>
          Erlegungen
        </span>
        <span
          className="inline-flex items-baseline whitespace-nowrap"
          style={{ gap: '4px' }}
        >
          <b style={{ color: 'var(--text)', fontWeight: 600 }}>
            {stats.stundenImRevier} h
          </b>
          im Revier
        </span>
      </div>
    </div>
  )
}
