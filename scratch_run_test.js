const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

(async () => {
  // Try to find a working browser executable
  const paths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  let executablePath = null;
  for (const p of paths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  if (!executablePath) {
    console.error("Could not find Edge or Chrome executable.");
    process.exit(1);
  }

  console.log(`Using browser executable: ${executablePath}`);

  const browser = await chromium.launch({ 
    headless: true,
    executablePath: executablePath
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.log(`[BROWSER PAGEERROR] ${err.message}`);
  });

  try {
    console.log("Navigating to http://localhost:3000/Space-Ship-Network/ ...");
    await page.goto('http://localhost:3000/Space-Ship-Network/');
    
    // Wait for the game to load
    await page.waitForTimeout(4000);

    // Take initial screen screenshot
    const screenshotDir = 'C:\\Users\\kench\\.gemini\\antigravity\\brain\\0bffae62-f105-4a42-b80d-2ae07fca3b81';
    const screenshot1Path = path.join(screenshotDir, 'step1_initial.png');
    await page.screenshot({ path: screenshot1Path });
    console.log(`Step 1 Screenshot saved to ${screenshot1Path}`);

    // Check canvas and overlay sizes
    const sizes = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const overlay = document.querySelector('.title-overlay') || document.querySelector('[class*="overlay"]') || document.body;
      return {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        canvasWidth: canvas ? canvas.clientWidth : null,
        canvasHeight: canvas ? canvas.clientHeight : null,
        canvasBounding: canvas ? canvas.getBoundingClientRect() : null,
        overlayWidth: overlay ? overlay.clientWidth : null,
        overlayHeight: overlay ? overlay.clientHeight : null,
        bodyWidth: document.body.clientWidth,
        bodyHeight: document.body.clientHeight
      };
    });
    console.log("Sizes:", JSON.stringify(sizes, null, 2));

    // Find the right-bottom button (艦隊編成)
    const fleetButton = page.locator('button:has-text("艦隊編成")');
    const fleetButtonText = await fleetButton.textContent();
    console.log(`Step 2: Title right-bottom button text is: "${fleetButtonText.trim()}"`);

    // Click "艦隊編成"
    console.log("Clicking '艦隊編成' button...");
    await fleetButton.click();
    await page.waitForTimeout(2000); // wait for transition

    // Take screenshot of customize screen
    const screenshot2Path = path.join(screenshotDir, 'step2_customize.png');
    await page.screenshot({ path: screenshot2Path });
    console.log(`Step 3 Screenshot saved to ${screenshot2Path}`);

    // Check if the next button is "任務開始"
    const startMissionButton = page.locator('button:has-text("任務開始")');
    const startMissionButtonText = await startMissionButton.textContent();
    console.log(`Step 3: Customize right-bottom button text is: "${startMissionButtonText.trim()}"`);

    // Log console errors
    console.log("Console Errors found during session:", consoleErrors);
    
    // Save results summary
    fs.writeFileSync(path.join(screenshotDir, 'test_summary.json'), JSON.stringify({
      sizes,
      fleetButtonText: fleetButtonText.trim(),
      startMissionButtonText: startMissionButtonText.trim(),
      consoleErrors
    }, null, 2));

  } catch (error) {
    console.error("Test failed with error:", error);
  } finally {
    await browser.close();
  }
})();
