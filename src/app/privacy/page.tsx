import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `Privacy policy | ${SITE.name}`,
  description: `How ${SITE.name} handles your Google account data.`,
};

/**
 * Written to match what the code actually does. If a feature changes what is
 * collected, stored or sent anywhere, update this page in the same change.
 */
export default function PrivacyPage() {
  const email = SITE.contactEmail;

  return (
    <LegalPage title="Privacy policy">
      <section>
        <p>
          {SITE.name} is a personal dashboard that shows your Gmail, Google Calendar and
          Google Meet in one place, and includes an assistant that drafts emails and
          meetings for you to confirm. This page explains what data it handles, why, and
          how to remove it. Questions go to <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>When you sign in with Google:</strong> your name, email address,
            profile picture and Google account ID.
          </li>
          <li>
            <strong>If you connect Gmail:</strong> your email messages and threads,
            including senders, recipients, subjects, dates and message contents.
          </li>
          <li>
            <strong>If you connect Google Calendar:</strong> your events, including titles,
            times, descriptions, attendees and links.
          </li>
          <li>
            <strong>If you connect Google Meet:</strong> the meeting spaces this app creates
            for you.
          </li>
          <li>
            <strong>Access tokens</strong> that Google issues so the app can reach those
            services on your behalf.
          </li>
          <li>
            <strong>Notes</strong> you write on calendar events.
          </li>
          <li>
            <strong>Technical data:</strong> a sign-in cookie, and the request logs our
            hosting provider keeps (such as IP address, browser and time).
          </li>
        </ul>
        <p>
          Gmail, Calendar and Meet are each connected separately, and only if you choose
          to. You can sign in without connecting any of them.
        </p>
      </section>

      <section>
        <h2>How we use it</h2>
        <p>Only to provide the features you use:</p>
        <ul>
          <li>showing your mail, calendar and meetings on your dashboard;</li>
          <li>sending emails you write or confirm;</li>
          <li>creating calendar events and Meet links you ask for, and emailing the invites.</li>
        </ul>
        <p>
          We do not sell your data, use it for advertising, or use it to train AI models.
          Nobody reads your email or calendar data except you, unless you ask for help
          with a specific item, it is needed to investigate abuse or a security issue, or
          the law requires it.
        </p>
      </section>

      <section>
        <h2>The assistant</h2>
        <p>
          When you message the assistant, what you type is sent to Google&apos;s Gemini API
          to generate a reply, together with your name, email address, time zone and
          today&apos;s date. It does <strong>not</strong> receive your emails, calendar
          events or notes. Nothing is sent or scheduled until you press the button on the
          card it shows you.
        </p>
        <p>
          The conversation is kept only in the open page and is gone when you reload or
          press Clear. This app does not store it. Google processes it under the{" "}
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">
            Gemini API terms
          </a>
          ; on the free tier, Google may use this content to improve its products.
        </p>
      </section>

      <section>
        <h2>Who else handles your data</h2>
        <ul>
          <li>
            <strong>Vercel</strong> hosts the app and keeps request logs.
          </li>
          <li>
            <strong>Neon</strong> hosts the database where the data above is stored.
          </li>
          <li>
            <strong>Google</strong> provides sign-in, the services you connect, and the
            Gemini API used by the assistant.
          </li>
        </ul>
        <p>
          The integration library this app uses (Corsair) runs inside the app itself; your
          data is not sent to Corsair&apos;s servers. We share data with no one else.
        </p>
      </section>

      <section>
        <h2>How it&apos;s protected</h2>
        <ul>
          <li>Access tokens are encrypted, each account with its own key.</li>
          <li>All traffic uses HTTPS, and the sign-in cookie cannot be read by page scripts.</li>
          <li>
            Each signed-in account can only reach its own data; the app never takes an
            account as input from the browser.
          </li>
          <li>Email contents are sanitized before display, and remote images stay blocked until you load them.</li>
        </ul>
      </section>

      <section>
        <h2>Keeping and deleting your data</h2>
        <p>
          Synced data is kept while your account exists, so the dashboard keeps working.
        </p>
        <ul>
          <li>
            <strong>Stop access:</strong> remove the app at{" "}
            <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
              myaccount.google.com/connections
            </a>
            . This stops any further access to your Google data, but does not delete what
            was already synced.
          </li>
          <li>
            <strong>Delete everything:</strong> email{" "}
            <a href={`mailto:${email}`}>{email}</a> from the address you signed in with. We
            will delete your account and all data synced for it within 30 days and confirm
            by email.
          </li>
        </ul>
      </section>

      <section>
        <h2>Google API Services User Data Policy</h2>
        <p>
          {SITE.name}&apos;s use and transfer to any other app of information received from
          Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>This app is not directed at children under 13.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If this policy changes, the date at the top changes with it. Significant changes
          will be noted on the sign-in page.
        </p>
      </section>
    </LegalPage>
  );
}
