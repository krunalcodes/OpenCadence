import Link from "next/link";
import type { PostSection } from "./index";

export const sections: PostSection[] = [
  { id: "how-many-steps", title: "How many steps" },
  { id: "spacing", title: "How far apart" },
  { id: "one-ask", title: "One ask per email" },
  { id: "add-something", title: "Give each step a reason to exist" },
  { id: "stop-on-reply", title: "Stop when they reply" },
  { id: "the-last-email", title: "The last email" },
];

export function Body() {
  return (
    <>
      <p>
        A first email often goes unanswered for reasons that have nothing to do
        with its content. It arrived on a busy morning, it was opened on a phone
        and forgotten, or it slipped below the fold of the inbox. A follow-up
        gives the same person a second chance to respond. A good sequence does
        that a few times, politely, and then stops.
      </p>

      <h2 id="how-many-steps">How many steps</h2>
      <p>
        For most outreach, three to five emails in total is enough: the first
        message and two to four follow-ups. Each extra step reaches fewer new
        people than the one before it, and after a point the main thing another
        email produces is irritation and spam complaints.
      </p>
      <p>
        Match the length to the relationship. Someone who asked for a quote or
        met you at an event will tolerate more reminders than a stranger. For a
        cold first contact, stay at the short end.
      </p>

      <h2 id="spacing">How far apart</h2>
      <p>
        Leave a few working days after the first email, then widen the gap with
        each step. Early follow-ups catch people who meant to answer. Later ones
        should feel like an occasional reminder.
      </p>
      <figure>
        <figcaption>Example spacing for a four-step sequence</figcaption>
        <div>
          <table>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Sent</th>
                <th scope="col">Job</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>Day 1</td>
                <td>The reason you are writing, and one question</td>
              </tr>
              <tr>
                <td>2</td>
                <td>Day 4</td>
                <td>A short reminder with one new detail</td>
              </tr>
              <tr>
                <td>3</td>
                <td>Day 9</td>
                <td>A different angle or a useful resource</td>
              </tr>
              <tr>
                <td>4</td>
                <td>Day 16</td>
                <td>A polite close</td>
              </tr>
            </tbody>
          </table>
        </div>
      </figure>
      <p>
        Send on working days, during working hours in the recipient&apos;s time
        zone. Skip weekends and public holidays when counting the gaps. Treat
        these days as a starting point and adjust once you can see when your own
        replies arrive.
      </p>

      <h2 id="one-ask">One ask per email</h2>
      <p>
        Every email in the sequence should ask for one thing, and it should be
        something the reader can answer in a line. An email that asks for a
        call, links to a case study, and invites the reader to a webinar leaves
        them to work out which response you want, and the easiest response to a
        puzzle is none.
      </p>
      <p>
        Small asks get more replies than large ones. &quot;Is this something
        your team handles?&quot; is easier to answer than a request for thirty
        minutes on a calendar. You can make the ask smaller as the sequence goes
        on, until the last one only needs a yes or a no.
      </p>
      <figure>
        <figcaption>Step 2, as plain text</figcaption>
        <pre>{`Subject: Re: Invoice reminders for Northwind

Hi Dana,

One detail I left out last week: the reminders can
go out from your own finance mailbox, so replies
land with your team.

Is that worth a look this month?

Maya`}</pre>
      </figure>

      <h2 id="add-something">Give each step a reason to exist</h2>
      <p>
        A follow-up that only says you are checking in asks the reader to do the
        work of remembering why you wrote. Each step should be able to stand
        alone. Give it one new thing: a detail you left out, an answer to a
        likely objection, a short example, or a different reason the topic might
        matter to this person.
      </p>
      <p>
        Follow-ups should also get shorter. If the first email took five
        sentences, the second can take three. Replying in the same thread keeps
        the earlier message in view, which lets you say less. Start a new thread
        with a new subject only when you are changing the angle completely.
      </p>
      <aside>
        <p>
          Write each email as plain text from one person to another. Heavy
          templates, several links, and images make a personal message look like
          a campaign, and they are harder to deliver.
        </p>
      </aside>

      <h2 id="stop-on-reply">Stop when they reply</h2>
      <p>
        The rule that matters most is mechanical. The moment someone answers,
        every remaining step for that person must be cancelled. An automated
        reminder that arrives after a real reply tells the reader that nobody
        read what they wrote.
      </p>
      <p>A reply is one of several events that should end a sequence.</p>
      <ul>
        <li>They reply, whatever the reply says.</li>
        <li>They unsubscribe or ask you to stop.</li>
        <li>The message bounces.</li>
        <li>They book a meeting or become a customer by another route.</li>
        <li>
          An automatic out-of-office reply arrives. Pause until they are back,
          then continue.
        </li>
      </ul>
      <p>
        Check that these stops apply across everything you send. If a contact
        unsubscribes from your newsletter, your outreach should respect that
        too. Rules on commercial email apply to one-to-one outreach in many
        countries, so include a clear way to opt out and honour it promptly.
      </p>

      <h2 id="the-last-email">The last email</h2>
      <p>
        End the sequence on purpose. Say that this is your last message on the
        subject, leave one easy way to pick the conversation up later, and then
        keep your word. A clear ending often draws a reply from people who were
        interested and slow, and it leaves a better impression on everyone else.
      </p>
      <p>
        Remember that follow-ups count toward what each mailbox sends in a day.
        A new address needs to{" "}
        <Link href="/blog/how-to-warm-up-a-new-mailbox">
          build up its volume gradually
        </Link>{" "}
        before it carries a full sequence.
      </p>
      <p>
        OpenCadence sequences cancel the remaining steps as soon as a reply,
        bounce, or unsubscribe comes in, and they share one suppression list
        with your newsletters. See how steps, delays, and stop conditions work
        on the <Link href="/features/sequences">sequences page</Link>.
      </p>
    </>
  );
}
