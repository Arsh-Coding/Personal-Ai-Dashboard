import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/_components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `Terms of service | ${SITE.name}`,
  description: `Terms for using ${SITE.name}.`,
};

export default function TermsPage() {
  const email = SITE.contactEmail;

  return (
    <LegalPage title="Terms of service">
      <section>
        <p>
          By using {SITE.name} you agree to these terms. If you don&apos;t agree, please
          don&apos;t use it. How your data is handled is described in the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>

      <section>
        <h2>Using the app</h2>
        <ul>
          <li>Use it only with Google accounts you own or are allowed to use.</li>
          <li>
            Don&apos;t use it to send spam, harass people, or try to reach anyone
            else&apos;s data.
          </li>
          <li>
            Google&apos;s own terms continue to apply to Gmail, Calendar, Meet and Gemini.
          </li>
        </ul>
      </section>

      <section>
        <h2>Emails and meetings you send</h2>
        <p>
          You are responsible for the emails you send and the meetings you schedule
          through the app, including ones the assistant drafts and you confirm. The
          assistant can make mistakes, so check names, addresses, dates and times before
          you press Send or Schedule.
        </p>
      </section>

      <section>
        <h2>No warranty</h2>
        <p>
          This is a personal project provided as-is, without warranties of any kind. It may
          change, have downtime, or stop running. To the extent the law allows, we are not
          liable for losses arising from its use, including missed, delayed or misdirected
          emails and meetings.
        </p>
      </section>

      <section>
        <h2>Stopping</h2>
        <p>
          You can stop using the app at any time and ask for your data to be deleted, as
          described in the privacy policy. We may suspend access that breaks these terms.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          <a href={`mailto:${email}`}>{email}</a>
        </p>
      </section>
    </LegalPage>
  );
}
