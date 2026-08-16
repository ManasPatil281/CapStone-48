/**
 * Socratic Code Pair-Programmer Agent
 *
 * Analyzes code snippets and execution error outputs.
 * Provides Socratic pairing feedback: asks guiding questions rather than spoiling raw answers.
 */

import { getGroqChat } from "@/lib/ai/model";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const SocraticHintSchema = z.object({
  detectedIssueCategory: z.string().describe("e.g. Off-by-one, NullPointer, Infinite Loop, Type Error"),
  socraticQuestion: z.string().describe("Guiding question for the student"),
  conceptualHint: z.string().describe("Subtle hint pointing to the relevant concept"),
  severity: z.enum(["SYNTAX", "LOGIC", "PERFORMANCE", "STYLE"]),
});

export type SocraticHintResult = z.infer<typeof SocraticHintSchema>;

export async function analyzeCodeSocratically(input: {
  loTitle: string;
  code: string;
  language: string;
  errorMessage?: string;
  outputLog?: string;
}): Promise<SocraticHintResult> {
  const model = getGroqChat({ temperature: 0.35, maxTokens: 500 });
  const structuredModel = model.withStructuredOutput(SocraticHintSchema);

  const prompt = [
    new SystemMessage(
      `You are a Socratic Code Pair-Programmer Agent.
Review the student's code and execution output for "${input.loTitle}".
DO NOT provide corrected code directly.
Ask a targeted Socratic question that leads the student to find and fix the bug on their own.`
    ),
    new HumanMessage(
      `Language: ${input.language}
Code:
\`\`\`
${input.code}
\`\`\`
Error/Console Output: ${input.errorMessage || input.outputLog || "No explicit runtime error, but logical check failed"}`
    ),
  ];

  return await structuredModel.invoke(prompt);
}
