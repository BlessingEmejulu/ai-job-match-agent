/**
 * Conservative skill dictionary. Each canonical skill has one or more patterns. Patterns are
 * applied longest-canonical-first and every match is masked, so "React Native" never also counts
 * as "React", and "JavaScript" never counts as "Java". Ambiguous short tokens (Go, R, ML) are
 * matched case-sensitively and only in list-like contexts. Unknown skills are not guessed.
 */
interface SkillDef {
    name: string;
    patterns: RegExp[];
}

const ci = (src: string) => new RegExp(src, 'gi');
const cs = (src: string) => new RegExp(src, 'g');
const LIST_CTX = String.raw`(?=\s*(?:,|/|\)|;|\band\b|\bor\b|$))`;

const DEFS: SkillDef[] = [
    // Languages
    { name: 'JavaScript', patterns: [ci(String.raw`\bjavascript\b|\becmascript\b|\bES6\b`)] },
    { name: 'TypeScript', patterns: [ci(String.raw`\btypescript\b`)] },
    { name: 'Java', patterns: [ci(String.raw`\bjava\b(?!\s*script)`)] },
    { name: 'Python', patterns: [ci(String.raw`\bpython\b`)] },
    { name: 'Go', patterns: [ci(String.raw`\bgolang\b`), cs(String.raw`(?<=[,(/]\s?|\band\s|\bor\s)\bGo\b${LIST_CTX}`), cs(String.raw`\bGo\b(?=\s*(?:,|/)\s*(?:Java|Python|Rust|Ruby|Kotlin|Scala|C\+\+|TypeScript|JavaScript)\b)`)] },
    { name: 'Rust', patterns: [cs(String.raw`\bRust\b`)] },
    { name: 'C++', patterns: [ci(String.raw`(?<![\w+])c\+\+(?![\w+])`)] },
    { name: 'C#', patterns: [ci(String.raw`(?<![\w#])c#(?![\w#])`)] },
    { name: 'PHP', patterns: [ci(String.raw`\bphp\b`)] },
    { name: 'Ruby on Rails', patterns: [ci(String.raw`\bruby on rails\b|\brails\b`)] },
    { name: 'Ruby', patterns: [ci(String.raw`\bruby\b`)] },
    { name: 'Kotlin', patterns: [ci(String.raw`\bkotlin\b`)] },
    { name: 'Swift', patterns: [cs(String.raw`\bSwift(?:UI)?\b`)] },
    { name: 'Scala', patterns: [ci(String.raw`\bscala\b`)] },
    { name: 'R', patterns: [cs(String.raw`(?<=[,(/]\s?|\band\s|\bor\s)\bR\b${LIST_CTX}`), cs(String.raw`\bR\b(?=\s*(?:programming|language|studio))`)] },
    { name: 'SQL', patterns: [ci(String.raw`\bsql\b`)] },
    { name: 'Dart', patterns: [cs(String.raw`\bDart\b`)] },
    { name: 'Elixir', patterns: [ci(String.raw`\belixir\b`)] },
    { name: 'Solidity', patterns: [ci(String.raw`\bsolidity\b`)] },
    { name: 'Bash', patterns: [ci(String.raw`\bbash\b|\bshell scripting\b`)] },
    // Frontend / mobile
    { name: 'React Native', patterns: [ci(String.raw`\breact[\s-]native\b`)] },
    { name: 'React', patterns: [ci(String.raw`\breact(?:\.js|js)?\b`)] },
    { name: 'Next.js', patterns: [ci(String.raw`\bnext\.?js\b`)] },
    { name: 'Vue.js', patterns: [ci(String.raw`\bvue(?:\.js|js)?\b`)] },
    { name: 'Angular', patterns: [ci(String.raw`\bangular(?:js)?\b`)] },
    { name: 'Svelte', patterns: [ci(String.raw`\bsvelte(?:kit)?\b`)] },
    { name: 'HTML', patterns: [ci(String.raw`\bhtml5?\b`)] },
    { name: 'CSS', patterns: [ci(String.raw`\bcss3?\b`)] },
    { name: 'Tailwind CSS', patterns: [ci(String.raw`\btailwind(?:\s?css)?\b`)] },
    { name: 'Flutter', patterns: [ci(String.raw`\bflutter\b`)] },
    { name: 'Android', patterns: [ci(String.raw`\bandroid\b`)] },
    { name: 'iOS', patterns: [ci(String.raw`\bios\b`)] },
    // Backend
    { name: 'Node.js', patterns: [ci(String.raw`\bnode(?:\.js|js)\b`)] },
    { name: 'Express', patterns: [ci(String.raw`\bexpress(?:\.js|js)\b`)] },
    { name: 'NestJS', patterns: [ci(String.raw`\bnest(?:\.js|js)\b`)] },
    { name: 'Django', patterns: [ci(String.raw`\bdjango\b`)] },
    { name: 'Flask', patterns: [ci(String.raw`\bflask\b`)] },
    { name: 'FastAPI', patterns: [ci(String.raw`\bfastapi\b`)] },
    { name: 'Spring Boot', patterns: [ci(String.raw`\bspring[\s-]?boot\b`)] },
    { name: 'Spring', patterns: [ci(String.raw`\bspring\b(?=\s*(?:framework|,|/|\)))`)] },
    { name: 'Laravel', patterns: [ci(String.raw`\blaravel\b`)] },
    { name: '.NET', patterns: [ci(String.raw`(?<![\w.])\.net\b|\bdotnet\b|\basp\.net\b`)] },
    { name: 'GraphQL', patterns: [ci(String.raw`\bgraphql\b`)] },
    { name: 'REST APIs', patterns: [ci(String.raw`\brest(?:ful)?\s*(?:apis?|services|web services)\b`)] },
    { name: 'gRPC', patterns: [ci(String.raw`\bgrpc\b`)] },
    { name: 'Microservices', patterns: [ci(String.raw`\bmicro-?services?\b`)] },
    // Data
    { name: 'PostgreSQL', patterns: [ci(String.raw`\bpostgres(?:ql)?\b`)] },
    { name: 'MySQL', patterns: [ci(String.raw`\bmysql\b`)] },
    { name: 'MongoDB', patterns: [ci(String.raw`\bmongo(?:db)?\b`)] },
    { name: 'Redis', patterns: [ci(String.raw`\bredis\b`)] },
    { name: 'Elasticsearch', patterns: [ci(String.raw`\belastic\s?search\b`)] },
    { name: 'Kafka', patterns: [ci(String.raw`\bkafka\b`)] },
    { name: 'RabbitMQ', patterns: [ci(String.raw`\brabbitmq\b`)] },
    { name: 'Snowflake', patterns: [cs(String.raw`\bSnowflake\b`)] },
    { name: 'BigQuery', patterns: [ci(String.raw`\bbig\s?query\b`)] },
    { name: 'dbt', patterns: [ci(String.raw`\bdbt\b`)] },
    { name: 'Airflow', patterns: [ci(String.raw`\bairflow\b`)] },
    { name: 'Apache Spark', patterns: [ci(String.raw`\b(?:apache\s|py)?spark\b`)] },
    { name: 'Pandas', patterns: [ci(String.raw`\bpandas\b`)] },
    { name: 'NumPy', patterns: [ci(String.raw`\bnumpy\b`)] },
    { name: 'scikit-learn', patterns: [ci(String.raw`\bscikit[\s-]learn\b|\bsklearn\b`)] },
    { name: 'TensorFlow', patterns: [ci(String.raw`\btensorflow\b`)] },
    { name: 'PyTorch', patterns: [ci(String.raw`\bpytorch\b`)] },
    { name: 'Machine Learning', patterns: [ci(String.raw`\bmachine[\s-]learning\b`), cs(String.raw`\bML\b`)] },
    { name: 'Deep Learning', patterns: [ci(String.raw`\bdeep[\s-]learning\b`)] },
    { name: 'LLMs', patterns: [cs(String.raw`\bLLMs?\b`), ci(String.raw`\blarge language models?\b`)] },
    { name: 'NLP', patterns: [cs(String.raw`\bNLP\b`), ci(String.raw`\bnatural language processing\b`)] },
    { name: 'Computer Vision', patterns: [ci(String.raw`\bcomputer vision\b`)] },
    { name: 'Data Analysis', patterns: [ci(String.raw`\bdata analy(?:sis|tics)\b`)] },
    { name: 'Data Visualization', patterns: [ci(String.raw`\bdata visuali[sz]ation\b`)] },
    { name: 'Statistics', patterns: [ci(String.raw`\bstatistic(?:s|al)\b`)] },
    { name: 'Tableau', patterns: [ci(String.raw`\btableau\b`)] },
    { name: 'Power BI', patterns: [ci(String.raw`\bpower\s?bi\b`)] },
    { name: 'Looker', patterns: [cs(String.raw`\bLooker\b`)] },
    { name: 'Excel', patterns: [ci(String.raw`\b(?:microsoft |ms[\s-])?excel\b(?!\s+(?:at|in)\b)`)] },
    // Cloud / DevOps
    { name: 'AWS', patterns: [ci(String.raw`\baws\b|\bamazon web services\b`)] },
    { name: 'GCP', patterns: [ci(String.raw`\bgcp\b|\bgoogle cloud(?: platform)?\b`)] },
    { name: 'Azure', patterns: [ci(String.raw`\bazure\b`)] },
    { name: 'Docker', patterns: [ci(String.raw`\bdocker\b`)] },
    { name: 'Kubernetes', patterns: [ci(String.raw`\bkubernetes\b|\bk8s\b`)] },
    { name: 'Terraform', patterns: [ci(String.raw`\bterraform\b`)] },
    { name: 'Ansible', patterns: [ci(String.raw`\bansible\b`)] },
    { name: 'CI/CD', patterns: [ci(String.raw`\bci\s*/\s*cd\b`)] },
    { name: 'GitHub Actions', patterns: [ci(String.raw`\bgithub actions\b`)] },
    { name: 'Jenkins', patterns: [ci(String.raw`\bjenkins\b`)] },
    { name: 'Git', patterns: [ci(String.raw`\bgit\b`)] },
    { name: 'Linux', patterns: [ci(String.raw`\blinux\b`)] },
    { name: 'Ubuntu', patterns: [ci(String.raw`\bubuntu\b`)] },
    { name: 'OpenStack', patterns: [ci(String.raw`\bopenstack\b`)] },
    { name: 'Embedded Systems', patterns: [ci(String.raw`\bembedded (?:systems?|software|c|linux)\b`)] },
    // Testing
    { name: 'Test Automation', patterns: [ci(String.raw`\btest automation\b|\bautomated testing\b`)] },
    { name: 'Selenium', patterns: [ci(String.raw`\bselenium\b`)] },
    { name: 'Cypress', patterns: [cs(String.raw`\bCypress\b`)] },
    { name: 'Jest', patterns: [cs(String.raw`\bJest\b`)] },
    // Web3
    { name: 'Blockchain', patterns: [ci(String.raw`\bblockchain\b`)] },
    { name: 'Web3', patterns: [ci(String.raw`\bweb3\b`)] },
    // Design / product
    { name: 'Figma', patterns: [ci(String.raw`\bfigma\b`)] },
    { name: 'UI/UX Design', patterns: [ci(String.raw`\bui\s*/\s*ux\b|\bux design\b|\buser experience design\b|\bui design\b`)] },
    { name: 'User Research', patterns: [ci(String.raw`\buser research\b|\bux research\b`)] },
    { name: 'Product Management', patterns: [ci(String.raw`\bproduct management\b`)] },
    { name: 'Project Management', patterns: [ci(String.raw`\bproject management\b`)] },
    { name: 'Agile', patterns: [ci(String.raw`\bagile\b`)] },
    { name: 'Scrum', patterns: [ci(String.raw`\bscrum\b`)] },
    { name: 'Jira', patterns: [ci(String.raw`\bjira\b`)] },
    // Business
    { name: 'Salesforce', patterns: [ci(String.raw`\bsalesforce\b`)] },
    { name: 'HubSpot', patterns: [ci(String.raw`\bhubspot\b`)] },
    { name: 'SEO', patterns: [ci(String.raw`\bseo\b`)] },
    { name: 'Content Marketing', patterns: [ci(String.raw`\bcontent marketing\b`)] },
    { name: 'Social Media Marketing', patterns: [ci(String.raw`\bsocial media (?:marketing|management)\b`)] },
    { name: 'Copywriting', patterns: [ci(String.raw`\bcopywriting\b`)] },
    { name: 'Customer Support', patterns: [ci(String.raw`\bcustomer (?:support|service)\b`)] },
    { name: 'Account Management', patterns: [ci(String.raw`\baccount management\b`)] },
    { name: 'Business Development', patterns: [ci(String.raw`\bbusiness development\b`)] },
    { name: 'Stakeholder Management', patterns: [ci(String.raw`\bstakeholder management\b`)] },
    { name: 'Financial Modeling', patterns: [ci(String.raw`\bfinancial model(?:l)?ing\b`)] },
    { name: 'Accounting', patterns: [ci(String.raw`\baccounting\b`)] },
    { name: 'Risk Management', patterns: [ci(String.raw`\brisk management\b`)] },
    { name: 'KYC/AML', patterns: [cs(String.raw`\bKYC\b|\bAML\b`), ci(String.raw`\banti[\s-]money laundering\b`)] },
    { name: 'Communication', patterns: [ci(String.raw`\b(?:excellent |strong |good )?(?:written and verbal|verbal and written|written|verbal) communication\b|\bcommunication skills\b`)] },
    { name: 'Microsoft Office', patterns: [ci(String.raw`\bmicrosoft office\b|\bms office\b`)] },
    { name: 'Google Workspace', patterns: [ci(String.raw`\bgoogle (?:workspace|suite|sheets)\b|\bg suite\b`)] },
];

