(() => {
  const assetBase = new URL("./", document.currentScript.src);
  const dependencies = new Map();
  function loadScript(file, isReady) {
    if (isReady()) return Promise.resolve();
    if (!dependencies.has(file)) {
      const pending = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL(file, assetBase).href;
        script.onload = () => isReady() ? resolve() : reject(new Error(file));
        script.onerror = () => { script.remove(); reject(new Error(file)); };
        document.head.append(script);
      }).catch(error => { dependencies.delete(file); throw error; });
      dependencies.set(file, pending);
    }
    return dependencies.get(file);
  }

  async function saveWorksheet(source, onProgress) {
    if (!source?.querySelector(".pq") || !source.querySelector(".pe")) throw new Error("worksheet");
    await Promise.all([
      loadScript("html2canvas.min.js", () => Boolean(window.html2canvas)),
      loadScript("jspdf.umd.min.js", () => Boolean(window.jspdf?.jsPDF)),
    ]);
    await document.fonts?.ready;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const margin = 14;
    const width = 210 - 2 * margin;
    const height = 297 - 2 * margin;
    const widthPx = Math.round(width * 96 / 25.4);
    const heightPx = Math.floor(height * widthPx / width) - 1;
    const stage = document.createElement("div");
    stage.setAttribute("aria-hidden", "true");
    stage.style.cssText = "position:absolute;top:0;left:-10000px;pointer-events:none";
    const page = document.createElement("div");
    page.className = "pv worksheet-export";
    page.style.cssText = `box-sizing:border-box;width:${widthPx}px;max-width:none;margin:0;padding:1px 0;border:0;border-radius:0;background:white;color:#111`;
    stage.append(page);
    document.body.append(stage);

    let pageCount = 0;
    async function flush() {
      if (!page.childElementCount) return;
      onProgress?.(pageCount + 1);
      const canvas = await window.html2canvas(page, { scale: 1.7, backgroundColor: "#fff", logging: false, useCORS: true, windowWidth: 1024 });
      try {
        if (pageCount++) pdf.addPage("a4");
        const scale = Math.min(width / canvas.width, height / canvas.height);
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", margin, margin, canvas.width * scale, canvas.height * scale);
      } finally {
        canvas.width = canvas.height = 0;
        page.replaceChildren();
      }
    }

    try {
      for (const block of source.children) {
        if (block.classList.contains("pbreak")) {
          await flush();
          continue;
        }
        const copy = block.cloneNode(true);
        page.append(copy);
        const images = [...copy.querySelectorAll("img")];
        await Promise.all(images.map(async img => {
          if (!img.complete) await img.decode();
          if (!img.naturalWidth) throw new Error("image");
        }));
        if (page.scrollHeight > heightPx && page.childElementCount > 1) {
          copy.remove();
          await flush();
          page.append(copy);
        }
      }
      await flush();
      pdf.save((source.querySelector("h1")?.textContent || "錯題練習卷").trim() + ".pdf");
    } finally {
      stage.remove();
    }
  }

  window.saveWorksheet = saveWorksheet;
})();
