import { MARKETING } from "../../constants/marketing";

export function Faq() {
  return (
    <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
      <h2 className="text-3xl lg:text-4xl font-bold text-ink dark:text-white tracking-tight text-center mb-12">
        Frequently asked questions
      </h2>
      <div className="space-y-3">
        {MARKETING.faq.map((item) => (
          <details
            key={item.question}
            className="group rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-1 open:pb-5"
          >
            <summary className="cursor-pointer list-none flex items-center justify-between gap-4 py-4 font-semibold text-ink dark:text-white">
              {item.question}
              <span className="shrink-0 text-gray-400 group-open:rotate-45 transition-transform text-xl leading-none">
                +
              </span>
            </summary>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
