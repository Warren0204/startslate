/**
 * @file src/integrations/gemini.adapter.js
 * @description Google Gemini 2.5 Flash adapter using strict JSON responseSchema and Zod validation for Offer Letters and Government IDs.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';

import { ExternalServiceError } from '../lib/errors.js';
import { GOV_ID_TYPES, isValidIsoDate } from '../lib/validation/schemas.js';

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Zod schema validating Gemini's Offer Letter extraction payload.
 *
 * @description Enforces strict field types, valid ISO calendar dates, non-negative salaries, and bounded confidence scores.
 */
export const offerLetterExtractionSchema = z.object({
  full_name: z.string().trim().min(1).max(200).nullable(),
  personal_email: z.string().trim().toLowerCase().email().max(320).nullable().catch(null),
  job_title: z.string().trim().min(1).max(200).nullable(),
  department_name: z.string().trim().min(1).max(120).nullable(),
  expected_start_date: z
    .string()
    .trim()
    .refine(isValidIsoDate, 'Expected YYYY-MM-DD')
    .nullable()
    .catch(null),
  base_salary_amount: z.number().finite().nonnegative().max(1_000_000_000).nullable().catch(null),
  confidence_score: z.number().finite().min(0).max(1),
});

/**
 * Zod schema validating Gemini's Government ID extraction payload.
 *
 * @description Restricts `id_type` to known Philippine/international ID classifications and bounds `confidence_score` to [0, 1].
 */
export const govIdExtractionSchema = z.object({
  id_type: z.enum(GOV_ID_TYPES).nullable().catch('other'),
  id_number: z.string().trim().min(1).max(80).nullable(),
  full_name: z.string().trim().min(1).max(200).nullable(),
  address: z.string().trim().min(1).max(500).nullable(),
  confidence_score: z.number().finite().min(0).max(1),
});

const OFFER_LETTER_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    full_name: { type: Type.STRING, nullable: true },
    personal_email: { type: Type.STRING, nullable: true },
    job_title: { type: Type.STRING, nullable: true },
    department_name: { type: Type.STRING, nullable: true },
    expected_start_date: {
      type: Type.STRING,
      nullable: true,
      description: 'Start date in YYYY-MM-DD format.',
    },
    base_salary_amount: {
      type: Type.NUMBER,
      nullable: true,
      description: 'Numeric monthly or annual base salary without currency symbols.',
    },
    confidence_score: {
      type: Type.NUMBER,
      description: 'Overall extraction confidence between 0.0 and 1.0.',
    },
  },
  required: [
    'full_name',
    'personal_email',
    'job_title',
    'department_name',
    'expected_start_date',
    'base_salary_amount',
    'confidence_score',
  ],
};

const GOV_ID_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id_type: {
      type: Type.STRING,
      nullable: true,
      enum: [...GOV_ID_TYPES],
    },
    id_number: { type: Type.STRING, nullable: true },
    full_name: { type: Type.STRING, nullable: true },
    address: { type: Type.STRING, nullable: true },
    confidence_score: {
      type: Type.NUMBER,
      description: 'Overall OCR and authenticity readability confidence between 0.0 and 1.0.',
    },
  },
  required: ['id_type', 'id_number', 'full_name', 'address', 'confidence_score'],
};

let cachedClient = null;

/**
 * Returns a configured `@google/genai` client using `process.env.GEMINI_API_KEY`.
 *
 * @description Lazily initializes the Gemini SDK singleton on the server.
 * @param {string} [apiKey=process.env.GEMINI_API_KEY] - Optional API key override.
 * @returns {GoogleGenAI} Configured GoogleGenAI client instance.
 * @throws {ExternalServiceError} AI_NOT_CONFIGURED (502) when `GEMINI_API_KEY` is missing.
 */
function getGeminiClient(apiKey = process.env.GEMINI_API_KEY) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new ExternalServiceError('Gemini AI extraction service is not configured.', 'AI_NOT_CONFIGURED');
  }

  if (apiKey !== process.env.GEMINI_API_KEY) {
    return new GoogleGenAI({ apiKey: apiKey.trim() });
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: apiKey.trim() });
  }
  return cachedClient;
}

