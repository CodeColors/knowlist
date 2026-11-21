// Extrait des mots de passe les plus courants (listes publiques de fuites), en minuscules.
// La vérification se fait aussi sur des variantes simples (suffixes numériques, casse).
export const COMMON_PASSWORDS = new Set(
  `123456789012 1234567890123 12345678901234 password1234 passwordpassword motdepasse123 motdepasse1234
qwertyuiopas azertyuiopqs azertyuiop123 qwertyuiop123 qwerty123456 azerty123456 iloveyou1234 123456123456
111111111111 000000000000 aaaaaaaaaaaa abcdefghijkl abcdef123456 abc123abc123 password123! password@123
administrator adminadmin123 admin1234567 letmein12345 welcome12345 welcome123456 changeme1234 changemenow1
football1234 baseball1234 sunshine1234 princess1234 dragon123456 monkey123456 starwars1234 superman1234
trustno1trustno1 masterkey123 qazwsxedcrfv 1q2w3e4r5t6y 1qaz2wsx3edc zaq12wsxcde3 soleil123456 bonjour12345
chocolat1234 doudou123456 marseille123 nicolas12345 knowlist1234 knowlistknowlist vocabulaire1 apprendre123
p@ssw0rd1234 passw0rd1234 Password1234 motdepasse!! 987654321098 098765432109 147258369147 159753159753
iloveyouiloveyou 1234qwerasdf asdfghjkl123 zxcvbnm12345 qwertyqwerty azertyazerty hello1234567 secret123456`
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase()),
);

const BASE_WORDS = ['password', 'motdepasse', 'azerty', 'qwerty', 'admin', 'welcome', 'bienvenue', 'knowlist', 'iloveyou', 'soleil', 'bonjour', 'letmein'];

export function isCommonPassword(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return true;
  // mot courant suivi/précédé uniquement de chiffres ou symboles
  const stripped = lower.replace(/[^a-z]/g, '');
  if (BASE_WORDS.includes(stripped)) return true;
  // un seul caractère répété, ou suite triviale
  if (/^(.)\1+$/.test(lower)) return true;
  if ('01234567890123456789'.includes(lower) || 'abcdefghijklmnopqrstuvwxyz'.includes(lower)) return true;
  return false;
}
