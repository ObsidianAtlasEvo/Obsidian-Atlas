/**
 * Structural repair helper — replaces the ollamaService version.
 * Routes inference through the backend instead of Ollama directly.
 */
import { backendComplete } from './backendInference';

export async function applyStructuralRepair(payload: {
  id: string;
  title: string;
  description: string;
  classTier: number;
}): Promise<string> {
  const prompt = `You are the Obsidian Atlas Source-Code Architect. You are receiving a Class ${payload.classTier} Structural Repair authorization.
Your task is to output the corrected TypeScript/React code blocks required to eliminate the specified architectural gap.

REPAIR_DESCRIPTION:
Title: ${payload.title}
Description: ${payload.description}

Before returning the code, perform an Internal Integrity Check: verify that the new code does not break existing Privacy or User Evolution boundaries.
Return ONLY the code changes required to actually solve the issue described.`;

  try {
    return await backendComplete(prompt);
  } catch (error) {
    console.error('Error applying structural repair:', error);
    throw error;
  }
}