// Longest canonical names first so multi-word skills mask their substrings.
const ORDERED = [...DEFS].sort((a, b) => b.name.length - a.name.length);
const BY_LOWER = new Map(DEFS.map((d) => [d.name.toLowerCase(), d.name]));

export interface SkillHit {
    skill: string;
    match: string;
    index: number;
}

/** Extract canonical skills from a line of text. Order of first appearance is preserved. */
export function extractSkills(text: string): SkillHit[] {
    let masked = text;
    const hits: { skill: string; match: string; index: number }[] = [];
    for (const def of ORDERED) {
        for (const re of def.patterns) {
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(masked)) !== null) {
                if (m[0].length === 0) {
                    re.lastIndex++;
                    continue;
                }
                hits.push({ skill: def.name, match: m[0], index: m.index });
                masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice(m.index + m[0].length);
            }
        }
    }
    hits.sort((a, b) => a.index - b.index);
    const seen = new Set<string>();
    const out: SkillHit[] = [];
    for (const h of hits) {
        if (seen.has(h.skill)) continue;
        seen.add(h.skill);
        out.push({ skill: h.skill, match: h.match, index: h.index });
    }
    return out;
}

/**
 * Canonicalize a user-declared or AI-extracted skill. Known aliases map to the dictionary name;
 * unknown skills are kept verbatim (trimmed) so they can still match identically named skills.
 */
export function canonicalizeSkill(raw: string): string {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    const direct = BY_LOWER.get(trimmed.toLowerCase());
    if (direct) return direct;
    const hits = extractSkills(trimmed);
    // Only accept an alias when it covers essentially the whole string ("reactjs" -> React),
    // not when it is a substring of something longer ("react testing library").
    if (hits.length === 1 && hits[0]!.match.replace(/\s+/g, '').length >= trimmed.replace(/[\s.]+/g, '').length - 1) {
        return hits[0]!.skill;
    }
    return trimmed;
}

export function skillKey(skill: string): string {
    return canonicalizeSkill(skill).toLowerCase();
}

export const KNOWN_SKILLS = DEFS.map((d) => d.name);
