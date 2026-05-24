import { randomBytes } from 'node:crypto';

const key = randomBytes(32).toString('base64');
console.log(key);
console.log();
console.log('Cole em .env.local como ENCRYPTION_KEY_BASE64=' + key);
