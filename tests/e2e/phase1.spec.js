import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Optional: set SHOTS=<folder> to save screenshots for visual review.
// Waits for entrance animations so the picture shows the settled screen.
async function shot(page, name) {
  if (!process.env.SHOTS) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` })
}

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

function trackErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

// Daybook data as it existed in localStorage before ImpactMe.
async function seedDaybook(context) {
  const data = {
    'todos.items': JSON.stringify([
      { id: 'legacy-1', text: 'Legacy task from Daybook', done: false },
      { id: 'legacy-2', text: 'Send report', done: false, due: key(daysFromNow(0)), priority: 3, tags: ['work'] },
      { id: 'legacy-3', text: 'Overdue thing', done: false, due: key(daysFromNow(-2)) },
      { id: 'legacy-4', text: 'Plan trip', done: false, due: key(daysFromNow(3)) },
    ]),
    'journal.entries': JSON.stringify([
      { id: 'old-entry', text: 'An entry from the first version.', createdAt: daysFromNow(-1).getTime() },
    ]),
    'ui.theme': JSON.stringify('light'),
  }
  await context.addInitScript((seed) => {
    if (localStorage.getItem('e2e.seeded')) return
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
    localStorage.setItem('e2e.seeded', '1')
  }, data)
}

test('Daybook data carries over and the dashboard summarises the day', async ({ context, page }) => {
  const errors = trackErrors(page)
  await seedDaybook(context)
  await page.setViewportSize({ width: 1360, height: 860 })
  await page.goto('./')

  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good|Still up/)
  await expect(page.locator('.brand-name')).toHaveText('ImpactMe')
  await expect(page).toHaveTitle('ImpactMe')
  await expect(page.locator('.dash-task', { hasText: 'Send report' })).toBeVisible()
  await expect(page.locator('.dash-task', { hasText: 'Overdue thing' })).toBeVisible()
  await expect(page.locator('.upcoming-day', { hasText: 'Plan trip' })).toBeVisible()
  await expect(page.locator('.progress-stats .alert dd')).toHaveText('1')
  await shot(page, 'dashboard-light')

  // Legacy priority 3 became High; the old localStorage copy is untouched.
  await page.getByRole('link', { name: /My Tasks/ }).click()
  await expect(page.locator('.todo', { hasText: 'Send report' }).locator('.priority-badge')).toHaveText('High')
  await expect(page.locator('.todo')).toHaveCount(4)
  const legacyStillThere = await page.evaluate(() => JSON.parse(localStorage.getItem('todos.items')).length)
  expect(legacyStillThere).toBe(4)

  await page.getByRole('link', { name: /Journal/ }).first().click()
  await expect(page.locator('.entry-item')).toHaveCount(1)
  await expect(page.locator('.entry-item-snippet')).toContainText('first version')

  // Reloading must not migrate twice.
  await page.reload()
  await page.goto('./#/tasks')
  await expect(page.locator('.todo')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('quick add, completing and undo work from anywhere', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('./')
  await expect(page.locator('.getting-started')).toBeVisible()

  await page.keyboard.press('q')
  const dialog = page.getByRole('dialog', { name: 'Quick add' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(dialog.locator('.field-error')).toHaveText('Give the task a name first.')

  await dialog.getByRole('textbox').fill('Buy milk #errands')
  await dialog.getByRole('button', { name: 'Today' }).click()
  await dialog.getByRole('radio', { name: 'Urgent' }).click()
  await shot(page, 'quick-add')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.toast')).toContainText('Task added for today')

  const row = page.locator('.dash-task', { hasText: 'Buy milk' })
  await expect(row.locator('.priority-badge')).toHaveText('Urgent')
  await row.locator('.check').click()
  await expect(page.locator('.done-list')).toContainText('Buy milk')
  await expect(page.locator('.day-ring-label strong')).toHaveText('100%')
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.dash-task', { hasText: 'Buy milk' })).toBeVisible()

  await page.reload()
  await expect(page.locator('.dash-task', { hasText: 'Buy milk' })).toBeVisible()
  await page.goto('./#/tasks')
  await expect(page.locator('.todo', { hasText: 'Buy milk' }).locator('.tag-link')).toHaveText('#errands')
  expect(errors).toEqual([])
})

test('two open tabs no longer overwrite each other', async ({ context }) => {
  const a = await context.newPage()
  const b = await context.newPage()
  await a.goto('./#/tasks')
  await b.goto('./#/tasks')

  await a.getByLabel('New task').fill('Written in tab A')
  await a.keyboard.press('Enter')
  await b.getByLabel('New task').fill('Written in tab B')
  await b.keyboard.press('Enter')

  // Each tab sees the other's task without a reload…
  await expect(a.locator('.todo', { hasText: 'Written in tab B' })).toBeVisible()
  await expect(b.locator('.todo', { hasText: 'Written in tab A' })).toBeVisible()
  // …and both survive a reload.
  await a.reload()
  await expect(a.locator('.todo')).toHaveCount(2)
})

test('journal autosaves, survives reload, and deletion can be undone', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('j')
  await expect(page.locator('.doc-title')).toBeFocused()
  await page.keyboard.type('Morning pages')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Wrote before checking my phone.')
  await expect(page.locator('.toolbar-meta')).toContainText('Saved')
  await page.reload()
  await expect(page.locator('.doc-title')).toHaveValue('Morning pages')
  await expect(page.locator('.doc-body')).toHaveValue('Wrote before checking my phone.')

  await page.getByRole('button', { name: 'Delete entry' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('.entry-item')).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.entry-item')).toHaveCount(1)

  // Mood check-in on the dashboard starts today's entry with that mood.
  await page.goto('./')
  await expect(page.locator('.journal-preview')).toContainText('Morning pages')
  expect(errors).toEqual([])
})

test('settings: name, theme, backup and restore', async ({ page }, testInfo) => {
  const errors = trackErrors(page)
  await page.goto('./#/settings')
  await page.getByLabel('Preferred name').fill('Ama')
  await page.getByLabel('Preferred name').press('Enter')
  await page.getByRole('radiogroup', { name: 'Theme' }).last().getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.goto('./#/tasks')
  for (const title of ['Keep me', 'Delete me']) {
    await page.getByLabel('New task').fill(title)
    await page.keyboard.press('Enter')
  }

  await page.goto('./#/settings')
  await shot(page, 'settings-dark')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup' }).click(),
  ])
  const file = testInfo.outputPath('backup.json')
  await download.saveAs(file)
  const backup = JSON.parse(readFileSync(file, 'utf8'))
  expect(backup.format).toBe('impactme-backup')
  expect(backup.data.tasks.map((t) => t.title).sort()).toEqual(['Delete me', 'Keep me'])
  expect(backup.data.settings.name).toBe('Ama')
  await expect(page.locator('.callout-meta')).toContainText('just now')

  // Lose a task, then get it back from the backup.
  await page.goto('./#/tasks')
  await page.locator('.todo', { hasText: 'Delete me' }).getByRole('button', { name: /^Delete "/ }).click()
  await expect(page.locator('.todo')).toHaveCount(1)

  await page.goto('./#/settings')
  await page.locator('input[type=file]').setInputFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Restore from backup' })
  await expect(dialog).toContainText('2 tasks')
  await expect(dialog.getByRole('radio', { name: /Combine/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Restore' }).click()
  await expect(page.locator('.toast')).toContainText('1 added')
  await expect(page.locator('.data-summary')).toContainText('2')

  // A file that isn't a backup is refused with a clear message.
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') })
  await expect(page.locator('.toast.error')).toContainText('isn’t an ImpactMe backup')

  // The theme and name persist, and the theme applies before the app loads.
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ama')
  await shot(page, 'dashboard-dark')
  expect(errors).toEqual([])
})

test('phone layout: bottom bar, + button, no sideways scrolling', async ({ context, page }) => {
  const errors = trackErrors(page)
  await seedDaybook(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')

  await expect(page.locator('.bottom-nav')).toBeVisible()
  await expect(page.locator('.sidebar')).not.toBeInViewport()
  await shot(page, 'm-dashboard')

  for (const route of ['./', './#/tasks', './#/journal', './#/settings']) {
    await page.goto(route)
    await page.waitForTimeout(150)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, `sideways scroll on ${route}`).toBe(false)
  }

  await page.locator('.fab').click()
  await expect(page.getByRole('dialog', { name: 'Quick add' })).toBeVisible()
  await shot(page, 'm-quick-add')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /More/ }).click()
  await expect(page.locator('.sidebar')).toBeInViewport()
  await shot(page, 'm-drawer')
  await page.locator('.sidebar').getByRole('link', { name: 'Settings' }).click()
  await expect(page.locator('.sidebar')).not.toBeInViewport()

  // Writing gets the whole screen.
  await page.goto('./#/journal')
  await page.locator('.entry-item').first().click()
  await expect(page.locator('.bottom-nav')).toBeHidden()
  await expect(page.locator('.fab')).toBeHidden()
  await shot(page, 'm-editor')
  expect(errors).toEqual([])
})
