import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Tuesday 3 November 2026, 9:00 — fixed so dates and calendar positions are predictable.
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

test('quick add reads dates, times and repeats, and lets you correct them', async ({ page }) => {
  const errors = trackErrors(page)
  await page.clock.setFixedTime(NOW)
  await ready(page)

  await page.keyboard.press('q')
  const dialog = page.getByRole('dialog', { name: 'Quick add' })
  const chips = dialog.locator('.parsed-chip')
  await dialog.getByLabel('Task name').fill('Study every weekday at 7 PM #uni')
  // The date comes from the repeat, so the date row (not a chip) shows Today.
  await expect(chips).toHaveText(['7:00 PM', 'Every weekday', '#uni'])
  await expect(dialog.getByRole('button', { name: 'Today' })).toHaveClass(/active/)
  await shot(page, 'p2-quick-add')
  await dialog.getByRole('button', { name: 'Add task' }).click()

  // Remove a wrongly read date: the word goes back into the title.
  await page.keyboard.press('q')
  await dialog.getByLabel('Task name').fill('Meet Ama Friday at 2pm')
  await expect(chips).toHaveText(['Friday', '2:00 PM'])
  await dialog.getByRole('button', { name: /Don’t read “Friday”/ }).click()
  // A time on its own means today.
  await expect(chips).toHaveText(['2:00 PM'])
  await expect(dialog.getByRole('button', { name: 'Today' })).toHaveClass(/active/)
  await dialog.getByRole('button', { name: 'Add task' }).click()

  await page.goto('./#/tasks')
  const study = page.locator('.todo', { hasText: 'Study' })
  await expect(study).toContainText('7:00 PM')
  await expect(study).toContainText('Every weekday')
  await expect(page.locator('.todo', { hasText: 'Meet Ama Friday' })).toContainText('2:00 PM')

  // Completing a repeating task schedules the next one and keeps a record.
  await study.locator('.check').click()
  await expect(page.locator('.toast')).toContainText('Next one scheduled')
  await expect(page.locator('.todo:not(.done)', { hasText: 'Study' }).locator('.due-badge')).toContainText('Tomorrow')
  await page.getByRole('tab', { name: 'Completed' }).click()
  await expect(page.locator('.todo.done', { hasText: 'Study' })).toHaveCount(1)
  expect(errors).toEqual([])
})

test('task editor: projects, subtasks, custom repeats and unsaved changes', async ({ page }) => {
  const errors = trackErrors(page)
  await page.clock.setFixedTime(NOW)
  await ready(page)

  await page.getByRole('button', { name: 'New project' }).click()
  const projectDialog = page.getByRole('dialog', { name: 'New project' })
  await projectDialog.getByLabel('Name').fill('Home')
  await projectDialog.locator('.color-swatch[data-color="blue"]').click()
  await projectDialog.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home')
  await expect(page.locator('.side-sublink', { hasText: 'Home' })).toBeVisible()

  // Tasks added inside a project belong to it.
  await page.getByLabel('New task').fill('Fix the tap tomorrow')
  await page.keyboard.press('Enter')
  const row = page.locator('.todo', { hasText: 'Fix the tap' })
  await expect(row.locator('.due-badge')).toContainText('Tomorrow')

  await row.locator('.todo-body').click()
  const editor = page.getByRole('dialog', { name: 'Edit task' })
  await expect(editor.locator('#task-date')).toHaveValue('2026-11-04')
  await expect(editor.locator('#task-project')).toHaveValue(/.+/)
  for (const step of ['Buy a washer', 'Fit it']) {
    await editor.getByLabel('New subtask').fill(step)
    await editor.getByLabel('New subtask').press('Enter')
  }
  await editor.locator('#repeat-preset').selectOption('custom')
  await editor.getByLabel('Repeat interval').fill('2')
  await editor.getByRole('button', { name: 'Mon', exact: true }).click()
  await expect(editor.locator('.repeat-picker .field-hint')).toHaveText('Every 2 weeks on Mon, Wed')
  await editor.getByLabel('Category').fill('Home care')
  await shot(page, 'p2-editor')
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(editor).toBeHidden()

  await expect(row).toContainText('0/2')
  await expect(row).toContainText('Home care')
  await expect(row).toContainText('Every 2 weeks on Mon, Wed')
  await shot(page, 'p2-project')

  // Esc with unsaved changes asks first.
  await row.locator('.todo-body').click()
  await editor.getByLabel('Name').fill('Changed my mind')
  await page.keyboard.press('Escape')
  await expect(editor.getByText('Discard your changes?')).toBeVisible()
  await editor.getByRole('button', { name: 'Discard' }).click()
  await expect(editor).toBeHidden()
  await expect(row).toBeVisible()

  // Deleting a project keeps its tasks, and can be undone.
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog', { name: 'Delete project?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.side-sublink', { hasText: 'Home' })).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.side-sublink', { hasText: 'Home' })).toBeVisible()
  await page.goto('./#/tasks')
  await expect(page.locator('.todo', { hasText: 'Fix the tap' }).locator('.project-chip')).toHaveText('Home')
  expect(errors).toEqual([])
})

