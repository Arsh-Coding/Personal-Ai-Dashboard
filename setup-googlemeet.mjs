/**
 * Gives the googlemeet plugin the same GCP OAuth client the other Google
 * plugins already use, which is what `corsair setup --plugin=googlemeet
 * client_id=... client_secret=...` would do — except the values are read back
 * out of Corsair instead of being retyped, so the secret never has to be pasted
 * anywhere or land in a shell history.
 *
 * Integration-level credentials are per (plugin, integration), not per tenant,
 * so this runs once for the whole app rather than once per connected account.
 * The consent grant is still per (tenant, plugin) — this only unblocks building
 * the authorize URL, which is what fails with:
 *
 *   Error: client_id not configured for 'googlemeet'
 *
 * Safe to re-run: it writes the same values every time and never touches the
 * source plugin. Only ever prints a masked prefix of a secret.
 *
 *   node setup-googlemeet.mjs
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { createCorsair } from 'corsair';
import { googlecalendar } from '@corsair-dev/googlecalendar';
import { gmail } from '@corsair-dev/gmail';
import { googlemeet } from '@corsair-dev/googlemeet';

const mask = (v) => (v ? `${String(v).slice(0, 8)}…(${String(v).length} chars)` : '(unset)');

const db = new Database('corsair.db');
const corsair = createCorsair({
    plugins: [googlecalendar(), gmail(), googlemeet()],
    database: db,
    kek: process.env.CORSAIR_KEK,
    multiTenancy: true,
});

const [calId, calSecret, mailId, meetId] = await Promise.all([
    corsair.keys.googlecalendar.get_client_id(),
    corsair.keys.googlecalendar.get_client_secret(),
    corsair.keys.gmail.get_client_id(),
    corsair.keys.googlemeet.get_client_id(),
]);

console.log('googlecalendar client_id:', mask(calId));
console.log('gmail          client_id:', mask(mailId));
console.log('googlemeet     client_id:', mask(meetId), '<- the one being set');

if (!calId || !calSecret) {
    console.error('\nRefusing to copy: googlecalendar has no stored client_id/client_secret.');
    console.error('Run `npx corsair setup --plugin=googlemeet client_id=... client_secret=...` by hand.');
    process.exitCode = 1;
} else {
    // Reusing one OAuth client across the Google plugins is already this app's
    // pattern; flag it if that stops being true rather than silently picking one.
    if (mailId && mailId !== calId) {
        console.warn('\nNote: gmail and googlecalendar use different OAuth clients.');
        console.warn('Copying the googlecalendar one — re-run corsair setup if that is wrong.');
    }

    await corsair.keys.googlemeet.set_client_id(calId);
    await corsair.keys.googlemeet.set_client_secret(calSecret);

    const check = await corsair.keys.googlemeet.get_client_id();
    console.log('\ngooglemeet client_id now:', mask(check));
    console.log(
        check === calId
            ? 'Done — reconnect Google Meet from the dashboard to grant consent.'
            : 'Write-back verification FAILED.',
    );
    if (check !== calId) process.exitCode = 1;
}

db.close();
