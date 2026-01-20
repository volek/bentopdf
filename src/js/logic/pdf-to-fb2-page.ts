import { createIcons, icons } from 'lucide';
import { showAlert, showLoader, hideLoader } from '../ui.js';
import { downloadFile, formatBytes } from '../utils/helpers.js';
import { PyMuPDF } from '@bentopdf/pymupdf-wasm';
import { getWasmBaseUrl } from '../config/wasm-cdn-config.js';

let files: File[] = [];
let pymupdf: PyMuPDF | null = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}

function initializePage() {
  createIcons({ icons });

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const dropZone = document.getElementById('drop-zone');
  const addMoreBtn = document.getElementById('add-more-btn');
  const clearFilesBtn = document.getElementById('clear-files-btn');
  const processBtn = document.getElementById(
    'process-btn'
  ) as HTMLButtonElement;

  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('bg-gray-600');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('bg-gray-600');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('bg-gray-600');
      const droppedFiles = e.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        handleFiles(droppedFiles);
      }
    });

    fileInput?.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
    });
  }

  if (addMoreBtn) {
    addMoreBtn.addEventListener('click', () => {
      fileInput?.click();
    });
  }

  if (clearFilesBtn) {
    clearFilesBtn.addEventListener('click', () => {
      files = [];
      updateUI();
    });
  }

  if (processBtn) {
    processBtn.addEventListener('click', convertToFb2);
  }

  document.getElementById('back-to-tools')?.addEventListener('click', () => {
    window.location.href = import.meta.env.BASE_URL;
  });
}

function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    handleFiles(input.files);
  }
}

function handleFiles(newFiles: FileList) {
  const validFiles = Array.from(newFiles).filter(
    (file) =>
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')
  );

  if (validFiles.length < newFiles.length) {
    showAlert(
      'Invalid Files',
      'Some files were skipped. Only PDF files are allowed.'
    );
  }

  if (validFiles.length > 0) {
    files = [...files, ...validFiles];
    updateUI();
  }
}

const resetState = () => {
  files = [];
  updateUI();
};

function updateUI() {
  const fileDisplayArea = document.getElementById('file-display-area');
  const fileControls = document.getElementById('file-controls');
  const extractOptions = document.getElementById('extract-options');

  if (!fileDisplayArea || !fileControls || !extractOptions) return;

  fileDisplayArea.innerHTML = '';

  if (files.length > 0) {
    fileControls.classList.remove('hidden');
    extractOptions.classList.remove('hidden');

    files.forEach((file, index) => {
      const fileDiv = document.createElement('div');
      fileDiv.className =
        'flex items-center justify-between bg-gray-700 p-3 rounded-lg text-sm';

      const infoContainer = document.createElement('div');
      infoContainer.className = 'flex items-center gap-2 overflow-hidden';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'truncate font-medium text-gray-200';
      nameSpan.textContent = file.name;

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'flex-shrink-0 text-gray-400 text-xs';
      sizeSpan.textContent = `(${formatBytes(file.size)})`;

      infoContainer.append(nameSpan, sizeSpan);

      const removeBtn = document.createElement('button');
      removeBtn.className =
        'ml-4 text-red-400 hover:text-red-300 flex-shrink-0';
      removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
      removeBtn.onclick = () => {
        files = files.filter((_, i) => i !== index);
        updateUI();
      };

      fileDiv.append(infoContainer, removeBtn);
      fileDisplayArea.appendChild(fileDiv);
    });
    createIcons({ icons });
  } else {
    fileControls.classList.add('hidden');
    extractOptions.classList.add('hidden');
  }
}

async function ensurePyMuPDF(): Promise<PyMuPDF> {
  if (!pymupdf) {
    pymupdf = new PyMuPDF(getWasmBaseUrl('pymupdf'));
    await pymupdf.load();
  }
  return pymupdf;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function buildFb2(text: string, title: string): string {
  const safeTitle = title.trim() || 'Document';
  const date = new Date().toISOString().split('T')[0];
  const paragraphs = normalizeText(text)
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.replace(/\n+/g, ' '));

  const body =
    paragraphs.length > 0
      ? paragraphs
          .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
          .join('\n      ')
      : '<empty-line/>';

  return `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <book-title>${escapeXml(safeTitle)}</book-title>
      <genre>nonfiction</genre>
      <lang>en</lang>
    </title-info>
    <document-info>
      <author>
        <nickname>BentoPDF</nickname>
      </author>
      <program-used>BentoPDF PDF to FB2</program-used>
      <date value="${date}">${date}</date>
    </document-info>
  </description>
  <body>
    <section>
      <title><p>${escapeXml(safeTitle)}</p></title>
      ${body}
    </section>
  </body>
</FictionBook>
`;
}

async function convertToFb2() {
  if (files.length === 0) {
    showAlert('No Files', 'Please select at least one PDF file.');
    return;
  }

  showLoader('Loading engine...');

  try {
    const mupdf = await ensurePyMuPDF();

    if (files.length === 1) {
      const file = files[0];
      showLoader(`Converting ${file.name}...`);

      const fullText = await mupdf.pdfToText(file);
      const baseName = file.name.replace(/\.pdf$/i, '');
      const fb2Content = buildFb2(fullText, baseName);
      const fb2Blob = new Blob([fb2Content], {
        type: 'application/x-fictionbook+xml;charset=utf-8',
      });

      downloadFile(fb2Blob, `${baseName}.fb2`);

      hideLoader();
      showAlert('Success', 'FB2 file created successfully!', 'success', () => {
        resetState();
      });
    } else {
      showLoader('Converting multiple files...');

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        showLoader(`Converting file ${i + 1}/${files.length}: ${file.name}...`);

        const fullText = await mupdf.pdfToText(file);
        const baseName = file.name.replace(/\.pdf$/i, '');
        const fb2Content = buildFb2(fullText, baseName);

        zip.file(`${baseName}.fb2`, fb2Content);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadFile(zipBlob, 'pdf-to-fb2.zip');

      hideLoader();
      showAlert(
        'Success',
        `Converted ${files.length} PDF files to FB2.`,
        'success',
        () => {
          resetState();
        }
      );
    }
  } catch (e: any) {
    console.error('[PDFToFB2]', e);
    hideLoader();
    showAlert('Conversion Error', e.message || 'Failed to convert PDF to FB2.');
  }
}
