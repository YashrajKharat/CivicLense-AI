import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Label } from "./Primitives.jsx";

/**
 * A photograph often cannot answer what an officer needs to know — how long it
 * has been there, whether it blocks the road, whether anyone is at risk. Those
 * answers only exist in the head of the person standing in front of it.
 *
 * Multiple choice rather than free text, because the answers adjust the
 * severity score, and a sentence cannot be scored. Asked in the resident's own
 * language: someone reporting a hazard should not have to work in English to
 * be taken seriously.
 */
const LANGS = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
];

export default function FollowupQuestions({ categoryId, lang = "en", value, onChange }) {
  const [questions, setQuestions] = useState(null);

  // The answer language is chosen here rather than inherited from the interface
  // language. Someone may run the app in English but describe a hazard more
  // precisely in Marathi, and the answer is what an officer reads.
  const [answerLang, setAnswerLang] = useState(lang);

  useEffect(() => {
    setQuestions(null);
    api.followupQuestions(categoryId, answerLang)
      .then((r) => setQuestions(r.questions))
      .catch(() => setQuestions([]));
  }, [categoryId, answerLang]);

  if (!questions) {
    return <div className="skeleton" style={{ height: 120, marginTop: "var(--s-4)" }} />;
  }
  if (!questions.length) return null;

  const answered = questions.filter((q) => value[q.id]).length;

  return (
    <section style={{ marginTop: "var(--s-5)" }}>
      <div className="row row--between row--wrap" style={{ gap: "var(--s-3)" }}>
        <Label>
          {{ en: "A few quick questions", hi: "कुछ छोटे सवाल", mr: "काही छोटे प्रश्न" }[answerLang]}
        </Label>

        <div className="row" style={{ gap: "var(--s-2)" }}>
          <span className="label">{answered} / {questions.length}</span>
          <div className="segment">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                aria-pressed={answerLang === l.code}
                onClick={() => setAnswerLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>
        {{
          en: "The photo cannot show these. Your answers change how urgently this is treated.",
          hi: "ये बातें फोटो से पता नहीं चलतीं। आपके जवाब से तय होता है कि यह कितना ज़रूरी माना जाए।",
          mr: "या गोष्टी फोटोत दिसत नाहीत. तुमच्या उत्तरांवरून हे किती तातडीचे आहे ते ठरते.",
        }[answerLang]}
      </p>

      <div className="stack" style={{ marginTop: "var(--s-4)" }}>
        {questions.map((q) => (
          <div key={q.id} className="section" style={{ padding: "var(--s-4) 0" }}>
            <div style={{ fontWeight: 500, fontSize: "var(--t-sm)" }}>{q.prompt}</div>

            <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
              {q.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="choice"
                  aria-pressed={value[q.id]?.selected_option === o.value}
                  onClick={() =>
                    onChange({
                      ...value,
                      [q.id]: { question_id: q.id, language: answerLang, selected_option: o.value },
                    })
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="label" style={{ marginTop: "var(--s-3)" }}>
        {{
          en: "Skip any you are unsure about.",
          hi: "जिनका जवाब पक्का न हो, उन्हें छोड़ सकते हैं।",
          mr: "खात्री नसलेले प्रश्न सोडून देऊ शकता.",
        }[answerLang]}
      </p>
    </section>
  );
}
