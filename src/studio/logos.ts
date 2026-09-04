/**
 * Curated theSVG brand slugs the scene generators may use. The full registry
 * is 6500+ icons (thesvg.org/api/registry.json); this is the subset a model
 * can reliably name. Anything else falls back to ui.Icon or WebImage.
 */
export const BRAND_LOGOS: Record<string, string> = {
  // AI
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  claude: 'Claude',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  deepseek: 'DeepSeek',
  'hugging-face': 'Hugging Face',
  mistral: 'Mistral',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
  midjourney: 'Midjourney',
  gemini: 'Gemini',
  qwen: 'Qwen',
  xai: 'xAI',
  grok: 'Grok',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  vllm: 'vLLM',
  openwebui: 'OpenWebUI',
  localai: 'LocalAI',
  gpt4all: 'GPT4All',
  comfyui: 'ComfyUI',
  llamaindex: 'LlamaIndex',
  langchain: 'LangChain',
  pytorch: 'PyTorch',
  onnx: 'ONNX',
  tinygrad: 'tinygrad',
  cerebras: 'Cerebras',
  sambanova: 'SambaNova',
  deepinfra: 'DeepInfra',
  anyscale: 'Anyscale',
  baseten: 'Baseten',
  modal: 'Modal',
  runpod: 'RunPod',
  'weights-and-biases': 'Weights & Biases',
  replicate: 'Replicate',
  runway: 'Runway',
  'stability-ai': 'Stability AI',
  'together-ai': 'Together AI',
  elevenlabs: 'ElevenLabs',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  'github-copilot': 'GitHub Copilot',
  notebooklm: 'NotebookLM',
  'lm-studio': 'LM Studio',
  firecrawl: 'Firecrawl',
  fireworks: 'Fireworks AI',
  fal: 'Fal',
  lovable: 'Lovable',
  bolt: 'Bolt',
  replit: 'Replit',
  v0: 'v0',
  n8n: 'n8n',
  deepmind: 'Google DeepMind',
  'ai-studio-google': 'Google AI Studio',
  'gcp-vertexai': 'Vertex AI',
  'aws-amazon-bedrock': 'Amazon Bedrock',
  // Social
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  linkedin: 'LinkedIn',
  x: 'X',
  twitter: 'Twitter',
  instagram: 'Instagram',
  facebook: 'Facebook',
  meta: 'Meta',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitch: 'Twitch',
  reddit: 'Reddit',
  discord: 'Discord',
  slack: 'Slack',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  snapchat: 'Snapchat',
  pinterest: 'Pinterest',
  medium: 'Medium',
  substack: 'Substack',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  quora: 'Quora',
  'stack-overflow': 'Stack Overflow',
  devdotto: 'DEV',
  hashnode: 'Hashnode',
  // Cloud and platforms
  google: 'Google',
  microsoft: 'Microsoft',
  apple: 'Apple',
  amazon: 'Amazon',
  aws: 'AWS',
  azure: 'Azure',
  'google-cloud': 'Google Cloud',
  cloudflare: 'Cloudflare',
  vercel: 'Vercel',
  netlify: 'Netlify',
  heroku: 'Heroku',
  digitalocean: 'DigitalOcean',
  supabase: 'Supabase',
  firebase: 'Firebase',
  mongodb: 'MongoDB',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  redis: 'Redis',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  terraform: 'Terraform',
  nginx: 'NGINX',
  grafana: 'Grafana',
  sentry: 'Sentry',
  datadog: 'Datadog',
  elastic: 'Elastic',
  jenkins: 'Jenkins',
  // Design and creative
  figma: 'Figma',
  adobe: 'Adobe',
  sketch: 'Sketch',
  framer: 'Framer',
  canva: 'Canva',
  dribbble: 'Dribbble',
  behance: 'Behance',
  // Payments and finance
  stripe: 'Stripe',
  paypal: 'PayPal',
  visa: 'Visa',
  mastercard: 'Mastercard',
  'apple-pay': 'Apple Pay',
  'google-pay': 'Google Pay',
  square: 'Square',
  wise: 'Wise',
  revolut: 'Revolut',
  coinbase: 'Coinbase',
  binance: 'Binance',
  metamask: 'MetaMask',
  // Media and entertainment
  netflix: 'Netflix',
  spotify: 'Spotify',
  'prime-video': 'Prime Video',
  disney: 'Disney',
  crunchyroll: 'Crunchyroll',
  // Productivity
  notion: 'Notion',
  linear: 'Linear',
  asana: 'Asana',
  trello: 'Trello',
  jira: 'Jira',
  confluence: 'Confluence',
  airtable: 'Airtable',
  coda: 'Coda',
  clickup: 'ClickUp',
  dropbox: 'Dropbox',
  'microsoft-onedrive': 'OneDrive',
  'google-drive': 'Google Drive',
  // Communication
  zoom: 'Zoom',
  'microsoft-teams': 'Microsoft Teams',
  'google-meet': 'Google Meet',
  loom: 'Loom',
  'cal-com': 'Cal.com',
  calendly: 'Calendly',
  // Hardware and consumer
  tesla: 'Tesla',
  samsung: 'Samsung',
  nvidia: 'NVIDIA',
  amd: 'AMD',
  intel: 'Intel',
  ubuntu: 'Ubuntu',
  linux: 'Linux',
  python: 'Python',
  rust: 'Rust',
  cmake: 'CMake',
  vulkan: 'Vulkan',
  neovim: 'Neovim',
  tmux: 'tmux',
  warp: 'Warp',
  iterm2: 'iTerm2',
  homebrew: 'Homebrew',
  zed: 'Zed',
};

