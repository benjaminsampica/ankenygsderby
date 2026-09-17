import type { Child } from "hono/jsx";
import { event, levels, displayDeadline, displayOpening } from "./event.js";
import { duplicateKey, type Errors, type FormValues, type Registration } from "./domain.js";

type IconName = "copy" | "printer" | "x" | "chevron-left" | "chevron-right" | "pencil" | "download" | "user-plus" | "external-link";
function Icon({ name }: { name: IconName }) {
  return <span class={"icon icon-" + name} aria-hidden="true"></span>;
}

function DerbyPatch({ motif = "car" }: { motif?: "car" | "flag" }) {
  return <svg class={"derby-patch patch-" + motif} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
    <rect class="patch-fill" x="3" y="3" width="90" height="90" rx="34" />
    <rect x="10" y="10" width="76" height="76" rx="28" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="2 4" />
    {motif === "car" ? <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 56v-9l33-11 15 13 5 2v9H23m9-13 26-3m-7-15 4-5m-17 9-2-6" />
      <circle cx="35" cy="61" r="7" class="patch-fill" /><circle cx="65" cy="61" r="7" class="patch-fill" />
      <path d="M23 74h50" stroke-opacity=".35" />
    </g> : <g stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
      <path d="M31 73V25h36v30H31" fill="none" stroke-linecap="round" />
      <path d="M31 25h12v10H31zm24 0h12v10H55zM43 35h12v10H43zM31 45h12v10H31zm24 0h12v10H55z" fill="currentColor" stroke="none" />
    </g>}
  </svg>;
}

function AwardBadge({ motif }: { motif: "scout" | "animal" | "art" }) {
  return <svg class="award-badge" viewBox="0 0 160 180" aria-hidden="true" focusable="false">
    <path class="badge-tails" d="M49 105 34 167 60 154 77 174 86 113M81 113 98 174 112 153 139 164 116 102" />
    <path class="badge-rosette" d="m80 10 13 7 15-1 9 12 14 6 3 15 10 11-4 15 4 15-10 11-3 15-14 6-9 12-15-1-13 7-13-7-15 1-9-12-14-6-3-15-10-11 4-15-4-15 10-11 3-15 14-6 9-12 15 1Z" />
    <circle class="badge-stitch" cx="80" cy="75" r="48" />
    <circle class="badge-face" cx="80" cy="75" r="40" />
    {motif === "scout" && <g transform="rotate(6 80 75)">
      <defs><mask id="scout-trefoil" class="badge-trefoil-mask" maskUnits="userSpaceOnUse" x="50" y="47" width="60" height="56">
        <image href="/images/girl-scout-trefoil.png" x="50" y="47" width="60" height="56" />
      </mask></defs>
      <rect x="50" y="47" width="60" height="56" fill="currentColor" mask="url(#scout-trefoil)" />
    </g>}
    {motif === "animal" && <g class="badge-symbol" fill="currentColor">
      <ellipse cx="58" cy="68" rx="7" ry="10" transform="rotate(-25 58 68)" />
      <ellipse cx="73" cy="55" rx="7" ry="10" transform="rotate(-8 73 55)" />
      <ellipse cx="90" cy="55" rx="7" ry="10" transform="rotate(8 90 55)" />
      <ellipse cx="105" cy="68" rx="7" ry="10" transform="rotate(25 105 68)" />
      <path d="M80 72c-10 0-11 9-18 16-8 9-1 18 8 15 8-3 13-3 21 0 10 3 17-6 9-15-7-7-10-16-20-16Z" />
    </g>}
    {motif === "art" && <g class="badge-symbol">
      <path d="M81 43c-22 0-38 17-34 37 3 19 22 30 37 23 7-3-3-11 1-16 4-6 16 2 23-4 16-14-3-40-27-40Z" fill="currentColor" />
      <circle cx="63" cy="66" r="5" fill="#f1d170" /><circle cx="78" cy="56" r="5" fill="#e8ad9f" /><circle cx="94" cy="62" r="5" fill="#c5ddc1" />
      <circle cx="61" cy="83" r="5" class="badge-highlight" />
      <path d="m84 105 26-32" fill="none" stroke="#f1d170" stroke-width="6" stroke-linecap="round" />
      <path d="m107 75 8-12c7 9 4 15-4 16Z" fill="#f1d170" />
    </g>}
    <path class="badge-sparkles" d="M18 31v12m-6-6h12m116 83v10m-5-5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>;
}

