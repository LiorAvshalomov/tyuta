import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "אודות",
  description:
    "Tyuta הוא מרחב כתיבה עם קהילה — מקום למילים שלא נאמרות, לטיוטות, ולכל מה שבדרך.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "אודות",
    description:
      "Tyuta הוא מרחב כתיבה עם קהילה: תגובות, מדליות ודירוגים שנועדו לעודד הקשבה — והפוקוס נשאר על המילים.",
    url: "/about",
    siteName: "Tyuta",
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "אודות",
    description:
      "מרחב כתיבה עם קהילה — מקום למילים שקטות, לטיוטות, ולגבולות ברורים.",
  },
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article className="space-y-8 leading-relaxed text-right">
        <h1 className="text-3xl font-semibold">אודות Tyuta</h1>

        <p>היי, כיף שבאת.</p>

        <p>
          הקמתי את Tyuta מתוך משיכה לעולם הכתיב. או אולי יותר נכון לאנשים שיש להם
          מילים שלא נאמרות.
        </p>

        <p>
          בשנים האחרונות נדמה שהמקומות שבהם אפשר פשוט לכתוב, בלי רעש, בלי אלגוריתם שמחליט
          מי ראוי להישמע הולכים ונעלמים. יש הרבה פלטפורמות. יש מעט מרחבים.
        </p>

        <p>
          Tyuta נוצרה כמרחב כזה. מקום למילים שלא ייאמרו בקול. לטיוטות. למחשבות באמצע.
          לכל מה שבדרך.
        </p>

        <p>
          זו הטיוטה שלי. <br />
          מה שלך?
        </p>

        <h2 className="text-xl font-medium pt-6">מה זה Tyuta</h2>

        <p>Tyuta הוא מרחב כתיבה עם קהילה.</p>

        <p>
          יש בו תגובות, מדליות ודירוגים אבל הם לא המטרה. הם דרך לעודד הקשבה, לא תחרות.
          הפוקוס נשאר על המילים. לא על המספרים.
        </p>

        <p>
          כאן מותר להיות לא גמור. <br />
          לא מלוטש. <br />
          לא מושלם.
        </p>

        <h2 className="text-xl font-medium pt-6">למה הוא קיים</h2>

        <p>כי לפעמים הדבר החשוב הוא לא להגיע לחשיפה אלא להגיע להבנה.</p>

        <p>
          כי יש כוח במילים גם כשהן שקטות. כי יש ערך לגרסאות שאנחנו עוד לא בטוחים בהן.
        </p>

        <h2 className="text-xl font-medium pt-6">גבולות ובטיחות</h2>

        <p>אנחנו מאמינים בחופש ביטוי אבל לא בפגיעה.</p>

        <p>
          תוכן פוגעני, מסית, מאיים או כזה שמפר גבולות אנושיים בסיסיים יוסר. לפעמים גם
          בלי אזהרה.
        </p>

        <p>
          Tyuta הוא מקום רגיש. <br />
          והוא צריך להישאר כזה.
        </p>

        <p className="pt-8 text-lg">תודה שאתה כאן.</p>
      </article>
    </main>
  );
}