/** Common spoken/product aliases resolve to one verified theSVG slug. */
const BRAND_LOGO_ALIASES: Record<string, string> = {
  deepseekai: 'deepseek',
  deepseekchat: 'deepseek',
  googledeepmind: 'deepmind',
  googleai: 'ai-studio-google',
  googleaistudio: 'ai-studio-google',
  vertexai: 'gcp-vertexai',
  googlevertexai: 'gcp-vertexai',
  amazonbedrock: 'aws-amazon-bedrock',
  awsbedrock: 'aws-amazon-bedrock',
  huggingface: 'hugging-face',
  huggingfacehub: 'hugging-face',
  mistralai: 'mistral',
  googlegemini: 'gemini',
  alibabaqwen: 'qwen',
  qwenai: 'qwen',
  grokxai: 'grok',
  xaigrok: 'grok',
  stabilityai: 'stability-ai',
  togetherai: 'together-ai',
  fireworksai: 'fireworks',
  falai: 'fal',
  githubcopilot: 'github-copilot',
  copilotgithub: 'github-copilot',
  claudecode: 'claude-code',
  openaicodex: 'codex',
  lmstudio: 'lm-studio',
  vllmproject: 'vllm',
  openwebuiollama: 'openwebui',
  openwebui: 'openwebui',
  llamaindexai: 'llamaindex',
  langchainai: 'langchain',
  wandb: 'weights-and-biases',
  weightsandbiases: 'weights-and-biases',
  torch: 'pytorch',
  iterm: 'iterm2',
  nvim: 'neovim',
  brew: 'homebrew',
  warpterminal: 'warp',
  zededitor: 'zed',
  notebooklmgoogle: 'notebooklm',
  codeium: 'windsurf',
  boltnew: 'bolt',
  vercelv0: 'v0',
  devto: 'devdotto',
  stackoverflow: 'stack-overflow',
  gcp: 'google-cloud',
  googlecloud: 'google-cloud',
  googledrive: 'google-drive',
  googlepay: 'google-pay',
  applepay: 'apple-pay',
  googlemeet: 'google-meet',
  microsoftteams: 'microsoft-teams',
  msteams: 'microsoft-teams',
  onedrive: 'microsoft-onedrive',
  postgres: 'postgresql',
  primevideo: 'prime-video',
  calcom: 'cal-com',
};

const normalizeBrandName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const BRAND_LOGO_LOOKUP = Object.entries(BRAND_LOGOS).reduce<Record<string, string>>(
  (lookup, [slug, label]) => {
    lookup[normalizeBrandName(slug)] = slug;
    lookup[normalizeBrandName(label)] = slug;
    return lookup;
  },
  {...BRAND_LOGO_ALIASES},
);

/**
 * A few theSVG entries use a published colour/mono file as their manifest's
 * default instead of shipping a file literally named default.svg. These paths
 * are copied from the manifest so the runtime never has to guess a filename.
 */
export const BRAND_LOGO_DEFAULT_FILES: Record<string, 'default' | 'color' | 'mono'> = {
  'claude-code': 'color',
  mistral: 'color',
  xai: 'mono',
  'lm-studio': 'mono',
  fireworks: 'color',
  fal: 'color',
  'ai-studio-google': 'mono',
  aws: 'color',
};

