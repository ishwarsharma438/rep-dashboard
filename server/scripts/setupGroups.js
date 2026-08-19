/**
 * ONE-OFF SETUP — creates the 16 coaching groups in Canvas.
 *
 *   Run this ONCE manually:  node server/scripts/setupGroups.js --confirm
 *
 * Without --confirm the script performs a DRY RUN: it prints exactly what it
 * would create and exits without touching Canvas. That default is deliberate —
 * running the file by accident must not write anything.
 *
 * What it does with --confirm:
 *   1. Creates an account-level group category "REP Coaching Groups"
 *      with group_limit 12 (Canvas enforces the per-group cap from the
 *      category, which is what surfaces as max_membership on each group).
 *   2. Creates 16 groups inside it, named "A - Acacia" … "P - Peppermint Gum".
 *      The route layer parses the leading letter back out, so the "<code> - "
 *      prefix is load-bearing — do not rename groups by hand.
 *   3. Prints the new category id to paste into CANVAS_GROUP_CATEGORY_ID.
 *
 * It is NOT idempotent: running it twice creates a second category and a
 * duplicate set of groups. If it fails partway, delete the partial category in
 * Canvas before re-running.
 */

// Must be first: canvasApi reads CANVAS_* env vars at module load time.
import 'dotenv/config'

import canvasApi from '../services/canvasApi.js'
import CANVAS_CONFIG from '../config/canvasConfig.js'
import { COACHING_GROUPS, GROUP_CAPACITY } from '../../src/data/roadmapEvents.js'

const CATEGORY_NAME = 'REP Coaching Groups'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const confirmed = process.argv.includes('--confirm')

const pad = (n) => String(n).padStart(2, '0')

function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)}${h >= 12 ? 'pm' : 'am'}`
}

/** The weekday a group meets, derived from its first session date. */
function weekday(group) {
  const [y, m, d] = group.dates[0].split('-').map(Number)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}

/** The Canvas group name. The "<code> - " prefix is parsed by the API layer. */
const groupName = (g) => `${g.code} - ${g.name}`

function groupDescription(g) {
  const cohort = g.cohort === 'cohort1' ? 'Cohort 1' : 'Cohort 2'
  const slot = `${weekday(g)}s, ${clock(g.startTime)} – ${clock(g.endTime)}`
  const dates = g.dates.join(', ')
  const meaning = g.meaning ? ` ${g.meaning}.` : ''
  return `${cohort}. ${slot}. Sessions: ${dates}.${meaning}`
}

function printPlan() {
  console.log(`\nAccount:        ${CANVAS_CONFIG.accountId}`)
  console.log(`Canvas:         ${CANVAS_CONFIG.baseUrl}`)
  console.log(`Category:       "${CATEGORY_NAME}" (group_limit ${GROUP_CAPACITY})`)
  console.log(`Groups to create: ${COACHING_GROUPS.length}\n`)

  for (const g of COACHING_GROUPS) {
    console.log(`  ${groupName(g).padEnd(28)} ${groupDescription(g)}`)
  }
}

async function main() {
  if (!CANVAS_CONFIG.baseUrl || !process.env.CANVAS_API_TOKEN) {
    console.error('CANVAS_BASE_URL and CANVAS_API_TOKEN must be set in .env')
    process.exit(1)
  }
  if (!CANVAS_CONFIG.accountId) {
    console.error('CANVAS_ACCOUNT_ID must be set in .env')
    process.exit(1)
  }

  printPlan()

  if (!confirmed) {
    console.log('\nDRY RUN — nothing was written to Canvas.')
    console.log('Re-run with --confirm to create the category and groups:\n')
    console.log('    node server/scripts/setupGroups.js --confirm\n')
    return
  }

  console.log('\nCreating group category…')
  const { data: category } = await canvasApi.post(
    `/accounts/${CANVAS_CONFIG.accountId}/group_categories`,
    { name: CATEGORY_NAME, group_limit: GROUP_CAPACITY }
  )
  console.log(`  created category ${category.id}`)

  const created = []
  for (const g of COACHING_GROUPS) {
    const { data: group } = await canvasApi.post(`/group_categories/${category.id}/groups`, {
      name: groupName(g),
      description: groupDescription(g),
      is_public: false,
      join_level: 'invitation_only',
    })
    created.push(group)
    console.log(`  created group ${String(group.id).padEnd(8)} ${group.name}`)
  }

  console.log(`\nDone — ${created.length} groups created.\n`)
  console.log('Add this to .env and restart the server:\n')
  console.log(`    CANVAS_GROUP_CATEGORY_ID=${category.id}\n`)
}

main().catch((err) => {
  const message = err.response?.data?.errors?.[0]?.message ?? err.message
  console.error(`\nSetup failed: ${message}`)
  console.error('If a category was created before the failure, delete it in Canvas before re-running.')
  process.exit(1)
})
