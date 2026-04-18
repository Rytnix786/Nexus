const A4_MM = { width: 210, height: 297 };
const PAGE_MARGIN_MM = 10;

function getCanvasScale() {
  const dpr = Number(window.devicePixelRatio || 1);
  return Math.max(2, Math.min(3, dpr * 2));
}

function buildExportSurface(sourceElement) {
  const host = document.createElement('div');
  host.setAttribute('data-testid', 'pdf-export-host');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '1080px';
  host.style.padding = '40px';
  host.style.background = '#ffffff';
  host.style.color = '#0f172a';
  host.style.zIndex = '-1';

  const style = document.createElement('style');
  style.textContent = `
    .pdf-export-root {
      font-family: "Segoe UI", "Inter", Arial, sans-serif;
      line-height: 1.65;
      color: #0f172a;
      font-size: 14px;
      background: #ffffff;
    }
    .pdf-export-root h1,
    .pdf-export-root h2,
    .pdf-export-root h3,
    .pdf-export-root h4 {
      color: #111827;
      margin-top: 1.1em;
      margin-bottom: 0.4em;
      page-break-after: avoid;
    }
    .pdf-export-root p,
    .pdf-export-root li,
    .pdf-export-root blockquote {
      color: #111827;
      page-break-inside: avoid;
    }
    .pdf-export-root pre,
    .pdf-export-root code {
      white-space: pre-wrap;
      word-break: break-word;
      color: #0f172a;
      background: #f3f4f6;
    }
    .pdf-export-root table {
      border-collapse: collapse;
      width: 100%;
      page-break-inside: avoid;
    }
    .pdf-export-root th,
    .pdf-export-root td {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      color: #111827;
    }
  `;

  const clone = sourceElement.cloneNode(true);
  clone.classList.add('pdf-export-root');
  clone.style.background = '#ffffff';
  clone.style.border = 'none';
  clone.style.boxShadow = 'none';
  clone.style.maxWidth = 'none';
  clone.style.width = '100%';
  clone.style.padding = '0';

  host.appendChild(style);
  host.appendChild(clone);
  document.body.appendChild(host);

  return {
    host,
    cleanup() {
      if (host.parentNode) {
        host.parentNode.removeChild(host);
      }
    },
  };
}

export async function exportElementToPdf(contentRef, runId, filePrefix = 'nexus-report') {
  const sourceElement = contentRef?.current;
  if (!sourceElement) {
    throw new Error('Content not mounted');
  }

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const surface = buildExportSurface(sourceElement);

  try {
    const canvas = await html2canvas(surface.host, {
      scale: getCanvasScale(),
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: surface.host.scrollWidth,
      windowHeight: surface.host.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth() || A4_MM.width;
    const pageHeight = pdf.internal.pageSize.getHeight() || A4_MM.height;
    const usableWidth = pageWidth - PAGE_MARGIN_MM * 2;
    const usableHeight = pageHeight - PAGE_MARGIN_MM * 2;

    const imageData = canvas.toDataURL('image/png');
    const imageHeight = (canvas.height * usableWidth) / canvas.width;

    let remainingHeight = imageHeight;
    let yOffset = PAGE_MARGIN_MM;

    pdf.addImage(imageData, 'PNG', PAGE_MARGIN_MM, yOffset, usableWidth, imageHeight, undefined, 'MEDIUM');
    remainingHeight -= usableHeight;

    while (remainingHeight > 0) {
      yOffset = PAGE_MARGIN_MM - (imageHeight - remainingHeight);
      pdf.addPage();
      pdf.addImage(imageData, 'PNG', PAGE_MARGIN_MM, yOffset, usableWidth, imageHeight, undefined, 'MEDIUM');
      remainingHeight -= usableHeight;
    }

    const safeRunId = String(runId || 'export').slice(0, 12);
    pdf.save(`${filePrefix}-${safeRunId}.pdf`);
  } finally {
    surface.cleanup();
  }
}