/**
 * Executes a structured JSON extraction request against `gemini-2.5-flash` and validates it with Zod.
 *
 * @description Sends inline base64 document bytes with strict `responseSchema` and parses the JSON text response.
 * @param {{ fileBytes: Buffer, mimeType: string, prompt: string, responseSchema: object, zodSchema: z.ZodTypeAny, client?: GoogleGenAI }} params - Extraction parameters.
 * @returns {Promise<object>} Zod-validated extraction object.
 * @throws {ExternalServiceError} AI_EXTRACTION_FAILED (502) on SDK failure, empty output, or schema mismatch.
 */
async function runStructuredExtraction({ fileBytes, mimeType, prompt, responseSchema, zodSchema, client }) {
  const ai = client ?? getGeminiClient();

  let rawText;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: Buffer.from(fileBytes).toString('base64'),
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.1,
      },
    });
    rawText = response?.text;
  } catch {
    throw new ExternalServiceError('Document AI extraction failed. Please retry.', 'AI_EXTRACTION_FAILED');
  }

  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new ExternalServiceError('Document AI returned an empty response.', 'AI_EXTRACTION_FAILED');
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new ExternalServiceError('Document AI returned invalid JSON.', 'AI_EXTRACTION_FAILED');
  }

  const validated = zodSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new ExternalServiceError(
      'Document AI output did not satisfy the expected extraction schema.',
      'AI_SCHEMA_MISMATCH'
    );
  }

  return validated.data;
}

/**
 * Extracts structured onboarding metadata from an Offer Letter PDF using `gemini-2.5-flash`.
 *
 * @description Parses candidate name, email, role, department, start date, base salary, and confidence score.
 * @param {Buffer} pdfBuffer - Validated PDF binary buffer.
 * @param {{ client?: GoogleGenAI }} [options={}] - Optional dependency overrides for testing.
 * @returns {Promise<{ full_name: string|null, personal_email: string|null, job_title: string|null, department_name: string|null, expected_start_date: string|null, base_salary_amount: number|null, confidence_score: number }>} Validated Offer Letter fields.
 * @throws {ExternalServiceError} Throws when Gemini fails or returns malformed output.
 */
export async function extractOfferLetter(pdfBuffer, options = {}) {
  const prompt = [
    'Extract structured new-hire onboarding data from the attached Offer Letter PDF.',
    'Return null for any field not explicitly present in the document. Do not invent values.',
    'Format expected_start_date strictly as YYYY-MM-DD and base_salary_amount as a plain number.',
    'Set confidence_score between 0.0 and 1.0 reflecting extraction clarity and completeness.',
  ].join(' ');

  return runStructuredExtraction({
    fileBytes: pdfBuffer,
    mimeType: 'application/pdf',
    prompt,
    responseSchema: OFFER_LETTER_RESPONSE_SCHEMA,
    zodSchema: offerLetterExtractionSchema,
    client: options.client,
  });
}

/**
 * Extracts structured identity fields from a candidate Government ID image or PDF using `gemini-2.5-flash`.
 *
 * @description Parses ID classification, ID number, full name, residential address, and confidence score.
 * @param {Buffer} fileBuffer - Validated JPEG, PNG, or PDF binary buffer.
 * @param {string} mimeType - Verified MIME type (`image/jpeg`, `image/png`, or `application/pdf`).
 * @param {{ client?: GoogleGenAI }} [options={}] - Optional dependency overrides for testing.
 * @returns {Promise<{ id_type: string|null, id_number: string|null, full_name: string|null, address: string|null, confidence_score: number }>} Validated Government ID fields.
 * @throws {ExternalServiceError} Throws when Gemini fails or returns malformed output.
 */
export async function extractGovernmentId(fileBuffer, mimeType, options = {}) {
  const prompt = [
    'Extract identity verification fields from the attached Government ID document.',
    `Classify id_type into one of: ${GOV_ID_TYPES.join(', ')}.`,
    'Return null for any field that is illegible or absent. Never fabricate an ID number.',
    'Set confidence_score between 0.0 and 1.0 reflecting legibility and extraction certainty.',
  ].join(' ');

  return runStructuredExtraction({
    fileBytes: fileBuffer,
    mimeType,
    prompt,
    responseSchema: GOV_ID_RESPONSE_SCHEMA,
    zodSchema: govIdExtractionSchema,
    client: options.client,
  });
}
