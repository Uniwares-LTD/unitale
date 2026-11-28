// Offline consumer tooling; copy unchanged alongside handbook.mjs.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const read = file => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const core = ['capture-project-learnings', 'compile-feature-spec', 'manage-issues', 'maintain-docs', 'maintain-project', 'review-change', 'sync-docs-issues', 'work-on-task'];
export const mapSections = ['Components', 'Documentation', 'Commands', 'Generated areas', 'Ownership'];
export const languages = ['English', 'Persian'];
export const integrationBranches = ['main', 'dev'];
// Durable branches: one integration branch, plus deployment branches promoted along a chain.
export function branchWarnings(text) {
  const integration = text.match(/^- Integration branch: (.+)$/m)?.[1]?.trim();
  if (!integrationBranches.includes(integration)) return [`Set "- Integration branch:" to ${integrationBranches.join(' or ')}.`];
  const deployment = text.match(/^- Deployment branches: (.+)$/m)?.[1]?.trim();
  if (deployment === undefined) return ['Add "- Deployment branches:" listing `_<environment> (from <source>)` entries, or none.'];
  if (deployment === 'none') return [];
  const known = [integration], warnings = [];
  for (const entry of deployment.split(',').map(e => e.trim())) {
    const match = entry.match(/^(_[a-z0-9-]+) \(from ([\w-]+)\)$/);
    if (!match) { warnings.push(`Deployment branch "${entry}" must be written as _<environment> (from <source>).`); continue; }
    if (known.includes(match[1])) warnings.push(`Deployment branch ${match[1]} is listed twice.`);
    else if (!known.includes(match[2])) warnings.push(`Deployment branch ${match[1]} must come from ${integration} or an earlier listed deployment branch.`);
    known.push(match[1]);
  }
  return warnings;
}
function local(root, reference) {
  if (typeof reference !== 'string' || !reference || reference.includes('\\') || reference.includes(':')) throw new Error('Use a repository-relative reference.');
  const [file, anchor] = reference.split('#');
  const target = path.resolve(root, file);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Reference must stay within the repository.');
  // Reject symlink parents as well as symlink files, including write destinations.
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Symlink references are not supported.');
  }
  return { target, anchor };
}
const anchorOf = heading => heading.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().replace(/ /g, '-');
function document(root, reference) {
  const { target, anchor } = local(root, reference);
  let text = read(target);
  if (anchor) {
    const lines = text.split('\n');
    const start = lines.findIndex(line => /^#{1,6} /.test(line) && anchorOf(line.replace(/^#+ /, '')) === anchor);
    if (start < 0) throw new Error(`Missing section #${anchor}`);
    const depth = lines[start].match(/^#+/)[0].length;
    const tail = lines.slice(start + 1);
    const end = tail.findIndex(line => /^#{1,6} /.test(line) && line.match(/^#+/)[0].length <= depth);
    text = lines[start] + '\n' + (end < 0 ? tail : tail.slice(0, end)).join('\n');
  }
  return { text, target };
}
function configAt(root) {
  const config = JSON.parse(read(local(root, 'handbook.json').target));
  for (const key of ['claudeSessionStartRouting', 'agentsSessionContract']) {
    if (config[key] !== undefined && (config.kind !== 'consumer' || typeof config[key] !== 'boolean')) {
      throw new Error(`${key} must be a boolean in consumer handbook.json.`);
    }
  }
  if (config.agentTierPilot !== undefined && typeof config.agentTierPilot !== 'boolean') {
    throw new Error('agentTierPilot must be a boolean in handbook.json.');
  }
  if (config.version !== 1 || !['source', 'consumer'].includes(config.kind) || !Array.isArray(config.technologySkills) || config.technologySkills.some(name => typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name))) throw new Error('Invalid handbook.json: require version 1, kind source|consumer, and technologySkills array.');
  return config;
}
export function checkReadiness(root) {
  root = path.resolve(root);
  const warnings = [];
  let config;
  try { config = configAt(root); } catch (error) { return { ready: false, warnings: [`handbook.json: ${error.message}`] }; }
  if (config.kind === 'consumer' && config.tracking === undefined) warnings.push('handbook.json: record a tracking project selection (organization-wide by default); see docs/project.md.');
  if (config.tracking !== undefined) {
    try {
      const tracking = JSON.parse(read(local(root, config.tracking).target));
      if (!tracking || (tracking.version !== undefined && tracking.version !== 1) ||
          (tracking.provider !== undefined && tracking.provider !== 'github') ||
          typeof tracking.organization !== 'string' || !tracking.organization ||
          !Array.isArray(tracking.repositories) || !tracking.repositories.length ||
          tracking.repositories.some(r => typeof r !== 'string' || !/^[A-Za-z0-9-]+\/[\w.-]+$/.test(r) || r.split('/')[0].toLowerCase() !== tracking.organization.toLowerCase())) throw new Error('Invalid organization/repository selection.');
      if (tracking.number !== undefined && (!Number.isSafeInteger(tracking.number) || tracking.number < 1 || tracking.url !== `https://github.com/orgs/${tracking.organization}/projects/${tracking.number}`)) throw new Error('Project number/URL mismatch.');
      if (tracking.policy) document(root, tracking.policy);
    } catch (error) { warnings.push(`tracking: ${error.message}`); }
  }
  if (config.preferences === undefined) {
    if (config.kind === 'consumer') warnings.push('handbook.json: record repository preferences, including the issue language (English by default); see docs/project-guidance.md.');
  } else {
    let text;
    try { text = document(root, config.preferences).text; } catch (error) { warnings.push(`preferences: ${error.message}`); }
    if (text !== undefined) {
      const value = text.match(/^- Issue language: (.+)$/m)?.[1]?.trim();
      if (!languages.includes(value)) warnings.push(`preferences: Set "- Issue language:" to one of ${languages.join(', ')}.`);
      warnings.push(...branchWarnings(text).map(w => `preferences: ${w}`));
    }
  }
  for (const key of ['guidance', 'sourceMap']) {
    try {
      const { text, target } = document(root, config[key]);
      if (!text.trim()) throw new Error('Document is empty.');
      if (key === 'sourceMap') for (const heading of mapSections) {
        const lines = text.split('\n'), index = lines.findIndex(line => /^#{1,6} /.test(line) && line.replace(/^#+ /, '').trim() === heading);
        const end = lines.findIndex((line, i) => i > index && /^#{1,6} /.test(line));
        if (index < 0 || !lines.slice(index + 1, end < 0 ? undefined : end).some(line => line.trim())) warnings.push(`${config[key]}: add a nonempty ${heading} section (explicit unknowns are allowed).`);
      }
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const ref = match[1];
        if (/^[a-z]+:\/\//i.test(ref) || ref.startsWith('mailto:')) continue;
        const [file, anchor] = ref.split('#');
        const relative = path.relative(root, path.resolve(path.dirname(target), file || path.basename(target))).split(path.sep).join('/');
        const checked = local(root, relative + (anchor ? '#' + anchor : ''));
        if (!existsSync(checked.target)) throw new Error(`Broken reference: ${ref}`);
        if (anchor && checked.target.endsWith('.md')) document(root, relative + '#' + anchor);
      }
    } catch (error) { warnings.push(`${key}: ${error.message}`); }
  }
  try {
    const agents = read(local(root, 'AGENTS.md').target);
    for (const ref of [config.guidance, config.sourceMap]) if (typeof ref !== 'string' || !agents.includes(ref)) warnings.push(`AGENTS.md must route to ${ref || 'local guidance and source map'}.`);
    if (!agents.includes('handbook:check') && !agents.includes('scripts/handbook.mjs')) warnings.push('AGENTS.md must describe the Handbook baseline command.');
  } catch (error) { warnings.push(`AGENTS.md: ${error.message}`); }
  for (const name of [...core, ...config.technologySkills]) {
    try { metadata(read(local(root, `.agents/skills/${name}/SKILL.md`).target), name); }
    catch (error) { warnings.push(`Skill ${name}: ${error.message}`); }
  }
  if (config.kind === 'consumer') warnings.push(...bootstrapWarnings(root));
  if (config.kind === 'consumer') {
    try { syncClaudeRouting(root, config.claudeSessionStartRouting !== false, { warnings, changed: [] }); }
    catch (error) { warnings.push(`Claude workflow routing: ${error.message}`); }
    try { syncSessionContract(root, config.agentsSessionContract !== false, { warnings, changed: [] }); }
    catch (error) { warnings.push(`Session contract: ${error.message}`); }
  }
  return { ready: warnings.length === 0, warnings };
}
function metadata(text, name) {
  if (!text.startsWith('---\n')) throw new Error('Missing skill frontmatter.');
  const front = text.split('\n---\n')[0];
  const scalar = key => {
    const raw = front.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];
    if (!raw) throw new Error(`Missing ${key}.`);
    return raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/^'|'$/g, '');
  };
  if (scalar('name') !== name) throw new Error('Skill identity does not match directory.');
  const hint = front.match(/^argument-hint: (.+)$/m)?.[1];
  return { name, description: scalar('description'), userInvocable: front.match(/^user-invocable: (true|false)$/m)?.[1], argumentHint: hint && (hint.startsWith('"') ? JSON.parse(hint) : hint) };
}
function entry(meta, body) {
  const text = `---\nname: ${meta.name}\ndescription: ${JSON.stringify(meta.description)}\n${meta.argumentHint ? `argument-hint: ${JSON.stringify(meta.argumentHint)}\n` : ''}${meta.userInvocable ? `user-invocable: ${meta.userInvocable}\n` : ''}---\n\n${body}\n`;
  return text + `<!-- handbook-managed:${sha(text)} -->\n`;
}
export const bootstrapFile = '.agents/handbook.md';
const bootstrapSource = 'docs/consumer-bootstrap.md';
function managed(text) {
  return text + `<!-- handbook-managed:${sha(text)} -->\n`;
}
function bootstrapWarnings(root) {
  const usesBootstrap = existsSync(path.join(root, '.agents/skills')) &&
    readdirSync(path.join(root, '.agents/skills'), { withFileTypes: true }).some(item => {
      if (!item.isDirectory()) return false;
      const file = local(root, `.agents/skills/${item.name}/SKILL.md`).target;
      return existsSync(file) && read(file).includes('[Handbook bootstrap](../../handbook.md)');
    });
  if (!usesBootstrap) return []; // Legacy consumers keep their self-contained wrappers.
  const file = local(root, bootstrapFile).target;
  if (!existsSync(file)) return [`Missing ${bootstrapFile}; restore it from a reviewed snapshot with handbook:sync -- --source SNAPSHOT before using slim entrypoints.`];
  const match = read(file).match(/^([\s\S]*?)<!-- handbook-managed:([a-f0-9]{64}) -->\n([\s\S]*)$/);
  if (!match || sha(match[1]) !== match[2]) return [`Customized/unmanaged ${bootstrapFile}; reconcile its bootstrap instructions manually before using slim entrypoints.`];
  return [];
}
function sharedEntry(meta) {
  return entry(meta, `Read and follow the local [Handbook bootstrap](../../handbook.md).\nUse the task's retained Handbook path and full revision; do not select a new baseline.\nThen read \`.agents/skills/${meta.name}/SKILL.md\` at that revision and follow its\nrelevant references. Shared guidance does not expand the task's authority.`);
}

function claudeEntry(meta) {
  return entry(meta, `Read and follow the canonical local entrypoint\n[${meta.name}](../../../.agents/skills/${meta.name}/SKILL.md).\nResolve its relative references from that canonical file, not this wrapper.\nFor shared guidance, retain the task's Handbook revision through continuation.\nThis reference grants no hooks, tools, permissions, or delegation authority.`);
}
const reviewerContract = '.agents/agents/reviewer.md';
const reviewerWrapper = '.claude/agents/reviewer.md';
const sharedReviewerRoute = 'Resolve the shared Handbook reviewer from the task handoff.';

function otherNativeReviewer(root, reviewerPath) {
  const directory = local(root, '.claude/agents').target;
  if (!existsSync(directory)) return;
  for (const item of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!item.isFile() || !item.name.endsWith('.md')) continue;
    const file = path.join(item.parentPath, item.name);
    if (file === reviewerPath) continue;
    const front = read(file).match(/^---[ \t]*\n([\s\S]*?)^---[ \t]*$/m);
    if (front?.index === 0 && /^name\s*:\s*(?:reviewer|"reviewer"|'reviewer')(?:[ \t]+#.*)?[ \t]*$/m.test(front[1])) {
      return path.relative(root, file);
    }
  }
}

function agentEntry(meta, { shared = false, pilot = false } = {}) {
  const model = pilot ? 'model: sonnet\n' : '';
  const route = shared ? [
    sharedReviewerRoute,
    'Use the retained Handbook path and full revision. Read `.agents/agents/reviewer.md`',
    'with `git -C PATH show REVISION:.agents/agents/reviewer.md` or from its validated',
    'resource snapshot. Resolve its references from that same revision.',
    'Return a missing baseline to the parent before reviewing.'
  ].join('\n') : `Follow the canonical role [${meta.name}](../../.agents/agents/${meta.name}.md).`;
  const text = `---\nname: ${meta.name}\ndescription: ${JSON.stringify(meta.description)}\n${model}tools: Read, Grep, Glob, Bash\n---\n\n${route}\nStay read-only: run only inspection commands; never edit files, commit, push, comment or\nchange issues or project metadata. This reference grants no permissions or authority.\n`;
  return text + `<!-- handbook-managed:${sha(text)} -->\n`;
}

function syncSharedReviewer(root, { source, bootstrapReady, write, pilot, put, warnings }) {
  try {
    const localRole = local(root, reviewerContract).target;
    const wrapperPath = local(root, reviewerWrapper).target;
    const nativeCollision = otherNativeReviewer(root, wrapperPath);
    if (existsSync(localRole) || nativeCollision) {
      const owner = nativeCollision ? `the reviewer name in ${nativeCollision}` : 'reviewer';
      warnings.push(`Consumer owns ${owner}; reconcile any duplicate and use a read-only handoff for shared Handbook review.`);
      return Boolean(nativeCollision);
    }
    if (!source) {
      if (!existsSync(wrapperPath)) return;
      const wrapper = read(wrapperPath);
      const managed = wrapper.match(/^([\s\S]*?)<!-- handbook-managed:([a-f0-9]{64}) -->\n/);
      if (wrapper.includes(sharedReviewerRoute) && (!managed || sha(managed[1]) !== managed[2])) {
        warnings.push('Preserved customized shared reviewer; reconcile it manually.');
      } else if (managed?.[1].includes(sharedReviewerRoute) && /^model: sonnet$/m.test(managed[1]) !== pilot) {
        warnings.push('Shared reviewer pilot drift; run handbook:sync with a reviewed source.');
      }
      return;
    }
    const sharedRole = local(source, reviewerContract).target;
    const contract = existsSync(sharedRole) ? read(sharedRole) : '';
    if (!contract.trim()) {
      warnings.push('Source lacks the shared reviewer contract; preserved existing reviewer entrypoints.');
    } else if (bootstrapReady || !write) {
      const meta = metadata(contract, 'reviewer');
      if (!put(reviewerWrapper, agentEntry(meta, { shared: true, pilot }))) {
        warnings.push('Reconcile reviewer entrypoint drift or use a read-only handoff for shared Handbook review.');
      }
    }
  } catch (error) {
    warnings.push(`Shared reviewer: ${error.message} Use a read-only handoff for shared Handbook review.`);
    return true;
  }
}

function reviewerPilot(root, requested, warnings) {
  if (!requested) return false;
  try {
    for (const file of ['.claude/settings.json', '.claude/settings.local.json']) {
      const settings = local(root, file).target;
      if (existsSync(settings) && JSON.parse(read(settings)).env?.CLAUDE_CODE_SUBAGENT_MODEL) {
        warnings.push(`Reviewer tier pilot deferred to the configured Claude subagent model in ${file}.`);
        return false;
      }
    }
    return true;
  } catch (error) {
    warnings.push(`Reviewer tier pilot could not verify Claude settings: ${error.message}`);
  }
  return false;
}

export function syncEntrypoints(root, { write = false, source } = {}) {
  root = path.resolve(root);
  const warnings = [], changed = [];
  let config;
  try { config = configAt(root); } catch (error) { return { warnings: [error.message], changed }; }
  const pilot = reviewerPilot(root, config.agentTierPilot === true, warnings);
  // An empty skill tree means a wrong --root or --source; never sync or report orphans from it.
  const hasSkills = base => existsSync(path.join(base, '.agents/skills')) && readdirSync(path.join(base, '.agents/skills'), { withFileTypes: true }).some(item => item.isDirectory());
  if (config.kind === 'consumer' && source ? !hasSkills(source) : !hasSkills(root)) throw new Error('No skills found under .agents/skills; check --root and --source before syncing.');
  const put = (relative, wanted) => {
    const { target } = local(root, relative);
    const old = existsSync(target) ? read(target) : '';
    if (old.startsWith(wanted)) return true;
    warnings.push(`Entrypoint drift: ${relative}`);
    if (!write) return false;
    let suffix = '';
    if (old) {
      const match = old.match(/^([\s\S]*?)<!-- handbook-managed:([a-f0-9]{64}) -->\n([\s\S]*)$/);
      if (!match || sha(match[1]) !== match[2]) { warnings.push(`Preserved customized/unmanaged file: ${relative}; reconcile manually.`); return false; }
      suffix = match[3];
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, wanted + suffix);
    changed.push(relative);
    return true;
  };
  let bootstrapReady = false;
  // Consumer upgrades explicitly select a committed resource snapshot as source.
  if (config.kind === 'consumer' && source) {
    source = realpathSync(source);
    const contract = JSON.parse(read(path.join(source, 'handbook-contract.json')));
    if (contract.protocolVersion !== 1) throw new Error('Unsupported source contract.');
    const bootstrap = path.join(source, bootstrapSource);
    // Never migrate wrappers unless their prerequisite exists and is intact.
    const bootstrapText = existsSync(bootstrap) ? read(bootstrap) : '';
    bootstrapReady = Boolean(bootstrapText.trim()) && put(bootstrapFile, managed(bootstrapText));
    if (existsSync(bootstrap) && !bootstrapText.trim()) warnings.push(`Empty ${bootstrapSource}; preserve existing entrypoints and repair the source.`);
    if (!existsSync(bootstrap)) warnings.push(`Source lacks ${bootstrapSource}; preserve existing entrypoints and use a compatible reviewed snapshot.`);
    if (!bootstrapReady) warnings.push('Consumer skill migration deferred until the managed bootstrap is synchronized.');
    for (const name of new Set([...core, ...config.technologySkills])) {
      if (!contract.skills.includes(name)) { warnings.push(`Unknown shared skill: ${name}`); continue; }
      const meta = metadata(read(local(source, `.agents/skills/${name}/SKILL.md`).target), name);
      if (bootstrapReady || !write) put(`.agents/skills/${name}/SKILL.md`, sharedEntry(meta));
    }
  }
  const preserveNativeReviewer = config.kind === 'consumer' &&
    syncSharedReviewer(root, { source, bootstrapReady, write, pilot, put, warnings });
  const directory = local(root, '.agents/skills').target;
  if (existsSync(directory)) for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    let meta;
    try {
      meta = metadata(read(local(root, `.agents/skills/${item.name}/SKILL.md`).target), item.name);
    } catch (error) { warnings.push(`${item.name}: ${error.message}`); continue; }
    put(`.claude/skills/${item.name}/SKILL.md`, claudeEntry(meta));
  }
  // Roles with frontmatter become optional read-only Claude subagents; others stay links.
  const roles = local(root, '.agents/agents').target;
  if (existsSync(roles)) for (const item of readdirSync(roles, { withFileTypes: true })) {
    if (!item.isFile() || !item.name.endsWith('.md')) continue;
    if (preserveNativeReviewer && item.name === 'reviewer.md') continue;
    const text = read(path.join(roles, item.name));
    if (!text.startsWith('---\n')) continue;
    let meta;
    try { meta = metadata(text, item.name.slice(0, -3)); } catch (error) { warnings.push(`${item.name}: ${error.message}`); continue; }
    put(`.claude/agents/${meta.name}.md`, agentEntry(meta, {
      pilot: config.kind === 'source' && meta.name === 'reviewer' && pilot
    }));
  }
  const claudeDir = local(root, '.claude/skills').target;
  if (existsSync(claudeDir)) for (const item of readdirSync(claudeDir, { withFileTypes: true })) {
    if (item.isDirectory() && !existsSync(local(root, `.agents/skills/${item.name}/SKILL.md`).target)) warnings.push(`Orphan Claude entrypoint: ${item.name}; review removal manually.`);
  }
  const claude = local(root, 'CLAUDE.md').target;
  const old = existsSync(claude) ? read(claude) : '';
  if (!/^@AGENTS\.md\s*$/m.test(old)) {
    warnings.push('CLAUDE.md must import @AGENTS.md.');
    if (write) { writeFileSync(claude, '@AGENTS.md\n\n' + old); changed.push('CLAUDE.md'); }
  }
  if (config.kind === 'consumer') warnings.push(...bootstrapWarnings(root));
  syncGates(root, { write, source: config.kind === 'consumer' ? source : undefined, warnings, changed });
  if (config.kind === 'consumer') {
    // Both default on: the guidance must reach a session without a voluntary read.
    syncClaudeRouting(root, config.claudeSessionStartRouting !== false, { write, source, warnings, changed });
    syncSessionContract(root, config.agentsSessionContract !== false, { write, source, warnings, changed });
  }
  return { warnings, changed };
}

const routingMarker = 'Handbook workflow routing';
const routingGuide = 'docs/guidance/communication.md';
const routingLimit = 10000;
const routingHeading = '## Workflow adherence\n';
const contractHeading = '## Session contract\n';
const contractLimit = 1500;
const guideSection = (text, heading) => text.split(/^(?=#{1,2} )/m).find(part => part.startsWith(heading))?.trim() ?? '';
const filledSection = (text, heading) => guideSection(text, heading).slice(heading.length).trim().length > 0;
// Startup context carries the whole guide: session contract, reply format and adherence rules.
const validRoutingText = text => typeof text === 'string' && text.length + 1 < routingLimit &&
  filledSection(text, routingHeading);

function routingHook(section) {
  // The reviewed routing text is data to a fixed Node program, with no shell expansion.
  return { hooks: [{ type: 'command', command: 'node', args: [
    '-e', 'process.stdout.write(Buffer.from(process.argv[2], "base64").toString("utf8") + "\\n")',
    routingMarker + ':' + sha(section), Buffer.from(section).toString('base64')
  ] }] };
}

function routingEntry(entry) {
  return Array.isArray(entry?.hooks) && entry.hooks.some(hook =>
    Array.isArray(hook?.args) && hook.args.some(arg => typeof arg === 'string' && arg.startsWith(routingMarker + ':')));
}

function intactRouting(entry) {
  const encoded = entry?.hooks?.[0]?.args?.[3];
  if (typeof encoded !== 'string' || encoded.length > routingLimit * 4) return false;
  const section = Buffer.from(encoded, 'base64').toString('utf8');
  if (!validRoutingText(section)) return false;
  const expected = routingHook(section);
  const hook = entry.hooks[0];
  return Object.keys(entry).length === 1 && entry.hooks.length === 1 &&
    Object.keys(hook).length === 3 && hook.type === 'command' && hook.command === 'node' &&
    JSON.stringify(hook.args) === JSON.stringify(expected.hooks[0].args);
}

function syncClaudeRouting(root, enabled, { write, source, warnings, changed }) {
  const relative = '.claude/settings.json';
  const target = local(root, relative).target;
  const settings = existsSync(target) ? JSON.parse(read(target)) : {};
  if (settings.hooks !== undefined && (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks))) {
    warnings.push(relative + ': hooks must be an object; reconcile manually.');
    return;
  }
  const starts = settings.hooks?.SessionStart ?? [];
  if (!Array.isArray(starts)) { warnings.push(relative + ': SessionStart must be a list.'); return; }
  const managed = starts.filter(routingEntry);
  if (managed.some(entry => !intactRouting(entry))) {
    warnings.push(relative + ': preserved customized Handbook workflow routing hook; reconcile it manually.');
    return;
  }
  let wanted;
  if (enabled && source) {
    const guide = path.join(source, routingGuide);
    const section = existsSync(guide) ? read(guide).trim() : '';
    if (!validRoutingText(section)) {
      warnings.push(routingGuide + ': expected a Workflow adherence section under 10000 characters; preserved existing routing.');
      return;
    }
    wanted = routingHook(section);
  } else if (enabled && !managed.length) {
    warnings.push(relative + ': run handbook:sync with a reviewed source to install workflow routing.');
    return;
  } else if (enabled) {
    wanted = managed[0];
  }
  if (managed.length === (wanted ? 1 : 0) && (!wanted || JSON.stringify(managed[0]) === JSON.stringify(wanted))) return;
  warnings.push(relative + ': Handbook workflow routing drift.');
  if (!write) return;
  const next = starts.filter(entry => !routingEntry(entry));
  if (wanted) next.push(wanted);
  const hooks = { ...settings.hooks };
  if (next.length) hooks.SessionStart = next;
  else delete hooks.SessionStart;
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(settings, null, 2) + '\n');
  if (!changed.includes(relative)) changed.push(relative);
}

const contractStart = '<!-- handbook-session-contract:start -->';
// Blank lines inside the markers keep the block stable under Markdown formatters such as
// Prettier; earlier blocks without them still match and are rewritten on the next sync.
const contractBlock = /<!-- handbook-session-contract:start -->\n+([\s\S]*?)\n+<!-- handbook-session-contract:end ([a-f0-9]{64}) -->\n?/;
// AGENTS.md is the one file every client loads, so the contract is inlined, not linked.
function syncSessionContract(root, enabled, { write, source, warnings, changed }) {
  const relative = 'AGENTS.md';
  const target = local(root, relative).target;
  if (!existsSync(target)) return;
  const text = read(target);
  const match = text.match(contractBlock);
  if (match && sha(match[1]) !== match[2]) {
    warnings.push(relative + ': preserved customized Handbook session contract; reconcile it manually.');
    return;
  }
  let wanted = '';
  if (enabled) {
    if (!source) {
      if (!match) warnings.push(relative + ': run handbook:sync with a reviewed source to install the session contract.');
      return;
    }
    const guide = path.join(source, routingGuide);
    const section = existsSync(guide) ? guideSection(read(guide), contractHeading) : '';
    if (!filledSection(section, contractHeading) || section.length > contractLimit) {
      warnings.push(`${routingGuide}: expected a Session contract section within ${contractLimit} characters; preserved ${relative}.`);
      return;
    }
    wanted = `${contractStart}\n\n${section}\n\n<!-- handbook-session-contract:end ${sha(section)} -->\n`;
  }
  const current = match ? match[0].replace(/\n?$/, '\n') : '';
  if (current === wanted) return;
  warnings.push(relative + ': Handbook session contract drift.');
  if (!write) return;
  let next;
  if (match && wanted) next = text.replace(match[0], () => wanted);
  else if (match) next = text.replace(match[0] + (text.slice(text.indexOf(match[0]) + match[0].length).startsWith('\n') ? '\n' : ''), '');
  else {
    // Keep a byte-order mark and YAML front matter first, then any title heading.
    const bom = text.startsWith('﻿') ? '﻿' : '';
    let at = bom.length;
    const front = text.slice(at).match(/^---\n[\s\S]*?\n---\n/);
    if (front) at += front[0].length;
    if (text.startsWith('# ', at)) at = (text.indexOf('\n', at) + 1) || text.length;
    const head = text.slice(0, at);
    const tail = text.slice(at).replace(/^\n+/, '');
    next = (at > bom.length ? head.replace(/\n?$/, '\n') + '\n' : head) + wanted + (tail ? '\n' + tail : '');
  }
  // Preserve the file's line endings; read() normalizes them for comparison.
  if (readFileSync(target, 'utf8').includes('\r\n')) next = next.replace(/\n/g, '\r\n');
  writeFileSync(target, next);
  if (!changed.includes(relative)) changed.push(relative);
}

export const gatesFile = '.agents/gated-commands.json';
const commandList = list => Array.isArray(list) && !list.some(c => !Array.isArray(c) || !c.length || c.some(p => typeof p !== 'string' || !/^[\w.:/=-]+$/.test(p)));
function readGates(file) {
  const gates = JSON.parse(read(file));
  if (!commandList(gates.ask) || (gates.retired !== undefined && !commandList(gates.retired)) ||
      !Array.isArray(gates.denyRead) || gates.denyRead.some(p => typeof p !== 'string' || !p || /[()]/.test(p))) throw new Error(`${gatesFile}: expected ask and optional retired (command word lists) and denyRead (path patterns).`);
  return gates;
}
// Each gated command becomes ask rules for both shell tools, with and without arguments,
// so the bare command (for example `git push`) is gated too; each path a Read deny rule.
export function permissionEntries(gates) {
  return { ask: gates.ask.flatMap(c => ['Bash', 'PowerShell'].flatMap(tool => [`${tool}(${c.join(' ')})`, `${tool}(${c.join(' ')} *)`])), deny: gates.denyRead.map(p => `Read(${p})`) };
}
const union = (current, extra, key = v => v) => [...current, ...extra.filter(v => !current.some(c => key(c) === key(v)))];
function syncGates(root, { write, source, warnings, changed }) {
  const localGates = local(root, gatesFile).target;
  // Consumer upgrades merge the shared list add-only, keeping project-specific entries;
  // only commands the shared list explicitly retires are removed.
  if (source && existsSync(path.join(source, gatesFile))) {
    const shared = readGates(path.join(source, gatesFile));
    const current = existsSync(localGates) ? readGates(localGates) : { ask: [], denyRead: [] };
    const retired = new Set((shared.retired ?? []).map(c => c.join(' ')));
    const kept = current.ask.filter(c => !retired.has(c.join(' ')));
    const merged = { ...current, description: shared.description, ask: union(kept, shared.ask, c => c.join(' ')), denyRead: union(current.denyRead, shared.denyRead) };
    if (shared.retired) merged.retired = union(current.retired ?? [], shared.retired, c => c.join(' '));
    if (JSON.stringify(merged) !== JSON.stringify(current)) {
      warnings.push(`Gate list drift: ${gatesFile}`);
      if (write) { mkdirSync(path.dirname(localGates), { recursive: true }); writeFileSync(localGates, JSON.stringify(merged, null, 2) + '\n'); changed.push(gatesFile); }
    }
  }
  if (!existsSync(localGates)) return;
  const gates = readGates(localGates), wanted = permissionEntries(gates);
  // Remove only the exact rules generated for retired commands that are not still gated.
  const stale = new Set(permissionEntries({ ask: gates.retired ?? [], denyRead: [] }).ask.filter(e => !wanted.ask.includes(e)));
  const settingsFile = local(root, '.claude/settings.json').target;
  const settings = existsSync(settingsFile) ? JSON.parse(read(settingsFile)) : {};
  const permissions = settings.permissions ?? {};
  if ((permissions.ask !== undefined && !Array.isArray(permissions.ask)) || (permissions.deny !== undefined && !Array.isArray(permissions.deny))) {
    warnings.push('.claude/settings.json: permissions.ask and permissions.deny must be lists; reconcile manually.');
    return;
  }
  const current = (permissions.ask ?? []).filter(e => !stale.has(e));
  const removed = (permissions.ask?.length ?? 0) - current.length;
  const ask = union(current, wanted.ask), deny = union(permissions.deny ?? [], wanted.deny);
  const missing = ask.length - current.length + deny.length - (permissions.deny?.length ?? 0);
  if (!missing && !removed) return;
  if (missing) warnings.push(`.claude/settings.json: ${missing} gated permission entries missing.`);
  if (removed) warnings.push(`.claude/settings.json: ${removed} retired gated permission entries present.`);
  if (write) {
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, JSON.stringify({ ...settings, permissions: { ...permissions, ask, deny } }, null, 2) + '\n');
    changed.push('.claude/settings.json');
  }
}