/** Resolve only locally verified names. Unknown model output returns null. */
export const resolveBrandLogoSlug = (name: string): string | null =>
  BRAND_LOGO_LOOKUP[normalizeBrandName(String(name))] ?? null;

/** Resolve the exact filename for a verified slug and requested variant. */
export const resolveBrandLogoFile = (
  slug: string,
  variant: 'default' | 'mono' | 'light' | 'dark' | 'wordmark' | 'wordmarkLight' | 'wordmarkDark',
) => {
  if (variant === 'default') return BRAND_LOGO_DEFAULT_FILES[slug] ?? 'default';
  if (variant === 'wordmarkLight') return 'wordmark-light';
  if (variant === 'wordmarkDark') return 'wordmark-dark';
  return variant;
};

/** The prompt line listing the slugs a model may pick. */
export const BRAND_LOGOS_TEXT = Object.entries(BRAND_LOGOS)
  .map(([slug, label]) => `${slug} (${label})`)
  .join(', ');

/**
 * Brand names a model must never guess at, and names that are ordinary
 * English words. `x` is dropped outright — it matches a variable, an axis, a
 * multiplication sign, and the letter itself. The rest are only accepted when
 * the text capitalises them exactly as the brand does, so "make it linear"
 * does not resolve two logos.
 */
const AMBIGUOUS_BRAND_LABELS = new Set([
  'apple',
  'bolt',
  'continue',
  'fal',
  'linear',
  'make',
  'medium',
  'meta',
  'modal',
  'signal',
  'square',
  'warp',
  'wise',
  'zed',
]);

const UNMATCHABLE_BRAND_SLUGS = new Set(['x']);

/** Every surface form that resolves to a slug, longest first so "LM Studio" wins over "LM". */
const BRAND_SURFACE_FORMS = [
  ...Object.entries(BRAND_LOGOS).map(([slug, label]) => ({slug, label, form: label})),
  // A slug and an alias are both spelled the way a person types the name, so
  // they catch "lm studio" and "wandb"; the label alone would miss both.
  ...Object.entries(BRAND_LOGOS).map(([slug, label]) => ({
    slug,
    label,
    form: slug.replace(/-/g, ' '),
  })),
  ...Object.entries(BRAND_LOGO_ALIASES).map(([alias, slug]) => ({
    slug,
    label: BRAND_LOGOS[slug] ?? slug,
    form: alias,
  })),
]
  .filter(({slug, form}) => {
    if (UNMATCHABLE_BRAND_SLUGS.has(slug)) return false;
    if (form.replace(/[^A-Za-z0-9]/g, '').length < 3) return false;
    // An ambiguous name is only safe as the brand's own capitalisation. Its
    // lowercase slug and alias forms would match the ordinary English word:
    // a case-sensitive /signal/ still hits "keep the signal clean".
    return !(AMBIGUOUS_BRAND_LABELS.has(form.toLowerCase()) && form !== BRAND_LOGOS[slug]);
  })
  .sort((a, b) => b.form.length - a.form.length);

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The brands a shot's own words actually name, resolved to verified slugs.
 *
 * The generator was shown a 200-name catalogue and asked to pick from it,
 * which is a recall problem it kept failing: a four-way comparison of local
 * inference tools came back with four generic Lucide glyphs even though three
 * of the four had verified marks. Resolving the names here turns recall into
 * a supplied fact, and a brand missing from the curated list is then a
 * visible absence rather than a silent one.
 */
export const brandsNamedIn = (text: string, limit = 8): Array<{slug: string; label: string}> => {
  if (!text.trim()) return [];
  const found = new Map<string, {slug: string; label: string; at: number}>();
  for (const {slug, label, form} of BRAND_SURFACE_FORMS) {
    if (found.has(slug)) continue;
    const caseSensitive = AMBIGUOUS_BRAND_LABELS.has(form.toLowerCase());
    const pattern = new RegExp(
      `(?<![A-Za-z0-9])${escapeForRegExp(form)}(?![A-Za-z0-9])`,
      caseSensitive ? '' : 'i',
    );
    const match = pattern.exec(text);
    if (match) found.set(slug, {slug, label, at: match.index});
  }
  return [...found.values()]
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map(({slug, label}) => ({slug, label}));
};