test('bulk actions and your own order', async ({ page }) => {
  const errors = trackErrors(page)
  await ready(page, './#/tasks')
  for (const title of ['Alpha', 'Bravo', 'Charlie']) {
    await page.getByLabel('New task').fill(title)
    await page.keyboard.press('Enter')
    await expect(page.locator('.todo', { hasText: title })).toBeVisible()
  }
  await page.getByLabel('Sort tasks').selectOption('manual')
  const titles = () => page.locator('.todo-list').first().locator('.todo-text')
  await expect(titles()).toHaveText(['Alpha', 'Bravo', 'Charlie'])

  await page.locator('.todo', { hasText: 'Charlie' }).dragTo(page.locator('.todo', { hasText: 'Alpha' }), {
    targetPosition: { x: 40, y: 4 },
  })
  await expect(titles()).toHaveText(['Charlie', 'Alpha', 'Bravo'])

  await page.locator('.todo', { hasText: 'Bravo' }).locator('.todo-body').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(titles()).toHaveText(['Charlie', 'Bravo', 'Alpha'])
  await page.reload()
  await expect(titles()).toHaveText(['Charlie', 'Bravo', 'Alpha'])

  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByLabel('Select "Alpha"').check({ force: true })
  await page.getByLabel('Select "Bravo"').check({ force: true })
  await expect(page.locator('.bulk-count')).toHaveText('2 selected')
  await page.getByRole('toolbar', { name: 'Selected tasks' }).getByRole('button', { name: 'Complete' }).click()
  await expect(page.locator('.toast')).toContainText('2 completed')
  await expect(titles()).toHaveText(['Charlie'])
  expect(errors).toEqual([])
})

