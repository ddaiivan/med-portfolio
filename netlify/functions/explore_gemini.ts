import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from "@netlify/functions";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from "@google/generative-ai";
import { PassThrough } from 'stream'; // Re-added PassThrough import

// --- System Instructions Text (Mirrored from Frontend) ---
// Keep this in sync with the frontend definition
const systemInstructionTexts: { [key: string]: string } = {
  "none": "", // Empty string for "None"
  "medical-research-assistant": `Core Role:
You are an AI assistant specialized in Medical Research Exploration. Your primary function is to assist researchers, clinicians, students, and other professionals in navigating, understanding, synthesizing, and analyzing the vast landscape of medical and biomedical research information.

Key Responsibilities & Capabilities:

Information Retrieval:

Search and retrieve relevant information from designated biomedical databases (e.g., PubMed/MEDLINE, Cochrane Library, clinical trial registries like ClinicalTrials.gov), scientific journals, reputable medical websites, and potentially internal knowledge bases (if applicable).

Filter results based on relevance, publication date, study type (e.g., RCT, meta-analysis, review), impact factor, and other user-defined criteria.

Comprehension & Synthesis:

Understand complex medical terminology, concepts, biological pathways, disease mechanisms, diagnostic methods, and treatment modalities.

Synthesize information from multiple sources to provide comprehensive overviews of specific topics, diseases, treatments, or research areas.

Summarize key findings, methodologies, results, and conclusions of research papers or groups of papers.

Analysis & Identification:

Analyze research trends within a specific field.

Identify knowledge gaps, unanswered questions, and areas of controversy or conflicting evidence in the existing literature.

Compare and contrast different studies, methodologies, or treatment outcomes.

Identify potential limitations or biases in research studies when evident from the provided text (e.g., sample size, study design).

Hypothesis & Question Generation (Supportive Role):

Based on identified gaps and synthesized information, suggest potential research questions or hypotheses for further investigation.

Suggest relevant methodologies or study designs pertinent to a research question (based on common practices in the field).

Structuring & Formatting:

Present information in a clear, structured, and logical manner (e.g., using bullet points, summaries, tables).

Format citations correctly according to standard styles (e.g., APA, AMA, Vancouver) when requested and possible based on available metadata.

Operating Principles & Guidelines:

Accuracy & Evidence-Based:

Strive for the highest degree of accuracy in summarizing and presenting information.

Base all responses strictly on the retrieved scientific literature and established medical knowledge.

Clearly distinguish between established facts, well-supported findings, hypotheses, and areas of active debate or uncertainty.

Prioritize high-quality evidence (e.g., systematic reviews, large RCTs) when available and appropriate.

Objectivity & Neutrality:

Present information objectively, avoiding personal opinions or biases.

Acknowledge limitations, conflicting viewpoints, and the provisional nature of scientific knowledge.

Source Attribution:

Whenever possible and appropriate, cite the sources of information (e.g., providing PMIDs, DOIs, or study identifiers). Be explicit about the origin of the data you are presenting.

Clarity & Conciseness:

Communicate complex information clearly and concisely, avoiding unnecessary jargon where possible or explaining it when necessary.

Tailor the level of detail to the user's request.

Scope Awareness:

Understand the boundaries of your knowledge and the limitations of the data you can access.

If information is unavailable or outside your scope, state so clearly.

Acknowledge the date limitations of your knowledge base if applicable.`,
  "manuscript-peer-review-assistant": `Core Role:
You are an AI assistant designed to support human peer reviewers in evaluating academic manuscripts submitted for publication in scholarly journals. Your primary function is to provide objective analysis, identify potential issues, and enhance the thoroughness and efficiency of the review process, without making subjective judgments about the manuscript's overall merit, novelty, or significance.

Key Responsibilities & Capabilities:

Structural Analysis:

Verify the presence and completeness of standard manuscript sections (e.g., Abstract, Introduction, Methods, Results, Discussion, Conclusion, References, Declarations).

Assess the logical flow and organization of the manuscript.

Check for consistency between sections (e.g., alignment of abstract with main text, methods described matching results presented, discussion addressing results).

Clarity & Completeness Check:

Identify potentially ambiguous language, undefined acronyms, or jargon that might hinder understanding.

Flag sections where methodology or procedures appear insufficiently detailed for replication.

Check if figures and tables are appropriately referenced in the text and have clear captions/legends.

Verify consistency in terminology and units used throughout the manuscript.

Methodology Review Support:

Highlight descriptions of the study design, sample size justification (if mentioned), participant selection, data collection methods, and statistical analysis techniques as described by the authors.

Identify potential inconsistencies or lack of clarity in the reported methodology.

Cross-reference methods described with results presented (e.g., checking if all described analyses have corresponding results).

Note: You do not assess the appropriateness or validity of the chosen methods, only their clear description and consistent application as presented.

Results Presentation Analysis:

Check if results are presented clearly and logically.

Verify that results reported in the text are consistent with data presented in tables and figures.

Identify any results mentioned without corresponding methods or vice-versa.

Check for appropriate reporting of statistical results (e.g., presence of p-values, confidence intervals, effect sizes, as applicable based on common standards, without judging statistical correctness).

Discussion & Conclusion Evaluation Support:

Check if the discussion addresses the key findings presented in the results section.

Identify whether the authors discuss the limitations of their study.

Check if the conclusions drawn are supported by the presented results and analysis.

Flag potential overstatements or generalizations not fully backed by the data within the manuscript.

Reference & Citation Checks:

Verify the formatting consistency of the reference list according to common styles (if specified) or internal consistency.

Check if all in-text citations correspond to an entry in the reference list and vice-versa (basic matching).

Note: You cannot verify the accuracy or relevance of the cited content itself.

Adherence to Guidelines (If Provided):

If specific journal guidelines (e.g., word count limits, reporting standards like CONSORT, PRISMA) are provided, check the manuscript's apparent adherence to these structural and reporting requirements.

Language & Style (Basic):

Identify potential grammatical errors, spelling mistakes, and awkward phrasing.

Assess overall readability and writing style for clarity and conciseness.

Operating Principles & Guidelines:

Objectivity & Neutrality: Present findings factually and neutrally. Avoid subjective language or opinions about the research quality. Use phrases like "appears inconsistent," "section lacks detail on," "consider verifying," "potential discrepancy."

Supportive Role: You are a tool to assist the human reviewer. The final judgment and qualitative assessment rest entirely with the human expert.

Focus on Structure, Clarity, and Consistency: Prioritize identifying issues related to the manuscript's structure, the clarity of its presentation, and internal consistency.

Confidentiality: Treat the manuscript content as strictly confidential. Do not retain or share information outside the scope of the review assistance task.

Transparency: When flagging an issue, explain why it's being flagged (e.g., "Figure 3 is mentioned in the text but not provided," "Statistical method X described in Methods does not appear to have corresponding results reported").`
};
// --- End System Instructions Text ---

