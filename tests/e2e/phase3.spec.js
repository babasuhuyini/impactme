import { expect, test } from '@playwright/test'

// Tuesday 3 November 2026, 9:00.
const NOW = new Date(2026, 10, 3, 9, 0)

async function shot(page, name) {
  if (!process.env.SHOTS) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` })
}

function trackErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

async function ready(page, path = './') {
  await page.goto(path)
  await expect(page.locator('.brand-name')).toBeVisible()
}

async function quickAdd(page, text) {
  await page.keyboard.press('q')
  const dialog = page.getByRole('dialog', { name: 'Quick add' })
  await dialog.getByLabel('Task name').fill(text)
  await dialog.getByRole('button', { name: 'Add task' }).click()
  await expect(dialog).toBeHidden()
}

const swReady = (page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return Boolean(registration.active)
  })

const notifications = (page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return (await registration.getNotifications()).map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      actions: n.actions.map((a) => a.action),
      data: n.data,
    }))
  })

test('reminders: set them on a task, and without notifications they pop up in the app', async ({ page }) => {
  const errors = trackErrors(page)
  await page.clock.install({ time: NOW })
  await ready(page, './#/settings')

  // Notifications haven't been allowed, so Settings offers to turn them on.
  const section = page.locator('.settings-section', { hasText: 'Reminders & notifications' })
  await expect(section.getByText('Notifications are off')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Enable notifications' })).toBeVisible()
  await section.getByLabel('Default reminder for new tasks with a time').selectOption({ label: '5 min before' })
  await section.getByText('When will reminders arrive?').click()
  await expect(section.getByText('If your browser is closed')).toBeVisible()
  await shot(page, 'p3-settings')

  // The default reminder applies to new tasks with a time.
  await quickAdd(page, 'Call John at 9:10am')
  await quickAdd(page, 'Pay rent tomorrow')
  await page.goto('./#/tasks')
  const call = page.locator('.todo', { hasText: 'Call John' })
  await expect(call.getByTitle('1 reminder')).toBeVisible()
  await expect(page.locator('.todo', { hasText: 'Pay rent' }).getByTitle(/reminder/)).toHaveCount(0)

  // Add reminders in the editor: a preset and a fixed date and time.
  await page.locator('.todo', { hasText: 'Pay rent' }).getByText('Pay rent').click()
  const editor = page.getByRole('dialog', { name: 'Edit task' })
  await editor.getByLabel('Add a reminder').selectOption({ label: 'The day before, 9:00 AM' })
  await editor.getByLabel('Add a reminder').selectOption({ label: 'Custom…' })
  await editor.getByRole('radio', { name: 'On a date' }).click()
  await editor.getByLabel('Remind me at').fill('2026-11-03T18:30')
  await editor.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(editor.locator('.reminder-chip')).toHaveText(['The day before, 9:00 AM', 'Tue, Nov 3, 6:30 PM'])
  await expect(editor.getByText('This task has no time, so reminders count from 9:00 AM')).toBeVisible()
  await expect(editor.getByText('Notifications aren’t on, so these will pop up inside ImpactMe')).toBeVisible()
  await shot(page, 'p3-editor')
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.todo', { hasText: 'Pay rent' }).getByTitle('2 reminders')).toBeVisible()

  // 9:05: the reminder pops up inside the app.
  await page.clock.fastForward('05:00')
  const card = page.locator('.reminder-card', { hasText: 'Call John' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Due today at 9:10 AM')
  await shot(page, 'p3-in-app')

  // Snooze brings it back ten minutes later, once.
  await card.getByRole('button', { name: 'Snooze 10 min' }).click()
  await expect(card).toBeHidden()
  await page.clock.fastForward('09:00')
  await expect(card).toBeHidden()
  await page.clock.fastForward('01:30')
  await expect(card).toContainText('Snoozed reminder')

  // Mark done from the reminder.
  await page.setViewportSize({ width: 390, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await shot(page, 'p3-in-app-phone-dark')
  await page.setViewportSize({ width: 1280, height: 720 })
  await card.getByRole('button', { name: 'Mark done' }).click()
  await expect(card).toBeHidden()
  await expect(page.locator('.toast')).toContainText('Completed')

  // A reminder that has already been shown isn't shown again after a reload.
  await page.reload()
  await expect(page.locator('.brand-name')).toBeVisible()
  await page.clock.fastForward('01:00')
  await expect(page.locator('.reminder-card')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('reminders: with notifications allowed, they arrive as notifications with buttons', async ({ context, page }) => {
  const errors = trackErrors(page)
  await context.grantPermissions(['notifications'])
  await page.clock.install({ time: NOW })
  await ready(page, './#/settings')
  expect(await swReady(page)).toBe(true)

  const section = page.locator('.settings-section', { hasText: 'Reminders & notifications' })
  await expect(section.getByText('Notifications are on')).toBeVisible()
  await section.getByRole('button', { name: 'Send a test' }).click()
  await expect.poll(async () => (await notifications(page)).map((n) => n.tag)).toContain('impactme-test')

  await page.goto('./#/tasks')
  await page.keyboard.press('q')
  const dialog = page.getByRole('dialog', { name: 'Quick add' })
  await dialog.getByLabel('Task name').fill('Submit report at 9:30am !high')
  await dialog.getByRole('button', { name: 'More options' }).click()
  const editor = page.getByRole('dialog', { name: 'New task' })
  await editor.getByLabel('Add a reminder').selectOption({ label: '15 min before' })
  await editor.getByRole('button', { name: 'Add task' }).click()

  await page.clock.fastForward('15:00')
  await expect
    .poll(async () => (await notifications(page)).find((n) => n.title === 'Submit report'))
    .toMatchObject({ body: 'Due today at 9:30 AM · High priority', actions: ['done', 'snooze10'] })
  await expect(page.locator('.reminder-card')).toHaveCount(0)

  // Completing the task in the app clears its notification.
  await page.locator('.todo', { hasText: 'Submit report' }).getByRole('checkbox').check({ force: true })
  await expect.poll(async () => (await notifications(page)).some((n) => n.title === 'Submit report')).toBe(false)

  // A second tab doesn't send the same reminder again.
  await quickAdd(page, 'Stand-up at 9:20am')
  await page.locator('.todo', { hasText: 'Stand-up' }).getByText('Stand-up').click()
  const edit = page.getByRole('dialog', { name: 'Edit task' })
  await edit.getByLabel('Add a reminder').selectOption({ label: 'At the time' })
  await edit.getByRole('button', { name: 'Save' }).click()
  const second = await context.newPage()
  await second.goto('./#/')
  await page.clock.fastForward('05:00')
  await expect.poll(async () => (await notifications(page)).filter((n) => n.title === 'Stand-up').length).toBe(1)
  const sent = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('impactme')
        open.onsuccess = () => {
          const req = open.result.transaction('reminderLog').objectStore('reminderLog').getAll()
          req.onsuccess = () => resolve(req.result.length)
        }
      })
  )
  expect(sent).toBe(2)
  expect(errors).toEqual([])
})

test('blocked notifications explain how to allow them', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'denied' }))
  await ready(page, './#/settings')
  const section = page.locator('.settings-section', { hasText: 'Reminders & notifications' })
  await expect(section.getByText('Notifications are blocked for ImpactMe')).toBeVisible()
  await expect(section.getByText(/set Notifications to Allow/)).toBeVisible()
})

test('installable, and opens offline with your data after the first visit', async ({ context, page, request }) => {
  const errors = trackErrors(page)
  const manifest = await (await request.get('./manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'ImpactMe', short_name: 'ImpactMe', display: 'standalone', start_url: './' })
  for (const icon of manifest.icons) expect((await request.get(`./${icon.src}`)).status()).toBe(200)

  await ready(page, './#/settings')
  expect(await swReady(page)).toBe(true)
  const app = page.locator('.settings-section', { hasText: 'App & offline' })
  await expect(app.getByText('Works offline')).toBeVisible()
  await expect(app.getByText(`Version`)).toBeVisible()
  await app.scrollIntoViewIfNeeded()
  await shot(page, 'p3-app-settings')

  await quickAdd(page, 'Read on the train')
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.brand-name')).toBeVisible()
  await page.goto('./#/tasks')
  await expect(page.locator('.todo', { hasText: 'Read on the train' })).toBeVisible()
  // Fonts come from the device too.
  expect(await page.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans Variable"'))).toBe(true)
  await context.setOffline(false)
  expect(errors).toEqual([])
})

test('a notification click opens its task', async ({ page }) => {
  await ready(page)
  await quickAdd(page, 'Water the plants')
  const id = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('impactme')
        open.onsuccess = () => {
          const req = open.result.transaction('tasks').objectStore('tasks').getAll()
          req.onsuccess = () => resolve(req.result.find((t) => t.title === 'Water the plants').id)
        }
      })
  )
  await page.goto(`./#/?task=${id}`)
  const editor = page.getByRole('dialog', { name: 'Edit task' })
  await expect(editor.getByLabel('Name')).toHaveValue('Water the plants')
  await expect(page).toHaveURL(/#\/$/)
})
