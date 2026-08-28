import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import mammoth from 'mammoth';

// Syllabus parsing plus per-task prompt guidance takes longer than before.
export const maxDuration = 300;

// NOTE: Gemini 1.5 models are fully shut down and return 404.
const MODEL_NAME = 'gemini-3.6-flash';

const TIER_RULE =
  "Must be EXACTLY one of: 'Tier 1: Strictly Prohibited', 'Tier 2: Brainstorming Permitted', " +
  "'Tier 3: Full AI Permitted', 'Tier 4: Permitted with Mandatory Disclosure'";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

type Extracted = {
  text: string | null;
  pdfBase64: string | null;
  note: string;
};

async function extractFromFile(file: File): Promise<Extracted> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value, pdfBase64: null, note: `Parsed .docx — ${value.length} characters extracted` };
  }

  if (name.endsWith('.pdf')) {
    return {
      text: null,
      pdfBase64: buffer.toString('base64'),
      note: 'PDF sent to the model natively (no lossy text extraction)',
    };
  }

  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.csv')) {
    const value = buffer.toString('utf-8');
    return { text: value, pdfBase64: null, note: `Parsed plain text — ${value.length} characters extracted` };
  }

  if (name.endsWith('.rtf')) {
    const value = buffer
      .toString('utf-8')
      .replace(/\\[a-z]+-?\d* ?/gi, ' ')
      .replace(/[{}]/g, ' ')
      .replace(/\s{3,}/g, '\n');
    return { text: value, pdfBase64: null, note: 'Parsed .rtf (approximate formatting recovery)' };
  }

  if (name.endsWith('.doc')) {
    // Legacy binary .doc: salvage readable runs. Low fidelity by nature.
    const value = buffer
      .toString('latin1')
      .replace(/[^\x20-\x7E\n\r\t]+/g, ' ')
      .replace(/\s{3,}/g, '\n');
    return {
      text: value,
      pdfBase64: null,
      note: 'Legacy .doc salvaged — fidelity is limited; .docx or .pdf gives much better results',
    };
  }

  const value = buffer.toString('utf-8');
  return { text: value, pdfBase64: null, note: 'Unrecognized extension — read as plain text' };
}

const responseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    course: {
      type: SchemaType.OBJECT,
      properties: {
        code: { type: SchemaType.STRING, description: 'Course code exactly as it appears in the syllabus' },
        title: { type: SchemaType.STRING, description: 'Full course title from the syllabus' },
        instructor: { type: SchemaType.STRING, description: 'Instructor name if present, otherwise empty string' },
        term: { type: SchemaType.STRING, description: 'Term/semester if present, otherwise empty string' },
        department: {
          type: SchemaType.STRING,
          description:
            'The department, school, or college that offers this course, taken from the syllabus itself. Do not guess from the course code alone.',
        },
      },
      required: ['code', 'title', 'instructor', 'term', 'department'],
    },
    course_summary: {
      type: SchemaType.STRING,
      description: 'Two or three sentences in plain language describing what this course covers, drawn from the syllabus itself.',
    },
    policy_statement: {
      type: SchemaType.STRING,
      description:
        'A tailored institutional AI policy paragraph for THIS course. Reference the actual subject matter. Cover FERPA, the prohibition on uploading student PII or Level 2 confidential data to public AI platforms, and academic integrity. 120-180 words, written for students.',
    },
    goals_statement: {
      type: SchemaType.STRING,
      description:
        'A paragraph explaining, in the context of this specific course, how the policy priorities the faculty member selected shaped the authorizations below. If no priorities were selected, explain instead what pedagogical reasoning drove the tier choices. 90-140 words.',
    },
    integrity_guidance: {
      type: SchemaType.STRING,
      description:
        'A short student-facing section on staying within policy: how to tell whether a use is permitted, what to do when unsure, and what happens if a submission cannot be explained by its author. Concrete and non-punitive in tone. 90-140 words.',
    },
    disclosure_statement: {
      type: SchemaType.STRING,
      description:
        'A paragraph telling students exactly how to disclose and cite AI use in this course, including prompt logging where required. 80-120 words.',
    },
    equity_statement: {
      type: SchemaType.STRING,
      description:
        'A paragraph on equitable access: what students should do if they lack paid AI tool access, and what alternative pathways exist so no student is disadvantaged. 80-120 words.',
    },
    tier_definitions: {
      type: SchemaType.ARRAY,
      description: 'One entry for each of the four tiers, defined in the context of this specific course.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          tier: { type: SchemaType.STRING, description: TIER_RULE },
          definition: { type: SchemaType.STRING, description: 'What this tier means concretely in this course.' },
        },
        required: ['tier', 'definition'],
      },
    },
    modules: {
      type: SchemaType.ARRAY,
      description:
        'Every week, module, or unit found in the syllabus schedule, in order. If the syllabus has no explicit weekly structure, group assignments into logical modules.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          label: { type: SchemaType.STRING, description: "Short label, e.g. 'Week 3' or 'Module 2'" },
          title: { type: SchemaType.STRING, description: 'Topic or theme of this module from the syllabus' },
          recommended_tier: { type: SchemaType.STRING, description: TIER_RULE },
          rationale: { type: SchemaType.STRING, description: 'One sentence: why this tier fits this module.' },
          tasks: {
            type: SchemaType.ARRAY,
            description: 'Assignments, readings, projects, or deliverables in this module.',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING },
                recommended_tier: { type: SchemaType.STRING, description: TIER_RULE },
                rationale: { type: SchemaType.STRING, description: 'One sentence tied to the learning objective.' },
                acceptable_use: {
                  type: SchemaType.STRING,
                  description: 'One or two sentences telling students exactly what IS and IS NOT permitted here.',
                },
                suggested_prompts: {
                  type: SchemaType.ARRAY,
                  description:
                    'Exactly 2 example prompts a student could paste into an AI tool and remain fully within this task\'s tier. Reference the actual subject matter of this task. If the tier is Tier 1, return 2 entries describing permitted non-AI study approaches instead, each phrased as guidance rather than a prompt.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      prompt: { type: SchemaType.STRING, description: 'The prompt text itself, under 30 words.' },
                      purpose: { type: SchemaType.STRING, description: 'Under 15 words: what this helps the student do.' },
                    },
                    required: ['prompt', 'purpose'],
                  },
                },
                at_risk_uses: {
                  type: SchemaType.ARRAY,
                  description:
                    'Exactly 2 uses of AI on this task that would risk an academic integrity violation. CRITICAL: describe each as a BEHAVIOUR, never as a copy-pasteable prompt string, because this document is given to students.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      pattern: {
                        type: SchemaType.STRING,
                        description:
                          "Behavioural description, under 25 words, e.g. 'Having the tool write your comparison of the two frameworks and submitting it as your analysis.'",
                      },
                      why_at_risk: { type: SchemaType.STRING, description: 'Under 20 words: which learning objective this defeats.' },
                    },
                    required: ['pattern', 'why_at_risk'],
                  },
                },
              },
              required: ['title', 'recommended_tier', 'rationale', 'acceptable_use', 'suggested_prompts', 'at_risk_uses'],
            },
          },
        },
        required: ['label', 'title', 'recommended_tier', 'rationale', 'tasks'],
      },
    },
  },
  required: [
    'course',
    'course_summary',
    'policy_statement',
    'goals_statement',
    'integrity_guidance',
    'disclosure_statement',
    'equity_statement',
    'tier_definitions',
    'modules',
  ],
};

