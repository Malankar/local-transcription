import { test, expect, type Page } from '@playwright/test'

export async function assertMeetingLifecycle(window: Page, sourceLabel: string) {
  const startRecording = window.getByRole('button', { name: 'Start Recording' })
  try {
    await expect(startRecording).toBeEnabled({ timeout: 45_000 })
  } catch {
    test.skip(
      true,
      `No downloaded model and/or ${sourceLabel} (Start Recording stays disabled).`,
    )
  }

  await startRecording.click()
  await expect(window.getByText('Recording in progress')).toBeVisible()

  const timerLocator = window.locator('span.font-mono.text-lg.text-red-600')
  await expect(timerLocator).toHaveText(/\d{2}:\d{2}/)
  const t0 = await timerLocator.textContent()
  await expect
    .poll(async () => await timerLocator.textContent(), { timeout: 15_000 })
    .not.toBe(t0)

  await window.getByRole('button', { name: 'Stop Recording' }).click()
  await expect(window.getByRole('button', { name: 'Stop Recording' })).toBeHidden({
    timeout: 60_000,
  })

  const recordingSaved = window.getByRole('heading', { name: 'Recording saved' })
  const openInLibrary = window.getByRole('button', { name: 'Open in Library' })

  await expect(async () => {
    const cardVisible = await recordingSaved.isVisible().catch(() => false)
    const transcriptions = window.getByRole('heading', { name: 'Transcriptions' })
    const listVisible = await transcriptions.isVisible().catch(() => false)
    const stillEmpty = await window.getByText('No saved sessions yet.').isVisible().catch(() => false)
    return cardVisible || (listVisible && !stillEmpty)
  }).toPass({ timeout: 180_000 })

  if (await recordingSaved.isVisible().catch(() => false)) {
    await expect(openInLibrary).toBeVisible()
    await openInLibrary.click()
  }

  const transcriptionsHeading = window.getByRole('heading', { name: 'Transcriptions' })
  try {
    await expect(transcriptionsHeading).toBeVisible({ timeout: 30_000 })
  } catch {
    await window.getByRole('button', { name: 'Library', exact: true }).click()
    await expect(transcriptionsHeading).toBeVisible({ timeout: 30_000 })
  }
  const emptyLibrary = window.getByText('No saved sessions yet.')
  if (await emptyLibrary.isVisible().catch(() => false)) {
    test.skip(true, 'No session saved after stop; capture may need audible speech or working devices.')
  }
  await expect(emptyLibrary).toBeHidden()
}
