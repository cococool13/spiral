const rules = [
  {
    id: "NET",
    title: "No telemetry",
    body: "No usage data leaves the machine. Network calls are named in each app’s privacy details.",
  },
  {
    id: "PAY",
    title: "No subscription",
    body: "One $9.99 license for the collection. Download the apps you need and activate with your Whop key.",
  },
  {
    id: "RUN",
    title: "No lingering processes",
    body: "Quit the app and its work stops. Nothing keeps running in the background.",
  },
];
export default function Rules() {
  return (
    <section id="rules" className="ownership shell">
      <div className="section-heading">
        <h2>
          Your computer.
          <br />
          Still yours.
        </h2>
        <a href="/privacy/" className="text-link">
          Privacy details <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="ownership-grid">
        {rules.map((rule) => (
          <article key={rule.id}>
            <span className="meta-id">{rule.id}</span>
            <h3>{rule.title}</h3>
            <p>{rule.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