function buildFallback(course: string, department: string, reason: string) {
  return {
    source: 'fallback' as const,
    error: reason,
    extracted_note: 'No document was parsed — showing demonstration data.',
    extracted_preview: '',
    data: {
      course: {
        code: course || 'Demo Course',
        title: 'Demonstration Course',
        instructor: '',
        term: '',
        department: department || '',
      },
      course_summary:
        'This is placeholder demonstration content. The live model call did not succeed, so the structure below is illustrative rather than derived from an uploaded syllabus.',
      policy_statement:
        'This course follows the SUNY Albany AI governance framework. Level 2 confidential data, student PII, and unpublished research must never be uploaded to public AI platforms. Students must follow the task-level authorizations listed below.',
      goals_statement:
        'Placeholder text. When the live model runs, this section explains how the policy priorities selected by the instructor shaped each authorization below.',
      integrity_guidance:
        'Placeholder text. When the live model runs, this section tells students how to check whether a use is permitted and what to do when they are unsure.',
      disclosure_statement:
        'Where AI use is permitted, students must disclose it in a short note at the end of the submission describing which tool was used and for what purpose.',
      equity_statement:
        'No assignment in this course requires a paid AI subscription. Students without access to paid tools should contact the instructor for an equivalent pathway.',
      tier_definitions: [
        { tier: 'Tier 1: Strictly Prohibited', definition: 'No generative AI use of any kind.' },
        { tier: 'Tier 2: Brainstorming Permitted', definition: 'AI may be used to explore ideas and outline, but not to draft submitted text.' },
        { tier: 'Tier 3: Full AI Permitted', definition: 'AI may be used throughout, including drafting.' },
        { tier: 'Tier 4: Permitted with Mandatory Disclosure', definition: 'AI use is allowed but must be documented and cited.' },
      ],
      modules: [
        {
          label: 'Module 1',
          title: 'Foundations',
          recommended_tier: 'Tier 2: Brainstorming Permitted',
          rationale: 'Early conceptual work benefits from exploration.',
          tasks: [
            {
              title: 'Weekly Discussion Board',
              recommended_tier: 'Tier 2: Brainstorming Permitted',
              rationale: 'Participation rewards original reasoning.',
              acceptable_use: 'You may use AI to test your thinking. Posted text must be your own.',
              suggested_prompts: [
                { prompt: 'What are the strongest counterarguments to the position I have outlined below?', purpose: 'Pressure-tests your own reasoning' },
                { prompt: 'Explain this week\'s core concept in plain language, then quiz me on it.', purpose: 'Checks comprehension before you post' },
              ],
              at_risk_uses: [
                { pattern: 'Having the tool write your discussion post and submitting it unchanged.', why_at_risk: 'Participation measures your own engagement with the reading.' },
                { pattern: 'Asking the tool to summarize a reading you did not open.', why_at_risk: 'The objective is direct engagement with the source.' },
              ],
            },
          ],
        },
        {
          label: 'Module 2',
          title: 'Assessment',
          recommended_tier: 'Tier 1: Strictly Prohibited',
          rationale: 'Assessment must measure individual mastery.',
          tasks: [
            {
              title: 'Midterm Research Paper',
              recommended_tier: 'Tier 1: Strictly Prohibited',
              rationale: 'The paper assesses independent analysis.',
              acceptable_use: 'No AI assistance permitted at any stage.',
              suggested_prompts: [
                { prompt: 'Build your outline from your own reading notes rather than any AI tool.', purpose: 'Keeps the analysis yours' },
                { prompt: 'Bring a draft to office hours for feedback instead of an AI tool.', purpose: 'Permitted support pathway' },
              ],
              at_risk_uses: [
                { pattern: 'Using a tool to draft, outline, or rewrite any part of the paper.', why_at_risk: 'The paper assesses your independent analysis.' },
                { pattern: 'Running your finished draft through a tool to rewrite the prose.', why_at_risk: 'Submitted writing must be your own composition.' },
              ],
            },
          ],
        },
      ],
    },
  };
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const course = ((formData.get('course') as string) || '').trim();
  const department = ((formData.get('department') as string) || '').trim();
  const wishList = ((formData.get('wishList') as string) || '').trim();
  const goals = ((formData.get('goals') as string) || '').trim();
  const goalDirectives = ((formData.get('goalDirectives') as string) || '').trim();
  const file = formData.get('file') as File | null;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(buildFallback(course, department, 'GEMINI_API_KEY is not set in this environment.'));
  }

  let extracted: Extracted | null = null;
  try {
    if (file && file.size > 0) {
      extracted = await extractFromFile(file);
    }
  } catch (err) {
    console.error('Extraction error:', err);
    return NextResponse.json(
      buildFallback(course, department, `Could not read the uploaded file: ${String(err)}`)
    );
  }

  if (!extracted) {
    return NextResponse.json(
      buildFallback(course, department, 'No syllabus file was uploaded, so there was nothing to analyze.')
    );
  }

  const hints: string[] = [];
  if (course) hints.push(`Course code hint: ${course}`);
  if (department) hints.push(`Department hint: ${department}`);
  if (wishList) hints.push(`Faculty AI wish-list (free text): ${wishList}`);

  const goalsBlock = goalDirectives
    ? `FACULTY-SELECTED POLICY PRIORITIES\nThe faculty member selected the following priorities. These are binding directives for this document. Apply each one to tier selection, to every rationale, to the acceptable-use language, and to the suggested prompts.\n${goalDirectives}\n`
    : 'The faculty member selected no specific priorities. Apply sound pedagogical defaults.\n';

  const prompt = `You are an AI governance analyst for the University at Albany (SUNY), supporting the AI & Society College.

Your job: read the attached course syllabus and produce an assignment-level AI governance matrix for it.

${hints.length ? `FACULTY-PROVIDED HINTS\n${hints.join('\n')}\n` : 'The faculty member provided no hints. Take everything from the syllabus.\n'}
${goalsBlock}
RULES
1. SOURCE OF TRUTH: the syllabus document itself. Take the course code, course title, instructor, term, and department/school/college from the syllabus wherever it states them. The hints above are fallbacks ONLY for fields the syllabus does not state. If a hint contradicts the syllabus, the syllabus wins.
2. For 'department', report the academic unit that actually offers the course as named in the syllabus (school, college, or department). Never substitute the faculty member's own unit.
3. Extract the ACTUAL modules, weeks, and assignments from the syllabus. Do not invent generic ones. Use the syllabus's own labels and wording for titles.
4. Assign every module and every task a tier. ${TIER_RULE}.
5. Base tier choices on the learning objective, then adjust to honor the selected priorities above. Assessments of individual mastery lean restrictive. Ideation, formatting, and technical scaffolding lean permissive. Honor the faculty wish-list wherever it does not conflict with FERPA or academic integrity.
6. A module's tier should be the most restrictive tier among its tasks unless the syllabus clearly indicates otherwise.
7. In 'goals_statement', name the selected priorities explicitly and tie them to concrete decisions you made in this document, referencing actual assignments by name.
8. SUGGESTED PROMPTS: for each task, write 2 prompts that are specific to that task's actual subject matter and readings. Generic prompts that would work in any course are not acceptable. Every prompt must stay strictly inside the tier assigned to that task.
9. AT-RISK USES: describe behaviours, never copy-pasteable prompt strings. This document is distributed to students, so it must not read as instructions for circumventing the policy. Write 'Having the tool draft your comparison of the two frameworks', not a quoted prompt.
10. Write all prose for a student audience: direct, concrete, no bureaucratic filler.
11. Never include student names, PII, or any confidential content from the document in your output.

${extracted.text ? `SYLLABUS TEXT:\n"""\n${extracted.text.slice(0, 120000)}\n"""` : 'The syllabus is attached as a PDF.'}`;

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const parts: Array<string | { inlineData: { mimeType: string; data: string } }> = [prompt];
    if (extracted.pdfBase64) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: extracted.pdfBase64 } });
    }

    const result = await model.generateContent(parts);
    const parsed = JSON.parse(result.response.text());

    return NextResponse.json({
      source: 'live',
      error: null,
      extracted_note: extracted.note,
      extracted_preview: (extracted.text || '').slice(0, 4000),
      goals_selected: goals,
      data: parsed,
    });
  } catch (error) {
    console.error('Model generation error:', error);
    return NextResponse.json(buildFallback(course, department, `Model call failed: ${String(error)}`));
  }
}