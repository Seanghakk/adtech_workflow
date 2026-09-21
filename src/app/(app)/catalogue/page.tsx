import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { lifecycleStepLabel } from '@/lib/reporting/catalogue'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_ADMIN } from '@/lib/breadcrumbs'

export const metadata: Metadata = {
  title: 'Catalogue — ADTECH Workflow Tracker',
}

/**
 * Catalogue index (Brief 026). Not one of the 18 named screens itself —
 * a plain list added so 3a (the item detail record) is actually
 * reachable in the running app, the same reason 2b/2c exist as entry
 * points into their own detail screens. Table archetype (§4.8's "plain
 * rows, 1px rules... no age ladder" reasoning applies here for the same
 * cause 3a states explicitly: this is inventory data, not a worked item
 * with an owner and a clock).
 */
export default async function CatalogueIndexPage() {
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: items } = await supabase
    .from('catalogue_items')
    .select('id, manufacturer, part_number, lifecycle_step')
    .order('manufacturer', { ascending: true })
    .order('part_number', { ascending: true })

  const rows = items ?? []

  return (
    <>
      <Breadcrumbs ancestors={[{ label: t(CRUMB_ADMIN.label), href: CRUMB_ADMIN.href }]} current={t('navAdminCatalogue')} />
      <div className="catalogue-index">
      <div className="catalogue-index__header">
        <div className="catalogue-index__kicker">{t('catalogueIndexKicker')}</div>
        <h1 className="catalogue-index__title">{t('catalogueIndexTitle')}</h1>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">{t('catalogueIndexEmpty')}</p>
      ) : (
        <table className="catalogue-index-table">
          <thead>
            <tr>
              <th>{t('catalogueIndexColManufacturer')}</th>
              <th>{t('catalogueIndexColPartNumber')}</th>
              <th>{t('catalogueIndexColStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.manufacturer}</td>
                <td>
                  <Link href={`/catalogue/${item.id}`} className="catalogue-index-table__link">
                    {item.part_number}
                  </Link>
                </td>
                <td>{t(lifecycleStepLabel(item.lifecycle_step))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </>
  )
}
