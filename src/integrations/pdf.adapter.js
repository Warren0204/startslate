/**
 * @file src/integrations/pdf.adapter.js
 * @description Flattened StartSlate Employee Onboarding Summary & NDA PDF generator with free-trial watermarking via pdf-lib.
 */

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

import { AppError } from '../lib/errors.js';

const NAVY = rgb(15 / 255, 23 / 255, 42 / 255); // #0F172A
const EMERALD = rgb(16 / 255, 185 / 255, 129 / 255); // #10B981
const SLATE_TEXT = rgb(51 / 255, 65 / 255, 85 / 255); // #334155
const MUTED_TEXT = rgb(100 / 255, 116 / 255, 139 / 255); // #64748B
const WATERMARK_GRAY = rgb(148 / 255, 163 / 255, 184 / 255); // #94A3B8
const BORDER_GRAY = rgb(226 / 255, 232 / 255, 240 / 255); // #E2E8F0

/**
 * Strips characters outside WinAnsi Latin-1 range so pdf-lib standard fonts never throw encoding errors.
 *
 * @description Replaces unsupported Unicode characters with safe ASCII equivalents for Helvetica rendering.
 * @param {unknown} value - Raw text value.
 * @param {string} [fallback='N/A'] - Default text when empty.
 * @returns {string} WinAnsi-safe string.
 * @throws {Error} Never throws.
 */
function toSafePdfText(value, fallback = 'N/A') {
  if (value === null || value === undefined) {
    return fallback;
  }
  const str = String(value).replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').trim();
  return str || fallback;
}

/**
 * Stamps a translucent diagonal `"SAMPLE - FREE TRIAL"` watermark across every page of a PDFDocument.
 *
 * @description Iterates over all pages and draws rotated watermark text centered across the page.
 * @param {PDFDocument} pdfDoc - Target pdf-lib document.
 * @param {import('pdf-lib').PDFFont} boldFont - Embedded bold font used for watermark text.
 * @returns {void} Nothing.
 * @throws {Error} Never throws on valid pdf-lib documents.
 */
function stampFreeTrialWatermark(pdfDoc, boldFont) {
  const watermarkText = 'SAMPLE - FREE TRIAL';
  const fontSize = 44;

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = boldFont.widthOfTextAtSize(watermarkText, fontSize);
    page.drawText(watermarkText, {
      x: (width - textWidth * 0.7) / 2,
      y: height * 0.34,
      size: fontSize,
      font: boldFont,
      color: WATERMARK_GRAY,
      opacity: 0.28,
      rotate: degrees(42),
    });
  }
}

/**
 * Generates a flattened StartSlate Employee Onboarding Summary & NDA PDF packet.
 *
 * @description Builds a two-section branded summary and confidentiality/RA 10173 attestation PDF using AcroForm
 * fields flattened for tamper-evidence, optionally appends source offer pages, and stamps a diagonal
 * `"SAMPLE - FREE TRIAL"` watermark when `org_subscription_tier === 'free_trial'`.
 * @param {{
 *   orgName: string,
 *   orgSubscriptionTier: string,
 *   hire: {
 *     hire_id: string,
 *     hire_full_name: string,
 *     hire_job_title: string,
 *     hire_department_name: string,
 *     hire_start_date: string,
 *     hire_employment_type?: string,
 *     hire_work_email?: string|null,
 *     hire_gov_id_type?: string|null,
 *     masked_gov_id_number?: string,
 *     hire_consent_accepted_at?: string|null,
 *     hire_consent_version?: string|null,
 *     hire_status: string
 *   },
 *   offerPdfBuffer?: Buffer|null
 * }} params - Packet compilation parameters.
 * @returns {Promise<Buffer>} Flattened PDF binary buffer.
 * @throws {AppError} PDF_GENERATION_FAILED (500) if pdf-lib fails to build or save the document.
 */
