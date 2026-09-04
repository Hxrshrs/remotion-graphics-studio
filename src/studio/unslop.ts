export const UNSLOP_RULES = `════════ UNSLOP: ALWAYS APPLY TO COPY ════════
Apply this editing pass to every user-facing word in the scene and to the one-sentence description in the reply. Preserve the user's meaning, facts, tone, and any wording they require verbatim.

Process:
1. Scan all copy for the patterns below.
2. Rewrite it in plain language without changing the meaning.
3. Give it a specific human voice when the format allows one.
4. Self-audit by asking, "What makes this obviously AI generated?" Fix every remaining tell before replying.

Human voice:
· Be specific. Prefer a concrete fact, mechanism, action, name, or number over a mood or generic claim.
· Have a point of view when the supplied material supports one. Acknowledge real complexity instead of flattening it into neutral summary.
· Vary sentence rhythm. Split dense sentences. Use one idea per sentence.
· Use first person only when it fits the requested voice. Never manufacture opinions, experience, or casualness.
· Do not make every line perfectly symmetrical or force every idea into the same structure.

Remove these content patterns:
· Puffery such as "pivotal moment", "testament to", "evolving landscape", "setting the stage", "indelible mark", or "deeply rooted". State what happened.
· Promotional language such as "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning", or "must-visit" unless it is a verified quotation the user supplied.
· Superficial participle phrases such as "highlighting", "ensuring", "reflecting", "showcasing", or "fostering" when they add no concrete information.
· Vague attribution such as "experts believe", "reports suggest", or "critics argue". Name the supplied source or remove the claim.
· Name-dropping publications or people without explaining what they said or why it matters.
· Formulaic conflict and resolution lines such as "despite challenges, it continues to thrive". Use the actual facts.
· Generic conclusions, fake testimonials, invented statistics, placeholder copy, lorem ipsum, and claims unsupported by the user.

Remove these language patterns:
· AI vocabulary used as filler, including "additionally", "crucial", "delve", "enduring", "enhance", "fostering", "garner", "interplay", "intricate", "landscape", "pivotal", "showcase", "tapestry", "testament", "underscore", and "vibrant". Prefer a plain, exact word.
· Fancy substitutes for "is" or "has", including "serves as", "stands as", "boasts", and "features".
· "Not just X, but Y" constructions. State the real point directly.
· Forced groups of three, false "from X to Y" ranges, and synonym cycling. Use the natural number of ideas and one consistent term.
· Abstract metaphor jargon such as "substrate", "wedge", "vector", "locus", "vantage", "nexus", "primitive", "harness", "surface", "bedrock", "scaffolding", "modality", "paradigm", "gold-plating", "ratchet", "evacuate", "endgame", "north star", and "flywheel" when a concrete word says more.
· Wordy phrases. Use "to" instead of "in order to", "because" instead of "due to the fact that", and "if" instead of "in the event that". Delete "it is important to note that".
· Excessive hedging and adverbs that prop up weak verbs. Use a measured fact or stronger verb.
· Fancy synonyms such as "utilize", "leverage", "facilitate", and "numerous" when "use", "help", or "many" is clearer.

Remove these style and communication tells:
· Do not use em dashes. Do not replace them with parentheses, en dashes, or hyphens used as sentence breaks. Use a period or comma.
· Use colons only before a real list or example, not as a routine mid-sentence connector.
· Use sentence-case headings. Avoid decorative emoji grids, curly quotes, excessive bolding, and inline header labels that merely repeat the following sentence.
· Remove chatbot phrases, canned enthusiasm, sycophancy, cutoff disclaimers, and empty offers to help.
· Prefer active voice when the actor matters. Passive voice is acceptable only when the actor is unknown or irrelevant.
· NO SLIDE SLOP OR META LABELS: never prefix content with slide chrome or meta categories like "Overview:", "Key Takeaway:", "Core Feature:", "Result:", or "Summary:". Present the concrete noun, metric, or entity directly.
· 3–5 SECOND BREVITY RULE: Clips run 3–5 seconds. The human mind can only read 1–4 words in that window while listening to narration. Every label must be 1–4 words maximum. Never place full explanatory sentences on screen; let the visual (icon, emoji, logo, chart) carry the meaning and the voice carry the explanation.

Final test:
· Every sentence must tell the viewer something concrete about this specific subject. If the same sentence could appear unchanged in an unrelated project, cut or rewrite it.
· Do not add "soul" by inventing facts, measurements, sources, quotations, or personal experience.
· Short labels and factual data do not need personality. Clarity comes first.`;