test('calendar: schedule, drag, resize, overlaps, blocks and export', async ({ page }, testInfo) => {
  const errors = trackErrors(page)
  await page.clock.setFixedTime(NOW)
  await page.setViewportSize({ width: 1360, height: 900 })
  await ready(page, './#/calendar/week/2026-11-03')
  await expect(page.locator('.cal-title')).toContainText('Nov')

  const col = (date) => page.locator(`.tg-col[data-date="${date}"]`)
  const yFor = async (date, hour) => {
    const box = await col(date).boundingBox()
    return { x: box.x + box.width / 2, y: box.y + (box.height * hour) / 24 }
  }

  // Click an empty slot to add something at that time.
  let at = await yFor('2026-11-04', 10.2)
  await page.mouse.click(at.x, at.y)
  const editor = page.getByRole('dialog', { name: 'New task' })
  await expect(editor.locator('#task-date')).toHaveValue('2026-11-04')
  await expect(editor.getByLabel('Start time')).toHaveValue('10:00')
  await expect(editor.getByLabel('End time')).toHaveValue('11:00')
  await editor.getByLabel('Name').fill('Design review')
  await editor.getByRole('button', { name: 'Add task' }).click()
  const review = col('2026-11-04').locator('.cal-event', { hasText: 'Design review' })
  await expect(review).toBeVisible()

  // An overlapping item is flagged, never moved.
  await quickAdd(page, 'Call supplier wednesday 10:30-11:30')
  const call = page.locator('.cal-event', { hasText: 'Call supplier' })
  await expect(call).toHaveClass(/conflict/)
  await expect(page.locator('.cal-actions .conflict-note')).toHaveText('2 overlapping')
  await shot(page, 'p2-week')

  // Drag the call to Thursday at 2 PM.
  const from = await call.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + 4)
  await page.mouse.down()
  at = await yFor('2026-11-05', 14)
  await page.mouse.move(at.x, at.y + 4, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('.toast')).toContainText('Moved to Thursday, 2:00 PM')
  await expect(col('2026-11-05').locator('.cal-event', { hasText: 'Call supplier' })).toBeVisible()
  await expect(page.locator('.cal-actions .conflict-note')).toHaveCount(0)

  // Drag the bottom edge of the review to make it an hour longer.
  const handle = await review.locator('.cal-resize').boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 48, { steps: 8 })
  await page.mouse.up()
  await expect(review).toHaveAttribute('aria-label', /10:00 AM – 12:00 PM/)

  // A repeating time block shows on the calendar and dashboard, not in the task list.
  at = await yFor('2026-11-03', 12.1)
  await page.mouse.click(at.x, at.y)
  await editor.getByRole('radio', { name: 'Time block' }).click()
  await editor.getByLabel('Name').fill('Lunch')
  await editor.locator('#repeat-preset').selectOption('weekdays')
  await editor.getByRole('button', { name: 'Add time block' }).click()
  // Tuesday to Friday this week.
  await expect(page.locator('.cal-event.block', { hasText: 'Lunch' })).toHaveCount(4)
  await expect(col('2026-11-03').locator('.cal-event.block')).toHaveAttribute('aria-label', /12:00 PM – 1:00 PM/)

  // Schedule an undated task by dragging it in from the side panel.
  await quickAdd(page, 'Read paper')
  await page.getByRole('button', { name: /Unscheduled/ }).click()
  const item = page.locator('.unscheduled-item', { hasText: 'Read paper' })
  const itemBox = await item.boundingBox()
  await page.mouse.move(itemBox.x + 20, itemBox.y + itemBox.height / 2)
  await page.mouse.down()
  at = await yFor('2026-11-06', 9)
  await page.mouse.move(at.x, at.y + 2, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('.toast')).toContainText('Scheduled for Friday, 9:00 AM')

  await page.getByRole('radio', { name: 'Month' }).click()
  await expect(page.locator('.month-cell[data-date="2026-11-04"]')).toContainText('Design review')
  await shot(page, 'p2-month')
  await page.getByRole('radio', { name: 'Agenda' }).click()
  await expect(page.locator('.agenda')).toContainText('Design review')
  await expect(page.locator('.agenda')).toContainText('Read paper')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export/ }).click(),
  ])
  const file = testInfo.outputPath('calendar.ics')
  await download.saveAs(file)
  const ics = readFileSync(file, 'utf8')
  expect(ics).toContain('SUMMARY:Design review')
  expect(ics).toContain('DTSTART:20261104T100000')
  expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')

  await page.goto('./')
  await expect(page.locator('.dash-task.block', { hasText: 'Lunch' })).toBeVisible()
  await page.goto('./#/tasks')
  await expect(page.locator('.todo', { hasText: 'Lunch' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('calendar on a phone opens in day view without sideways scrolling', async ({ page }) => {
  const errors = trackErrors(page)
  await page.clock.setFixedTime(NOW)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' }) // and check the dark theme on the way
  await ready(page)
  await quickAdd(page, 'Dentist today 3-4pm')
  await quickAdd(page, 'Team sync today 3:30-4:30pm')
  // The closed drawer is inert, so only the bottom bar can be used.
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '')
  await page.locator('.bottom-nav').getByRole('link', { name: 'Calendar' }).click()
  await expect(page.locator('.time-grid.cols-1')).toBeVisible()
  await expect(page.locator('.cal-event', { hasText: 'Dentist' })).toBeVisible()
  await shot(page, 'p2-m-day')
  for (const view of ['Week', 'Month', 'Agenda']) {
    await page.getByRole('radio', { name: view }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, `sideways scroll in ${view}`).toBe(false)
  }
  await shot(page, 'p2-m-agenda')
  // Tapping an item opens it.
  await page.getByRole('radio', { name: 'Month' }).click()
  await shot(page, 'p2-m-month')
  await page.getByRole('radio', { name: 'Agenda' }).click()
  await page.locator('.agenda-title', { hasText: 'Dentist' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(errors).toEqual([])
})
