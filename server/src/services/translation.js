import { query } from "../db/pool.js";

/**
 * Translation, or rather the decision not to do it automatically.
 *
 * This used to send every non-English description to a language model. Three
 * reasons it no longer does.
 *
 * The original text is the record. A resident describing a hazard in Marathi
 * chose those words, and an officer acting on a machine paraphrase is acting on
 * something the resident never said. The complaint is stored and shown in the
 * language it was written in.
 *
 * The follow-up questions already carry the load. They are asked and answered
 * in the resident's own language, they are multiple choice, and they map to
 * fixed values — so an officer reading a Marathi complaint still knows it has
 * been there a month and blocks the footpath, without anything being translated.
 *
 * And it was the largest single consumer of API calls in the system, for the
 * least defensible output.
 *
 * Where a translation is genuinely needed, an officer can paste the text into
 * any translator. That is a deliberate choice to make the machine step visible
 * rather than silently substituting its output for what somebody wrote.
 */

const LANGUAGE = { en: "English", hi: "Hindi", mr: "Marathi" };

/** Records what language a description is in, so the interface can label it. */
export async function noteLanguage(complaintId, lang) {
  await query(`update complaints set description_lang = $2 where id = $1`, [
    complaintId,
    LANGUAGE[lang] ? lang : "en",
  ]);
}

export const languageName = (code) => LANGUAGE[code] || "English";