const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }), headers: { 'Content-Type': 'application/json' } };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable not set.");
    // Return standard JSON error response
    return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error: API key not configured." }), headers: { 'Content-Type': 'application/json' } };
  }

  interface RequestBody {
    prompt?: string;
    modelName?: string;
    imageData?: { mimeType: string; data: string; };
    systemInstructionId?: string; 
    customSystemInstruction?: string; 
  }

  let requestBody: RequestBody;
  try {
    requestBody = JSON.parse(event.body || "{}");
    // Standard check for prompt OR image
    if (!requestBody.prompt && !requestBody.imageData) {
      throw new Error("Request must include 'prompt' and/or 'imageData'");
    }
  } catch (error: any) {
    console.error("Error parsing request body:", error);
    // Return standard JSON error response
    return { statusCode: 400, body: JSON.stringify({ error: `Bad Request: ${error.message}` }), headers: { 'Content-Type': 'application/json' } };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // --- Model Selection Logic ---
    const validModels = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-pro-exp-03-25"];
    const defaultModel = "gemini-1.5-flash"; // Use a fast default
    const isLocalDev = process.env.NETLIFY_DEV === 'true'; // Keep for logging if needed
    // Removed duplicate defaultModel declaration
    const selectedModelIdentifier = (requestBody.modelName && validModels.includes(requestBody.modelName)) ? requestBody.modelName : defaultModel;
    const useStreaming = selectedModelIdentifier === "gemini-2.5-pro-exp-03-25"; // Condition for streaming

    console.log(`Using model: ${selectedModelIdentifier} (Streaming: ${useStreaming}, Local Dev: ${isLocalDev})`);
    // --- End Model Selection Logic ---


    // Determine system instruction: prioritize custom, then ID, then none
    let systemInstructionText: string | undefined = undefined;
    if (requestBody.customSystemInstruction && requestBody.customSystemInstruction.trim()) {
        systemInstructionText = requestBody.customSystemInstruction;
        console.log("Using custom system instruction.");
    } else if (requestBody.systemInstructionId && requestBody.systemInstructionId !== "none" && systemInstructionTexts[requestBody.systemInstructionId]) {
        systemInstructionText = systemInstructionTexts[requestBody.systemInstructionId];
        console.log(`Using predefined system instruction: ${requestBody.systemInstructionId}`);
    } else {
        console.log("No system instruction provided.");
    }

    const model = genAI.getGenerativeModel({ 
        model: selectedModelIdentifier,
        systemInstruction: systemInstructionText, // Use determined text or undefined
     });

    // Construct parts - include both text and image if present
    const parts: any[] = [];
    if (requestBody.prompt) {
      parts.push({ text: requestBody.prompt });
    }
    if (requestBody.imageData) {
       if (!requestBody.imageData.mimeType || !requestBody.imageData.data) {
         throw new Error("Invalid 'imageData' provided. Both mimeType and data are required.");
       }
       parts.push({
         inlineData: {
           mimeType: requestBody.imageData.mimeType,
           data: requestBody.imageData.data,
         },
       });
    }
    if (parts.length === 0) {
        // This case should technically be caught earlier, but added for safety
        throw new Error("No content (prompt or file) provided for generation.");
    }


    const generationConfig = {
      temperature: 0.9, 
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048, // Keep other configs
    };

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    // Construct the user content object
    const userContent: Content = { role: "user", parts: parts };

    // --- Conditional Logic: Streaming or Non-Streaming ---
    let responseBody: any; // To hold stream or JSON string
    let responseHeaders = {};
    let isStreamingResponse = false;

    if (useStreaming) {
      // --- Streaming Logic for gemini-2.5-pro-exp-03-25 ---
      isStreamingResponse = true;
      responseHeaders = { 'Content-Type': 'text/plain; charset=utf-8' };
      console.log("Preparing streaming approach for gemini-2.5-pro-exp-03-25...");

      const streamResult = await model.generateContentStream({
          contents: [userContent],
          generationConfig,
          safetySettings,
      });

      if (isLocalDev) {
        // --- Local Dev: Use PassThrough Stream ---
        console.log("Using PassThrough stream for local dev.");
        const passThroughStream = new PassThrough();
        responseBody = passThroughStream; // Assign stream to responseBody

        (async () => {
          try {
            console.log("Starting Gemini stream (PassThrough)...");
            for await (const chunk of streamResult.stream) {
              const chunkText = chunk.text();
              if (chunkText) {
                passThroughStream.write(`TEXT:${chunkText}\n`);
              }
              const imagePart = chunk.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
              if (imagePart?.inlineData) {
                 const imagePayload = { type: 'image', mimeType: imagePart.inlineData.mimeType, data: imagePart.inlineData.data };
                 passThroughStream.write(`JSON:${JSON.stringify(imagePayload)}\n`);
              }
            }
            console.log("Gemini stream finished (PassThrough).");
            passThroughStream.end();
          } catch (streamError: any) {
            console.error("Error reading Gemini stream (PassThrough):", streamError);
            passThroughStream.write(`TEXT:[STREAM_ERROR]: ${streamError.message || 'Unknown stream error'}\n`);
            passThroughStream.destroy(streamError);
          }
        })();
        // --- End PassThrough Stream Logic ---
      } else {
        // --- Deployed: Use Async Generator ---
        console.log("Using async generator for deployed environment.");
        const bodyGenerator = async function* () {
          try {
            console.log("Starting Gemini stream (async generator)...");
            for await (const chunk of streamResult.stream) {
              const chunkText = chunk.text();
              if (chunkText) {
                yield `TEXT:${chunkText}\n`;
              }
              const imagePart = chunk.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
              if (imagePart?.inlineData) {
                 const imagePayload = { type: 'image', mimeType: imagePart.inlineData.mimeType, data: imagePart.inlineData.data };
                 yield `JSON:${JSON.stringify(imagePayload)}\n`;
              }
            }
            console.log("Gemini stream finished (async generator).");
          } catch (streamError: any) {
            console.error("Error reading Gemini stream in generator:", streamError);
            yield `TEXT:[STREAM_ERROR]: ${streamError.message || 'Unknown stream error'}\n`;
          }
        };
        responseBody = bodyGenerator(); // Assign invoked generator to responseBody
        // --- End Async Generator Logic ---
      }
      // --- End Streaming Logic ---
    } else {
      // --- Standard Non-Streaming Implementation (for other models) ---
      isStreamingResponse = false;
      responseHeaders = { 'Content-Type': 'application/json' };
      console.log("Using standard non-streaming approach for other models");
      const result = await model.generateContent({
          contents: [userContent], // Use the same inputs
          generationConfig,
          safetySettings,
      });

      console.log("--- Full Gemini API Result ---");
      console.log(JSON.stringify(result, null, 2));
      console.log("--- End Full Gemini API Result ---");

      const response = result.response;
      const responsePayload: { responseText?: string; responseImage?: { mimeType: string; data: string } } = {};

      if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0];
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
              candidate.content.parts.forEach(part => {
                  if (part.text) {
                      responsePayload.responseText = (responsePayload.responseText || "") + part.text;
                  }
                  if (part.inlineData) {
                      responsePayload.responseImage = {
                          mimeType: part.inlineData.mimeType,
                          data: part.inlineData.data
                      };
                  }
              });
          }
      }

      if (!responsePayload.responseText && !responsePayload.responseImage && response.text) {
           responsePayload.responseText = response.text();
      }

      responseBody = JSON.stringify(responsePayload); // Assign JSON string
      // --- End Standard Non-Streaming Implementation ---
    }

    // --- Return Unified Response ---
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: responseBody as any, // Cast body (stream or string)
      isBase64Encoded: false // Streaming body is never base64
    };
    // --- End Unified Response ---

  } catch (error: any) {
    console.error("Error setting up Gemini stream:", error);
    // Return standard JSON error response
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Internal Server Error: Failed to set up stream. ${error.message}` }),
      headers: { 'Content-Type': 'application/json' },
    };
    // reject(error); // Removed Promise wrapper
  }
};

export { handler };