export function Layout({ title, page, children }: { title: string; page: string; children: Child }) {
  return <html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} | Pinewood Derby 2027</title>
    <meta name="description" content="Register for the 2027 Girl Scouts Pinewood Derby. Race day is January 9." />
    <meta name="htmx-config" content={JSON.stringify({ includeIndicatorCSS: false, preload: { boostEvent: "mouseenter" } })} />
    <link rel="icon" href="/images/derby-logo.png" type="image/png" /><link rel="stylesheet" href="/styles.css" />
    {/* Install request listeners before HTMX initializes load-triggered requests. */}
    <script src="/site.js" defer></script><script src="/htmx.min.js" defer></script><script src="/hx-preload.min.js" defer></script>
  </head><body hx-boost:inherited="true">
    <a class="skip" href="#main">Skip to content</a>
    <header class="site-header"><a class="wordmark" href="/" aria-label="Pinewood Derby home"><img class="site-logo" src="/images/derby-logo.png" width="400" height="296" alt="Ankeny Girl Scouts Pinewood Derby" /></a>
      <nav aria-label="Main navigation"><a href="/guide" aria-current={page === "guide" ? "page" : undefined}>Car guide</a><a class="nav-register" href="/register" aria-current={page === "register" ? "page" : undefined}>Register</a></nav>
    </header>
    <main id="main" tabindex={-1}>{children}</main>
    <footer><div><strong>Ankeny Girl Scouts</strong><p>Contact <a href={"mailto:" + event.contacts[0].email}>Benjamin</a> or <a href={"mailto:" + event.contacts[1].email}>Todd</a>.</p></div><a class="organizer-link" href="/admin" hx-boost="false">Organizer sign in</a></footer>
    <div id="request-error" class="request-error" role="alert" hidden>We couldn’t reach the server. Your entries are still here. Please try again.</div>
  </body></html>;
}
export function Home() {
  return <Layout title="Ankeny Girl Scouts" page="home">
    <section class="hero" aria-labelledby="event-title">
      <div class="hero-copy">
        <div class="hero-intro"><DerbyPatch /><p class="eyebrow">ANKENY GIRL SCOUTS</p></div>
        <h1 id="event-title">Pinewood<br /><em>Derby</em></h1>
        <p class="hero-date">Saturday, January 9, 2027</p>
        <p class="hero-description">Join Girl Scouts from Daisies through Ambassadors for our annual Pinewood Derby. Families are welcome to watch and cheer.</p>
        <div class="hero-actions"><a class="button" href="/register">Register a racer</a><a class="button secondary" href="/guide">Car pickup &amp; guide</a></div>
        <div class="deadline" hx-get="/api/status" hx-trigger="load" hx-swap="innerHTML">Registration opens {displayOpening()}. Registration closes {displayDeadline(event.closesAt)}.</div>
      </div>
      <img class="hero-image" src="/images/race-day-2026.jpg" srcset="/images/race-day-2026-small.jpg 700w, /images/race-day-2026.jpg 1400w" sizes="(max-width: 750px) calc(100vw - 40px), (max-width: 1200px) 48vw, 540px" width="1400" height="1050" fetchpriority="high" alt="Families gathered along the pinewood derby track." />
    </section>
    <section id="race-day" class="race-day" aria-labelledby="race-day-title">
      <h2 id="race-day-title">Race day</h2>
      <dl class="race-day-details">
        <div class="stitched-panel tone-sage"><dt>Location</dt><dd><strong>{event.venue}</strong><span>{event.address}</span></dd></div>
        <div class="stitched-panel tone-gold"><dt>Schedule</dt><dd><strong>{event.raceDate}</strong><span>{event.raceTimes}</span></dd></div>
        <div class="stitched-panel tone-lavender"><dt>Check-in</dt><dd>Save your race number for check-in.</dd></div>
      </dl>
    </section>
    <section class="design-awards" aria-labelledby="awards-title">
      <div class="awards-heading"><div><h2 id="awards-title">Design awards</h2></div><p>Awarded in every race class.</p></div>
      <ul class="award-list">
        <li class="award-card award-scout"><AwardBadge motif="scout" /><div><h3>Most Girl Scout</h3><p>Let your Girl Scout spirit shine.</p></div></li>
        <li class="award-card award-animal"><AwardBadge motif="animal" /><div><h3>Best Animal Design</h3><p>Take a walk on the wild side.</p></div></li>
        <li class="award-card award-art"><AwardBadge motif="art" /><div><h3>Most Artsy</h3><p>Dream it. Paint it. Make it yours.</p></div></li>
      </ul>
    </section>
    <section class="race-gallery" aria-labelledby="gallery-title">
      <div class="gallery-heading"><h2 id="gallery-title">Previous years</h2></div>
      <div class="gallery-grid">
        <EventPhoto name="cars-2026" alt="Handmade derby cars decorated with candy, flowers, and colorful characters." />
        <EventPhoto name="pit-area-2026" alt="Scouts and families looking over the cars before racing." />
        <EventPhoto name="spectators-2026" alt="Families cheering beside the track during a race." />
        <EventPhoto name="track-2026" alt="The yellow race track ready for race day." />
        <EventPhoto name="starting-grid-2026" alt="Colorful derby cars waiting in their numbered spaces." />
        <EventPhoto name="check-in-2026" alt="Scouts and volunteers gathered at the check-in table." />
        <EventPhoto name="trackside-2026" alt="Scouts watching the race from beside the track." />
        <EventPhoto name="ribbons-2026" alt="Award ribbons displayed above a checkered table." />
        <EventPhoto name="celebration-2026" alt="Scouts posing together at the race-day photo booth." />
      </div>
    </section>
    <dialog id="photo-viewer" class="photo-viewer" aria-label="Previous years photo viewer">
      <div class="viewer-toolbar"><span id="viewer-count" role="status" aria-live="polite"></span><button type="button" data-viewer-close autofocus>Close <Icon name="x" /></button></div>
      <div class="viewer-stage"><img id="viewer-image" alt="" /></div>
      <div class="viewer-controls"><button type="button" data-viewer-previous><Icon name="chevron-left" /> Previous</button><button type="button" data-viewer-next>Next <Icon name="chevron-right" /></button></div>
    </dialog>
  </Layout>;
}
function EventPhoto({ name, alt }: { name: string; alt: string }) {
  return <a class="gallery-photo" href={"/images/" + name + ".jpg"} data-gallery-photo hx-boost="false" aria-label={"View photo: " + alt} aria-haspopup="dialog"><img class="event-photo" src={"/images/" + name + "-small.jpg"} width="700" height="525" loading="lazy" decoding="async" alt={alt} /></a>;
}
export function RegisterPage() {
  return <Layout title="Register" page="register"><section class="registration-page">
    <header class="page-heading illustrated-heading"><div><h1>Register a racer</h1></div><DerbyPatch motif="flag" /></header>
    <div id="registration-panel" class="paper registration-paper stitched-panel tone-sage" aria-label="Registration" hx-get="/api/registration-form" hx-trigger="load" hx-swap="innerHTML"><p class="loading" role="status">Loading</p><noscript>Please enable JavaScript to register.</noscript></div>
  </section></Layout>;
}
export function GuidePage() {
  const toddEmail = "mailto:" + event.contacts[1].email;
  return <Layout title="Car guide" page="guide"><article class="guide-page">
    <header class="page-heading illustrated-heading"><div><h1>Car guide</h1><p>Pick up your kit, build your car, and get ready to race.</p></div><DerbyPatch /></header>
    <section id="kit-pickup" class="guide-pickup stitched-panel tone-sage" aria-labelledby="pickup-title">
      <div>
        <h2 id="pickup-title">Car kit pickup</h2>
        <p class="pickup-fee">Bring <strong>$10 per registered racer</strong> for event registration and your car kit.</p>
        <div class="pickup-details">
          <div><h3>Where</h3><address>4804 NW 2nd Court<br />Ankeny, IA 50023</address><p class="guide-note">Check your GPS: it should take you to the intersection of Abbie Dr and 2nd Street.</p></div>
          <div><h3>When</h3><dl class="pickup-hours"><div><dt>Monday–Friday</dt><dd>6–9 pm</dd></div><div><dt>Saturday–Sunday</dt><dd>9 am–9 pm</dd></div></dl><p class="pickup-unavailable">No pickup December 20–28.</p></div>
        </div>
        <p>Pickup is self-service, so there’s no need to call. Car kits are in a box by the front door. Leave your payment in the envelope provided.</p>
        <p>If these times don’t work for you, email <a href={toddEmail}>todd.m.dresser@outlook.com</a>.</p>
      </div>
      <img class="event-photo" src="/images/cars-2026.jpg" srcset="/images/cars-2026-small.jpg 700w, /images/cars-2026.jpg 1400w" sizes="(max-width: 750px) calc(100vw - 40px), 35vw" width="1400" height="1050" alt="Decorated pinewood derby cars lined up before racing." />
    </section>
    <section id="car-rules" class="guide-section" aria-labelledby="rules-title">
      <h2 id="rules-title">Rules &amp; guidelines</h2>
      <div class="guide-rules-grid">
        <div class="specification-panel stitched-panel tone-gold"><h3>Car specifications</h3><p class="guide-note">Most measurements match the kit’s original block of wood.</p>
          <dl class="car-specifications">
            <div><dt>Maximum width</dt><dd>2¾ inches</dd></div>
            <div><dt>Maximum length</dt><dd>7 inches</dd></div>
            <div><dt>Maximum height</dt><dd>4¼ inches</dd></div>
            <div><dt>Maximum weight</dt><dd>5 ounces</dd></div>
            <div><dt>Minimum width between wheels</dt><dd>1¾ inches</dd></div>
            <div><dt>Minimum bottom clearance</dt><dd>⅜ inch</dd></div>
            <div><dt>Distance between axles</dt><dd>4⅜–4½ inches</dd></div>
          </dl>
        </div>
        <div><h3>General rules</h3><ul class="guide-list">
          <li>Display your assigned race number on top of the car. Your number is provided when you register online.</li>
          <li>Bearings, washers, and bushings are not permitted on wheels. Washers may be used as car weights.</li>
          <li>The car must not ride on springs.</li>
          <li>Only official Cub Scout Grand Prix Pinewood Derby wheels and axles are permitted.</li>
          <li>Only dry lubricant is permitted.</li>
          <li>The car must be freewheeling, with no starting devices.</li>
          <li>Every car must pass inspection. If adjustments are needed, you’ll have time to make them.</li>
          <li>Cars must have four wheels, and all four must contact the track.</li>
        </ul></div>
      </div>
    </section>
    <section id="building" class="guide-section building-panel stitched-panel tone-lavender" aria-labelledby="building-title">
      <h2 id="building-title">Construction &amp; design</h2>
        <div class="guide-building-copy">
          <div>
          <h3>Make it their own</h3>
          <p>Let your Girl Scout draw a shape on the side of the block, use a coping saw to cut it out, and smooth the edges with sandpaper. A simple clamp helps hold the block steady, and an adult can help with the cutting.</p>
          <p>It doesn’t need to look perfect. A little imperfection shows the creativity and hard work your Girl Scout put into her car. Building together can be a great bonding activity.</p>
          </div>
          <div>
          <h3>Need a hand with woodworking?</h3>
          <p><a href={toddEmail}>Contact Todd</a> for help. He can assist with individual cars or arrange a troop building session in his garage.</p>
          </div>
          <div>
          <h3>Wheels &amp; weight</h3>
          <p>Make sure the wheels roll freely and bring the car close to the 5-ounce limit without going over. Smooth wheels and good weight give it the best chance of reaching the finish line.</p>
          </div>
          <div>
          <h3>Paint &amp; decorations</h3>
          <p>There are plenty of pinewood derby design ideas online. Todd’s family has had good results with Crayola washable kids’ paint, including glitter and metallic colors. Let your Scout choose a design that feels like her own.</p>
          <p>The local Boy Scout store carries approved accessories and decals:</p>
          <address><strong>Boy Scout Store</strong><br />6123 Scout Trail<br />Des Moines, IA 50321</address>
          </div>
        </div>
    </section>
    <div class="guide-closing"><p>Have fun building, and Go Girl Scouts! We welcome your ideas for making the derby even better.</p><a href="/#race-day">Race-day location, times &amp; check-in</a></div>
  </article></Layout>;
}
export function ConfirmationPage() {
  return <Layout title="Your registration" page="confirmation"><div class="receipt-wrap"><section id="receipt" class="paper" hx-get="/api/confirmation" hx-trigger="load" hx-swap="innerHTML"><p class="loading" role="status">Loading</p><noscript>Please enable JavaScript to view your confirmation.</noscript></section></div></Layout>;
}
export function AdminPage() {
  return <Layout title="Organizers" page="admin"><section class="admin-page"><div class="page-heading section-heading"><div><h1>Race roster</h1></div><a class="text-link" href="/.auth/logout?post_logout_redirect_uri=/" hx-boost="false">Sign out</a></div><div id="admin-content" hx-get="/api/admin/dashboard" hx-trigger="load"><p class="loading" role="status">Loading registrations</p></div></section></Layout>;
}
export function Message({ heading, children }: { heading: string; children: Child }) {
  return <div class="message" role="status"><h2>{heading}</h2><p>{children}</p></div>;
}
export function ErrorSummary({ errors }: { errors: Errors }) {
  if (!Object.keys(errors).length) return null;
  return <div class="validation-summary" role="alert" tabindex={-1}><strong>Please check your entry.</strong><ul>{Object.entries(errors).map(([key, text]) => <li>{key === "form" ? text : <a href={"#" + key}>{text}</a>}</li>)}</ul></div>;
}
export function ParticipantFields({ values = {}, errors = {} }: { values?: FormValues; errors?: Errors }) {
  const field = (name: "firstName" | "lastInitial" | "troopNumber", label: string, maxLength: number, hint?: string) => <div class="field"><label for={name}>{label}</label><input id={name} name={name} required maxlength={maxLength} pattern={name === "lastInitial" ? "[A-Za-z]" : undefined} autocapitalize={name === "lastInitial" ? "characters" : undefined} value={values[name] || ""} autocomplete="off" inputmode={name === "troopNumber" ? "numeric" : "text"} aria-invalid={errors[name] ? "true" : undefined} aria-describedby={errors[name] ? name + "-error" : hint ? name + "-hint" : undefined} />{errors[name] ? <p id={name + "-error"} class="field-error">{errors[name]}</p> : hint ? <p id={name + "-hint"} class="field-hint">{hint}</p> : null}</div>;
  return <><div class="name-grid">{field("firstName", "First name", 60)}{field("lastInitial", "Last initial", 1)}</div><div class="field"><label for="level">Troop level</label><select id="level" name="level" required aria-invalid={errors.level ? "true" : undefined} aria-describedby={errors.level ? "level-error" : undefined}><option value="" selected={!values.level}>Choose a level</option>{levels.map(level => <option value={level} selected={values.level === level}>{level}</option>)}</select>{errors.level && <p id="level-error" class="field-error">{errors.level}</p>}</div>{field("troopNumber", "Troop number", 10)}</>;
}
type FormProps = { csrf: string; submissionId: string; values?: FormValues; errors?: Errors; organizer?: boolean };
export function RegistrationForm({ csrf, submissionId, values, errors, organizer = false }: FormProps) {
  const action = organizer ? "/api/admin/register" : "/api/register";
  return <form action={action} method="post" hx-post={action} hx-target="this" hx-swap="outerHTML" hx-disable="find button[type='submit']">
    <h2 class={organizer ? undefined : "sr-only"}>{organizer ? "Add a racer" : "Racer details"}</h2>
    <ErrorSummary errors={errors || {}} /><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="submissionId" value={submissionId} />
    <div class="honey" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex={-1} autocomplete="off" /></div>
    <ParticipantFields values={values} errors={errors} />
    <button class="button full" type="submit"><span class="idle-text">{organizer ? "Add racer" : "Register"}</span><span class="busy-text">Saving</span></button>
    {organizer && <a class="text-link" href="/admin" hx-boost="false">Back to roster</a>}
  </form>;
}
export function Receipt({ row }: { row: Registration }) {
  return <>
    <div class="receipt-heading"><span class="small-tag">PINEWOOD DERBY 2027</span><DerbyPatch motif="flag" /></div>
    <h1>Registration complete</h1>
    <div class="race-number-patch stitched-panel tone-gold"><p class="receipt-label">YOUR RACE NUMBER</p>
    <div class="race-number">{String(row.raceNumber).padStart(2, "0")}</div></div>
    <ol class="receipt-reminders" aria-label="Before race day">
      <li><strong>Save your race number.</strong> You’ll need it at check-in. Take a screenshot or print this receipt.</li>
      <li><strong><a href="/guide">Visit the car guide</a>.</strong> Find car requirements and kit pickup details before race day.</li>
    </ol>
    <dl class="receipt-details"><div><dt>Racer</dt><dd>{row.firstName} {row.lastInitial}.</dd></div><div><dt>Troop level</dt><dd>{row.level}</dd></div><div><dt>Troop number</dt><dd>{row.troopNumber}</dd></div><div><dt>Race day</dt><dd>{event.raceDate}</dd></div></dl>
    <p class="receipt-info"><a href="/#race-day">Race-day location, times &amp; check-in</a></p>
    <div class="receipt-actions"><button class="button" type="button" data-copy-receipt><Icon name="copy" />Copy confirmation link</button><button class="button secondary" type="button" data-print><Icon name="printer" />Print receipt</button></div>
    <p id="copy-status" role="status" class="field-hint"></p>
    <a href="/register" class="text-link">Register another racer</a>
  </>;
}
export function Roster({ rows, search = "" }: { rows: Registration[]; search?: string }) {
  const counts = new Map<string, number>();
  rows.forEach(row => counts.set(duplicateKey(row), (counts.get(duplicateKey(row)) || 0) + 1));
  const visible = rows.filter(r => `${r.firstName} ${r.lastInitial} ${r.troopNumber} ${r.raceNumber} ${r.level}`.toLowerCase().includes(search.toLowerCase()));
  return <div id="roster"><p class="roster-notice"><strong>Rosters are deleted on February 8, 2027.</strong> Download your final roster before then.</p><div class="roster-count"><strong>{rows.length}</strong> racers</div>{visible.length ? <div class="table-scroll"><table><caption class="sr-only">Registered racers</caption><thead><tr><th scope="col"><span class="sr-only">Actions</span></th><th scope="col">Race #</th><th scope="col">Racer</th><th scope="col">Level</th><th scope="col">Troop</th></tr></thead><tbody>{visible.map(row => <tr><td><button class="text-button" type="button" hx-get={"/api/admin/edit/" + row.id} hx-target="#editor" hx-swap="innerHTML" aria-label={"Edit racer " + row.raceNumber}><Icon name="pencil" />Edit</button></td><td class="number-cell">{row.raceNumber}</td><td>{row.firstName} {row.lastInitial}.{(counts.get(duplicateKey(row)) || 0) > 1 && <span class="duplicate-tag">Possible duplicate</span>}</td><td>{row.level}</td><td>{row.troopNumber}</td></tr>)}</tbody></table></div> : <div class="empty"><h2>{search ? "No matching racers." : "The starting grid is open."}</h2><p>{search ? "Try another name, troop, level, or race number." : "Registrations will appear here as families sign up."}</p></div>}</div>;
}
export function Dashboard({ rows }: { rows: Registration[] }) {
  return <><div class="admin-toolbar"><label class="search-label"><span class="sr-only">Search registrations</span><input type="search" name="q" placeholder="Search name, troop, level, or number" hx-get="/api/admin/roster" hx-trigger="input changed delay:250ms, search" hx-target="#roster" hx-swap="outerHTML" /></label><a class="button secondary" href="/api/admin/export" download><Icon name="download" />Export CSV</a><button class="button" hx-get="/api/admin/new" hx-target="#editor" type="button"><Icon name="user-plus" />Add racer</button></div><div id="editor"></div><Roster rows={rows} /></>;
}
export function EditForm({ row, csrf, errors = {} }: { row: Registration; csrf: string; errors?: Errors }) {
  return <form class="paper editor-form" action={"/api/admin/edit/" + row.id} method="post" hx-post={"/api/admin/edit/" + row.id} hx-target="this" hx-swap="outerHTML" hx-disable="find button[type='submit']"><p class="small-tag">RACE NUMBER {row.raceNumber}</p><h2>Edit registration</h2><ErrorSummary errors={errors} /><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="etag" value={row._etag || ""} /><ParticipantFields values={row} errors={errors} /><p class="field-hint level-change-note">Changing the troop level assigns a new race number.</p><div class="receipt-actions"><button class="button" type="submit">Save changes</button><a href="/admin" hx-boost="false" class="button secondary">Back to roster</a></div><p><a href={"/api/admin/receipt/" + row.id} class="text-link" target="_blank" rel="noopener">View confirmation <Icon name="external-link" /></a></p></form>;
}
