import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "הצהרת נגישות",
  description:
    "הצהרת הנגישות של טיוטה: מחויבות לשימוש נגיש ושוויוני, דרך לדיווח על בעיות נגישות ופרטי יצירת קשר.",
  alternates: {
    canonical: "/accessibility",
  },
  openGraph: {
    title: "הצהרת נגישות | Tyuta",
    description: "מידע על נגישות האתר, התאמות, מגבלות ידועות ודרך לפנות בנושא נגישות.",
    url: "/accessibility",
    siteName: "Tyuta",
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "הצהרת נגישות | Tyuta",
    description: "דרך לפנות בנושא נגישות ושימוש שוויוני באתר טיוטה.",
  },
};

const LAST_UPDATED_HE = "03.05.2026";

export default function AccessibilityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article className="space-y-8 leading-relaxed text-right">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">הצהרת נגישות - Tyuta.net</h1>
          <p>
            Tyuta.net (להלן: &quot;האתר&quot;) הוא אתר כתיבה וקריאה עברי. המפעיל מייחס חשיבות לשימוש
            נגיש, מכבד ושוויוני באתר ופועל לשיפור חוויית השימוש עבור כלל המשתמשים.
          </p>
          <p className="text-sm opacity-80">
            הצהרה זו נועדה למסור מידע כללי על נגישות האתר ועל דרך הפנייה במקרה של קושי או תקלה.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-medium">1. התאמות ומאמצי נגישות</h2>
          <p>
            האתר נבנה ומתוחזק מתוך שאיפה לעמוד בדרישות הדין החל ובהנחיות נגישות מקובלות לשירותי אינטרנט,
            לרבות תקנות שוויון זכויות לאנשים עם מוגבלות ותקן ישראלי ת&quot;י 5568 המבוסס על הנחיות WCAG,
            ככל שהם חלים על האתר ובהתחשב באופי השירות, בתוכן המשתמשים ובשלבי הפיתוח של המערכת.
          </p>
          <p>
            במסגרת זו ניתנת תשומת לב, בין היתר, לקריאות בעברית, תמיכה בכיוון כתיבה מימין לשמאל,
            מבנה עמודים ברור, ניווט עקבי, שימוש במקלדת, התאמה למסכים שונים ושיפור מתמשך של רכיבים
            שעשויים להשפיע על נגישות.
          </p>
          <p>
            נכון למועד עדכון הצהרה זו, האתר אינו מסתמך על תוסף נגישות חיצוני כתחליף להנגשה ברמת הקוד,
            המבנה והתוכן. ככל שייעשה שימוש בכלי עזר כזה בעתיד, הוא ייחשב כתוספת בלבד ולא כתחליף לעמידה
            בדרישות הדין החל.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium">2. מגבלות אפשריות</h2>
          <p>
            מאחר שהאתר כולל תוכן משתמשים, הטמעות או קישורים לשירותים חיצוניים, ייתכנו חלקים שאינם בשליטת
            המפעיל או שלא הונגשו במלואם. כמו כן, ייתכנו רכיבים חדשים או ניסיוניים שיידרשו בהם תיקוני נגישות
            לאחר פרסומם.
          </p>
          <p>
            אין באמור כדי לגרוע מחובת המפעיל לפעול בהתאם לדין החל, ככל שחובה כזו קיימת, או מהזכות לפנות
            אלינו במקרה של קושי בשימוש באתר.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium">3. פנייה בנושא נגישות</h2>
          <p>
            אם נתקלת בקושי נגישות, בתקלה או בתוכן שאינו נגיש, ניתן לפנות אלינו בכתובת{" "}
            <a className="font-semibold text-blue-700 hover:underline" href="mailto:admin@tyuta.net">
              admin@tyuta.net
            </a>
            . כדי שנוכל לבדוק את הפנייה ביעילות, מומלץ לצרף קישור לעמוד הרלוונטי, תיאור הבעיה,
            סוג המכשיר והדפדפן, ואם רלוונטי גם פרטים על טכנולוגיה מסייעת שבה נעשה שימוש.
          </p>
          <p>פניות בנושא נגישות ייבדקו ויטופלו בתוך זמן סביר ובהתאם לנסיבות ולדין החל.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium">4. מסמכים קשורים</h2>
          <p>
            מידע נוסף על השימוש באתר ועל פרטיות ניתן למצוא ב{" "}
            <Link className="font-semibold text-blue-700 hover:underline" href="/terms">
              תנאי השימוש
            </Link>{" "}
            וב{" "}
            <Link className="font-semibold text-blue-700 hover:underline" href="/privacy">
              מדיניות הפרטיות
            </Link>
            .
          </p>
        </section>

        <footer className="pt-4">
          <p className="mt-2 text-sm opacity-60">עדכון אחרון: {LAST_UPDATED_HE}</p>
        </footer>
      </article>
    </main>
  );
}
