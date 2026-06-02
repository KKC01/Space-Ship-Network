const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

(async () => {
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

  const browser = await chromium.launch({ 
    headless: true,
    executablePath: executablePath
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`[RESPONSE ERROR] ${response.url()} status=${response.status()}`);
    }
  });

  try {
    console.log("Navigating to http://localhost:3000/Space-Ship-Network/ ...");
    await page.goto('http://localhost:3000/Space-Ship-Network/');
    
    // Wait for the game to load
    await page.waitForTimeout(5000);

    // Get specific properties of title-overlay
    const overlayInfo = await page.evaluate(() => {
      const el = document.getElementById('title-overlay');
      if (!el) return 'Not Found';
      return {
        id: el.id,
        className: el.className,
        style: el.getAttribute('style'),
        innerHTML: el.innerHTML,
        outerHTML: el.outerHTML
      };
    });
    
    console.log("--- TITLE-OVERLAY INFO ---");
    console.log(JSON.stringify(overlayInfo, null, 2));
    console.log("--------------------------");

  } catch (error) {
    console.error("Test failed with error:", error);
  } finally {
    await browser.close();
  }
})();