export async function generateOnboardingPacketPdf({
  orgName,
  orgSubscriptionTier,
  hire,
  offerPdfBuffer = null,
}) {
  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`StartSlate Onboarding Packet - ${toSafePdfText(hire.hire_full_name)}`);
    pdfDoc.setAuthor('StartSlate');
    pdfDoc.setCreator('StartSlate Onboarding Engine');

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([612, 792]); // US Letter
    const { width, height } = page.getSize();

    // Header Banner (Deep Slate Navy + Crisp Emerald accent strip)
    page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: NAVY });
    page.drawRectangle({ x: 0, y: height - 96, width, height: 4, color: EMERALD });

    page.drawText('StartSlate', {
      x: 44,
      y: height - 46,
      size: 22,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    page.drawText('Employee Onboarding Summary & Mutual NDA Packet', {
      x: 44,
      y: height - 68,
      size: 11,
      font: regularFont,
      color: rgb(203 / 255, 213 / 255, 225 / 255),
    });
    page.drawText(`Organization: ${toSafePdfText(orgName)}`, {
      x: 44,
      y: height - 84,
      size: 9,
      font: regularFont,
      color: EMERALD,
    });

    // Flattened Summary Form Fields
    const form = pdfDoc.getForm();
    const fields = [
      ['Full Name', toSafePdfText(hire.hire_full_name)],
      ['Job Title', toSafePdfText(hire.hire_job_title)],
      ['Department', toSafePdfText(hire.hire_department_name)],
      ['Start Date', toSafePdfText(hire.hire_start_date)],
      ['Employment Type', toSafePdfText(hire.hire_employment_type || 'full_time')],
      ['Work Email', toSafePdfText(hire.hire_work_email, 'Pending IT Provisioning')],
      ['Government ID Type', toSafePdfText(hire.hire_gov_id_type)],
      ['Government ID Number (Masked)', toSafePdfText(hire.masked_gov_id_number, '****')],
      ['Onboarding Status', toSafePdfText(hire.hire_status)],
      ['Hire Reference ID', toSafePdfText(hire.hire_id)],
    ];

    page.drawText('1. Verified Employee Onboarding Summary', {
      x: 44,
      y: height - 130,
      size: 13,
      font: boldFont,
      color: NAVY,
    });

    let cursorY = height - 160;
    for (let i = 0; i < fields.length; i += 1) {
      const [label, value] = fields[i];
      page.drawText(label, {
        x: 44,
        y: cursorY + 5,
        size: 9.5,
        font: boldFont,
        color: SLATE_TEXT,
      });

      const field = form.createTextField(`summary_field_${i}`);
      field.setText(value);
      field.addToPage(page, {
        x: 230,
        y: cursorY - 2,
        width: 338,
        height: 18,
        borderColor: BORDER_GRAY,
        borderWidth: 0.75,
        backgroundColor: rgb(248 / 255, 250 / 255, 252 / 255),
        textColor: NAVY,
        font: regularFont,
      });
      cursorY -= 25;
    }

    // Section 2: Standard Mutual Non-Disclosure Agreement & RA 10173 Attestation
    const ndaTopY = cursorY - 18;
    page.drawLine({
      start: { x: 44, y: ndaTopY + 12 },
      end: { x: width - 44, y: ndaTopY + 12 },
      thickness: 1,
      color: BORDER_GRAY,
    });

    page.drawText('2. Confidentiality, Non-Disclosure & RA 10173 Data Privacy Attestation', {
      x: 44,
      y: ndaTopY - 8,
      size: 13,
      font: boldFont,
      color: NAVY,
    });

    const ndaParagraphs = [
      `Confidentiality Undertaking: The employee (${toSafePdfText(hire.hire_full_name)}) acknowledges that during employment with ${toSafePdfText(orgName)}, they may access proprietary systems, source code, client records, and trade secrets. All confidential information shall be used strictly for authorized company business and protected against unauthorized disclosure during and after employment.`,
      `Data Privacy Act of 2012 (RA 10173) Consent Record: Explicit candidate consent was recorded under notice version ${toSafePdfText(hire.hire_consent_version, 'ra10173-v1')} at ${toSafePdfText(hire.hire_consent_accepted_at, 'Not recorded')}. Sensitive personal information is encrypted at rest and retained according to company DPO retention rules.`,
    ];

    let textY = ndaTopY - 30;
    for (const paragraph of ndaParagraphs) {
      const words = paragraph.split(' ');
      let line = '';
      for (const word of words) {
        const candidateLine = line ? `${line} ${word}` : word;
        if (regularFont.widthOfTextAtSize(candidateLine, 9.5) > width - 88) {
          page.drawText(line, { x: 44, y: textY, size: 9.5, font: regularFont, color: SLATE_TEXT });
          textY -= 14;
          line = word;
        } else {
          line = candidateLine;
        }
      }
      if (line) {
        page.drawText(line, { x: 44, y: textY, size: 9.5, font: regularFont, color: SLATE_TEXT });
        textY -= 22;
      }
    }

    // Footer
    page.drawText(`Generated by StartSlate on ${new Date().toISOString()} — Flattened Tamper-Evident Copy`, {
      x: 44,
      y: 34,
      size: 8,
      font: regularFont,
      color: MUTED_TEXT,
    });

    // Flatten AcroForm fields so the output packet is non-editable
    form.flatten();

    // Optionally append source Offer Letter pages
    if (offerPdfBuffer && Buffer.byteLength(offerPdfBuffer) > 0) {
      try {
        const offerDoc = await PDFDocument.load(offerPdfBuffer, { ignoreEncryption: true });
        const copiedPages = await pdfDoc.copyPages(offerDoc, offerDoc.getPageIndices());
        for (const copied of copiedPages) {
          pdfDoc.addPage(copied);
        }
      } catch {
        // Keep the generated summary packet if the uploaded offer PDF uses unsupported encryption
      }
    }

    if (orgSubscriptionTier === 'free_trial') {
      stampFreeTrialWatermark(pdfDoc, boldFont);
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to compile onboarding PDF packet.', 'PDF_GENERATION_FAILED', 500);
  }
}
