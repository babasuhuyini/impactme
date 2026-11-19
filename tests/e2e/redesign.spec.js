import { expect, test } from '@playwright/test'

// UI upgrade: screens from the "ImpactMe redesign directions" canvas.

// Optional: set SHOTS=<folder> to save screenshots for visual review.
async function shot(page, name) {
  if (!process.env.SHOTS) return
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${process.env.SHOTS}/redesign-${name}.png` })
}

async function quickAdd(page, text) {
  await page.keyboard.press('q')
  const dialog = page.getByRole('dialog', { name: 'Quick add' })
  await dialog.getByLabel('Task name').fill(text)
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the Tasks tab opens the hub: list tiles with counts, projects, and search', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('.main')).toBeVisible({ timeout: 20_000 })
    await quickAdd(page, 'Call the bank today')
    await quickAdd(page, 'Plan the trip')

    await page.locator('.bottom-nav').getByRole('link', { name: 'Tasks' }).click()
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
    const tiles = page.getByRole('navigation', { name: 'Task lists' }).getByRole('link')
    await expect(tiles).toHaveCount(6)
    await expect(tiles.filter({ hasText: 'Today' })).toContainText('1')
    await expect(tiles.filter({ hasText: 'All' })).toContainText('2')

    // Projects are back on phones.
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Name').fill('Home')
    await page.getByRole('dialog').getByRole('button', { name: /Create/ }).click()
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
    await page.getByRole('link', { name: 'Tasks' }).first().click()
    await expect(page.locator('.nav-row', { hasText: 'Home' })).toBeVisible()
    await shot(page, 'phone-hub')

    // A tile opens its list, with a way back.
    await tiles.filter({ hasText: 'Today' }).click()
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
    await expect(page.locator('.todo', { hasText: 'Call the bank' })).toBeVisible()
    await shot(page, 'phone-today')
    await page.locator('.back-link').click()
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()

    // Searching from the hub opens All tasks, filtered.
    await page.getByRole('searchbox', { name: 'Search tasks' }).fill('trip')
    await page.keyboard.press('Enter')
    await expect(page.locator('.todo')).toHaveCount(1)
    await expect(page.locator('.todo')).toContainText('Plan the trip')
  })
})

test('desktop task list: rows in a white card, views in the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 })
  await page.goto('./#/tasks')
  await expect(page.locator('.main')).toBeVisible({ timeout: 20_000 })
  await quickAdd(page, 'Review uploads today 9-10am !high #traceability')
  await expect(page.locator('.list-card .todo', { hasText: 'Review uploads' })).toBeVisible()
  await expect(page.getByRole('tablist')).toHaveCount(0)
  const row = page.locator('.todo', { hasText: 'Review uploads' })
  await expect(row.locator('.row-flag')).toHaveText('High priority')
  await expect(row.locator('.todo-meta')).toContainText('#traceability')
  await shot(page, 'desk-tasks')
})
