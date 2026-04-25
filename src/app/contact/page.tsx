import type { Metadata } from 'next'
import ContactForm from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'צור קשר',
  description:
    'יצירת קשר עם צוות Tyuta (טיוטה): רעיונות, תקלות, דיווחים ושאלות על בית לכותבים, כתיבה עברית ושיתוף סיפורים בישראל.',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'צור קשר | Tyuta',
    description:
      'יש רעיון, תקלה או שאלה על טיוטה? כתבו לנו. בית טוב לכותבים מתחיל גם בהקשבה למה שצריך להשתפר.',
    url: '/contact',
    siteName: 'Tyuta',
    locale: 'he_IL',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'צור קשר | Tyuta',
    description: 'רעיונות, תקלות, דיווחים ושאלות על Tyuta, בית לכותבים ולקהילת הכתיבה העברית.',
  },
}

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8" dir="rtl">
      <div className="rounded-3xl border bg-white/70 p-6 shadow-sm backdrop-blur dark:bg-card/70">
        <h1 className="text-2xl font-black">צור קשר</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-muted-foreground">
          משהו מציק? רעיון? תקלה? אנחנו פה. ההודעות מגיעות אלינו בלבד.
        </p>

        <div className="mt-6">
          <ContactForm />
        </div>

        <div className="mt-6 rounded-2xl border bg-white/60 p-4 text-sm text-neutral-700 dark:bg-muted/60 dark:text-foreground">
          <div className="font-bold">דיווח על הטרדה</div>
          <div className="mt-1">
            אם מישהו הטריד אותך בצ׳אט — אפשר לדווח ישירות מתוך השיחה דרך כפתור <span className="font-semibold">„דווח/י”</span>.
          </div>
        </div>
      </div>
    </main>
  )
}
