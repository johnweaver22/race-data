import { createExcelExport, excelFilename, EXCEL_MIME } from './excel-export.mjs';
export const XLSX_MIME = EXCEL_MIME;

export async function loadExcelFile(config, timestamps, fetcher = fetch) {
  // Only load the template as an ordinary asset; race data stays in this browser.
  const response = await fetcher('./assets/race-export-template.xlsx', {
    credentials: 'same-origin', redirect: 'error',
  });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Could not load the Excel template');
  }
  const date = new Date();
  const bytes = await createExcelExport(config, timestamps, await response.arrayBuffer(), date);
  return new File([bytes], excelFilename(config, date), { type: XLSX_MIME });
}

export function saveExcelFile(file, scope = globalThis) {
  // Same synchronous Blob -> download anchor sequence as Swim Clock exportCsv.
  const blob = new Blob([file], { type: XLSX_MIME });
  const url = scope.URL.createObjectURL(blob);
  const a = scope.document.createElement('a');
  a.href = url;
  a.download = file.name;
  scope.document.body.append(a);
  a.click();
  a.remove();
  scope.setTimeout(() => scope.URL.revokeObjectURL(url), 5000);
}
