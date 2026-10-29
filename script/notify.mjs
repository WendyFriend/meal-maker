// Sends a Pushover notification using PUSHOVER_TOKEN / PUSHOVER_USER from .env.
// Usage: node --env-file=.env script/notify.mjs [--priority 1] <title> <message>
const args = process.argv.slice(2);
let priority = '0';

if (args[0] === '--priority') {
    priority = args[1];
    args.splice(0, 2);
}

const [title = 'MealMaker', message = '(no message)'] = args;

const token = process.env.PUSHOVER_TOKEN;
const user = process.env.PUSHOVER_USER;

if (!token || !user) {
    console.error('PUSHOVER_TOKEN and PUSHOVER_USER must be set in .env');
    process.exit(1);
}

const body = new URLSearchParams({
    token,
    user,
    title,
    message,
    priority,
});

if (priority === '1' || priority === '2') {
    body.set('sound', 'none');
}

const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    body,
});

if (!response.ok) {
    // Never echo the request body: it contains the token.
    console.error(`Pushover failed: ${response.status} ${response.statusText}`);
    process.exit(1);
}

const data = await response.json();

if (data.status !== 1) {
    console.error(`Pushover rejected: ${(data.errors ?? []).join(', ')}`);
    process.exit(1);
}

console.log('Pushover notification sent.');
