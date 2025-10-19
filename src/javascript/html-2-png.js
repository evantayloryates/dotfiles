import fs from 'fs'
import puppeteer from 'puppeteer-core'

const fileUrl = 'file:///Users/taylor/Desktop/test.html'
const outputPath = '/Users/taylor/Desktop/test.png'

const capture = async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    headless: true,
    defaultViewport: { width: 1000, height: 1000 },
    args: ['--disable-gpu', '--no-sandbox']
  })

  const page = await browser.newPage()
  await page.goto(fileUrl, { waitUntil: 'networkidle0' })

  // Get full page height
  const fullHeight = await page.evaluate(() => document.body.scrollHeight)

  await page.setViewport({ width: 1000, height: fullHeight })
  await page.screenshot({
    path: outputPath,
    fullPage: true,
    omitBackground: false
  })

  await browser.close()
  console.log('✅ Screenshot saved to', outputPath)
}

capture().catch(err => {
  console.error('❌ Failed to capture:', err)
  process.exit(1)
})


