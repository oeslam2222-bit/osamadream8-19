import * as XLSX from 'xlsx';

/**
 * Smart Arabic Encoding & File Reader Service
 * Fixes Arabic encoding issues ("????") in Excel, CSV, and Google Sheets exports
 * Supports UTF-8, UTF-8 with BOM, and Windows-1256 (Egyptian/Arab accounting systems)
 */

export function decodeBufferSmart(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 1. Check for UTF-8 Byte Order Mark (BOM)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    try {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    } catch {
      // Fallback below
    }
  }

  // 2. Try strict UTF-8 decoding
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(bytes);
    // If it decoded without errors and doesn't have replacement characters, it's valid UTF-8
    if (!text.includes('\uFFFD')) {
      return text;
    }
  } catch {
    // Not valid UTF-8, proceed to Windows-1256
  }

  // 3. Try Windows-1256 (Arabic Windows encoding used by Egyptian ERPs and Excel CSV exports)
  try {
    const win1256Decoder = new TextDecoder('windows-1256');
    const text = win1256Decoder.decode(bytes);
    if (text && text.length > 0) {
      return text;
    }
  } catch {
    // Windows-1256 not supported in environment, fallback to utf-8 lenient
  }

  // 4. Lenient UTF-8 fallback
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Checks whether an ArrayBuffer represents a PK zip file (.xlsx) or OLE compound file (.xls)
 */
export function isBinaryExcelFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // PK Zip format (.xlsx, .xlsm)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return true;
  }
  // OLE compound document (.xls legacy)
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return true;
  }
  return false;
}

/**
 * Resilient workbook parser for Excel files and CSVs with Arabic content
 */
export function parseExcelOrCsvBuffer(buffer: ArrayBuffer, fileName?: string): XLSX.WorkBook {
  const bytes = new Uint8Array(buffer);
  const isCsvOrTxt = fileName ? /\.(csv|txt)$/i.test(fileName) : !isBinaryExcelFormat(bytes);

  if (isCsvOrTxt) {
    // Decode with smart Arabic support (UTF-8 / Windows-1256)
    const decodedText = decodeBufferSmart(bytes).replace(/^\uFEFF/, '');
    return XLSX.read(decodedText, { type: 'string' });
  }

  // Binary Excel format (.xlsx / .xls)
  try {
    return XLSX.read(bytes, { type: 'array' });
  } catch (err) {
    // Secondary attempt with codepage
    try {
      return XLSX.read(bytes, { type: 'array', codepage: 65001 });
    } catch {
      throw err;
    }
  }
}