export const templatesDir = '.agents/templates';
// Starter templates are copied once and then owned by the consumer: --write adds only
// missing files, and --update replaces only the named differing files.
export function syncTemplates(root, { source = root, write = false, update = [] } = {}) {
  root = path.resolve(root);
  const base = path.join(path.resolve(source), templatesDir);
  if (!existsSync(base)) throw new Error(`No ${templatesDir} under the source; check --source.`);
  const warnings = [];
  let config = {};
  try { config = configAt(root); } catch (error) { warnings.push(`handbook.json unreadable, adoption documents skipped: ${error.message}`); }
  const adoption = { 'source-map.md': config.sourceMap, 'repository-adapter.md': config.guidance, 'repository.md': config.preferences };
  const destination = file => {
    if (file.startsWith('github/')) return [`.github/${file.slice('github/'.length)}`];
    const name = file.slice('docs/'.length);
    if (!(name in adoption)) return [`docs/templates/${name}`];
    const reference = adoption[name];
    if (typeof reference !== 'string' || !reference) return [undefined, 'path not set in handbook.json'];
    if (reference.includes('#')) return [undefined, `${reference} is a section of a larger document`];
    // Agent entrypoints are project instructions, never template targets.
    if (/^(AGENTS|CLAUDE)\.md$/i.test(reference)) return [undefined, `${reference} is an agent entrypoint`];
    return [reference];
  };
  const wantedUpdates = new Set(update.map(name => name.replace(/\\/g, '/').replace(/^\.\//, '')));
  const walk = dir => readdirSync(path.join(base, dir), { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(`${dir}${item.name}/`) : [`${dir}${item.name}`]);
  const templates = [], changed = [], skipped = [];
  for (const file of walk('').sort()) {
    const template = `${templatesDir}/${file}`;
    const [relative, reason] = destination(file);
    if (!relative) { skipped.push({ template, reason }); continue; }
    let target;
    try { ({ target } = local(root, relative)); } catch (error) { skipped.push({ template, reason: `${relative}: ${error.message}` }); continue; }
    const wanted = read(path.join(base, file));
    const status = !existsSync(target) ? 'missing' : read(target) === wanted ? 'same' : 'differs';
    templates.push({ template, path: relative, status });
    const named = wantedUpdates.delete(relative);
    if ((write && status === 'missing') || (named && status === 'differs')) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, wanted);
      changed.push(relative);
    } else if (named) warnings.push(`--update ${relative}: status is ${status}; nothing replaced.`);
  }
  for (const name of wantedUpdates) warnings.push(`--update ${name}: no template targets this path.`);
  return { templates, changed, skipped, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    let root = process.cwd(), source, write = false;
    const update = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--root' && args[i + 1]) root = args[++i];
      else if (args[i] === '--source' && args[i + 1]) source = args[++i];
      else if (command === 'templates' && args[i] === '--write') write = true;
      else if (command === 'templates' && args[i] === '--update' && args[i + 1]) update.push(args[++i]);
      else throw new Error('Use --root PATH and optional --source SNAPSHOT; templates also takes --write and --update PATH.');
    }
    if (!['check', 'sync', 'check-entrypoints', 'templates'].includes(command)) throw new Error('Use check, sync, check-entrypoints or templates.');
    const result = command === 'check' ? checkReadiness(root)
      : command === 'templates' ? syncTemplates(root, { source, write, update })
      : syncEntrypoints(root, { source, write: command === 'sync' });
    console.log(JSON.stringify(result, null, 2));
    // Structural readiness and drift are advisory. Runtime/usage failures still fail.
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
