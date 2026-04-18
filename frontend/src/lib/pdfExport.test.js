import { describe, expect, it, vi, beforeEach } from 'vitest';

import { exportElementToPdf } from './pdfExport';

const addImageMock = vi.fn();
const addPageMock = vi.fn();
const saveMock = vi.fn();

const jsPdfCtorMock = vi.fn();

class JsPdfMock {
  constructor() {
    jsPdfCtorMock();
    this.internal = {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    };
  }

  addImage(...args) {
    return addImageMock(...args);
  }

  addPage(...args) {
    return addPageMock(...args);
  }

  save(...args) {
    return saveMock(...args);
  }
}

const canvasMock = {
  width: 1080,
  height: 2160,
  toDataURL: vi.fn(() => 'data:image/png;base64,abc123'),
};

const html2canvasMock = vi.fn(async () => canvasMock);

vi.mock('jspdf', () => ({
  default: JsPdfMock,
}));

vi.mock('html2canvas', () => ({
  default: html2canvasMock,
}));

describe('exportElementToPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures a print-friendly white export surface and writes a pdf file', async () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<h1>Title</h1><p>Content</p>';
    document.body.appendChild(wrapper);

    const ref = { current: wrapper };

    await exportElementToPdf(ref, 'abc1234567890', 'nexus-report');

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    const [surfaceNode, options] = html2canvasMock.mock.calls[0];

    expect(surfaceNode).toBeTruthy();
    expect(options.backgroundColor).toBe('#ffffff');
    expect(options.useCORS).toBe(true);
    expect(options.scale).toBeGreaterThanOrEqual(2);

    expect(jsPdfCtorMock).toHaveBeenCalledTimes(1);
    expect(addImageMock).toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith('nexus-report-abc123456789.pdf');

    const exportHost = document.querySelector('[data-testid="pdf-export-host"]');
    expect(exportHost).toBeNull();

    document.body.removeChild(wrapper);
  });
});
