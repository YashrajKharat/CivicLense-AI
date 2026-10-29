import { createContext, useContext, useState, useEffect } from "react";

/**
 * UI strings are bundled; complaint text is translated server-side by the model.
 * Keeping these separate means the interface never waits on a network call to
 * render, and a citizen's own words are never machine-rewritten in their view.
 */
const STRINGS = {
  en: {
    "nav.home": "Home", "nav.report": "Report", "nav.reports": "My reports", "nav.impact": "Impact",
    "home.greeting": "Good evening", "home.cta": "Report an issue",
    "home.lede": "Photograph a problem on your street. We identify it, find the ward and department that own that location, and tell you who is accountable.",
    "home.nearby": "Open near you", "home.week": "Your street this week",
    "report.what": "What is wrong?",
    "report.hint": "One clear photo of the problem. Include enough of the surroundings that an officer can find the exact spot.",
    "report.take": "Take or choose a photo", "report.analysing": "Analysing",
    "report.analysingNote": "Classifying the issue, checking authenticity, matching nearby reports",
    "report.severityWorking": "How severity was scored", "report.authenticity": "Image authenticity",
    "report.authNote": "An assisted assessment, not proof. Flagged images go to a human reviewer before any action is taken, and are never rejected automatically.",
    "report.findResponsible": "Find who is responsible",
    "report.ownership": "Someone already owns this street",
    "report.review": "Review", "report.detail": "Add detail (optional)",
    "report.speak": "Hold to speak", "report.listening": "Listening",
    "report.submit": "Submit report", "report.filing": "Filing",
    "report.closeNote": "You will be asked to confirm the fix before this closes.",
    "reports.title": "My reports", "reports.empty": "Nothing filed yet",
    "reports.confirm": "The officer says this is fixed",
    "reports.confirmNote": "Only you can close this. Saying it is still there reopens the report and escalates it to the department head.",
    "reports.fixed": "Fixed", "reports.notFixed": "Still there",
    "impact.title": "Your civic record", "impact.points": "Points",
    "impact.note": "Points come from verified contributions, not volume. Duplicate and unverified reports earn nothing.",
    "common.loading": "Loading", "common.retry": "Try again", "common.signOut": "Sign out",
  },
  hi: {
    "nav.home": "होम", "nav.report": "शिकायत", "nav.reports": "मेरी शिकायतें", "nav.impact": "योगदान",
    "home.greeting": "नमस्ते", "home.cta": "समस्या दर्ज करें",
    "home.lede": "अपनी गली की समस्या की फोटो लें। हम उसे पहचानते हैं, वार्ड और विभाग खोजते हैं, और बताते हैं कि ज़िम्मेदार कौन है।",
    "home.nearby": "आपके पास खुली शिकायतें", "home.week": "इस हफ़्ते आपकी गली",
    "report.what": "क्या समस्या है?",
    "report.hint": "समस्या की एक साफ़ फोटो लें। आसपास का इतना हिस्सा रखें कि अधिकारी सही जगह पहुँच सके।",
    "report.take": "फोटो लें या चुनें", "report.analysing": "जाँच हो रही है",
    "report.analysingNote": "समस्या पहचानी जा रही है, प्रामाणिकता जाँची जा रही है",
    "report.severityWorking": "गंभीरता कैसे तय हुई", "report.authenticity": "फोटो की प्रामाणिकता",
    "report.authNote": "यह सहायक आकलन है, प्रमाण नहीं। चिह्नित फोटो पहले किसी व्यक्ति द्वारा देखी जाती है।",
    "report.findResponsible": "ज़िम्मेदार कौन है, देखें",
    "report.ownership": "इस सड़क की ज़िम्मेदारी पहले से तय है",
    "report.review": "समीक्षा", "report.detail": "और जानकारी (वैकल्पिक)",
    "report.speak": "बोलने के लिए दबाए रखें", "report.listening": "सुन रहे हैं",
    "report.submit": "शिकायत भेजें", "report.filing": "भेजी जा रही है",
    "report.closeNote": "बंद करने से पहले आपसे पुष्टि माँगी जाएगी।",
    "reports.title": "मेरी शिकायतें", "reports.empty": "अभी कोई शिकायत नहीं",
    "reports.confirm": "अधिकारी ने इसे ठीक बताया है",
    "reports.confirmNote": "इसे केवल आप बंद कर सकते हैं। 'अभी भी है' कहने पर शिकायत फिर खुल जाएगी।",
    "reports.fixed": "ठीक हो गया", "reports.notFixed": "अभी भी है",
    "impact.title": "आपका नागरिक रिकॉर्ड", "impact.points": "अंक",
    "impact.note": "अंक सत्यापित योगदान से मिलते हैं, संख्या से नहीं।",
    "common.loading": "लोड हो रहा है", "common.retry": "फिर कोशिश करें", "common.signOut": "साइन आउट",
  },
  mr: {
    "nav.home": "मुख्यपृष्ठ", "nav.report": "तक्रार", "nav.reports": "माझ्या तक्रारी", "nav.impact": "योगदान",
    "home.greeting": "नमस्कार", "home.cta": "समस्या नोंदवा",
    "home.lede": "तुमच्या रस्त्यावरील समस्येचा फोटो घ्या. आम्ही ती ओळखतो, प्रभाग व विभाग शोधतो आणि जबाबदार कोण ते सांगतो.",
    "home.nearby": "जवळच्या खुल्या तक्रारी", "home.week": "या आठवड्यात तुमचा रस्ता",
    "report.what": "काय अडचण आहे?",
    "report.hint": "समस्येचा एक स्पष्ट फोटो घ्या. अधिकाऱ्याला जागा सापडेल इतका परिसर ठेवा.",
    "report.take": "फोटो काढा किंवा निवडा", "report.analysing": "तपासणी सुरू आहे",
    "report.analysingNote": "समस्या ओळखली जात आहे, सत्यता तपासली जात आहे",
    "report.severityWorking": "तीव्रता कशी ठरली", "report.authenticity": "फोटोची सत्यता",
    "report.authNote": "हे सहाय्यक मूल्यांकन आहे, पुरावा नाही. चिन्हांकित फोटो प्रथम व्यक्तीकडून तपासले जातात.",
    "report.findResponsible": "जबाबदार कोण ते पहा",
    "report.ownership": "या रस्त्याची जबाबदारी आधीच ठरलेली आहे",
    "report.review": "आढावा", "report.detail": "अधिक माहिती (ऐच्छिक)",
    "report.speak": "बोलण्यासाठी दाबून ठेवा", "report.listening": "ऐकत आहे",
    "report.submit": "तक्रार पाठवा", "report.filing": "पाठवत आहे",
    "report.closeNote": "बंद करण्यापूर्वी तुमची खात्री विचारली जाईल.",
    "reports.title": "माझ्या तक्रारी", "reports.empty": "अद्याप काहीही नोंदवलेले नाही",
    "reports.confirm": "अधिकाऱ्याने हे दुरुस्त झाल्याचे नोंदवले आहे",
    "reports.confirmNote": "फक्त तुम्हीच हे बंद करू शकता. 'अजूनही आहे' म्हटल्यास तक्रार पुन्हा उघडेल.",
    "reports.fixed": "दुरुस्त झाले", "reports.notFixed": "अजूनही आहे",
    "impact.title": "तुमची नागरिक नोंद", "impact.points": "गुण",
    "impact.note": "गुण पडताळलेल्या योगदानातून मिळतात, संख्येने नाही.",
    "common.loading": "लोड होत आहे", "common.retry": "पुन्हा प्रयत्न करा", "common.signOut": "साइन आउट",
  },
};

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
];

const I18nContext = createContext(null);

export function I18nProvider({ children, initial = "en" }) {
  const [lang, setLang] = useState(() => localStorage.getItem("cp.lang") || initial);

  useEffect(() => {
    localStorage.setItem("cp.lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useT = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside I18nProvider");
  return ctx;
};
