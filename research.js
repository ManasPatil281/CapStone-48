const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat, convertInchesToTwip,
  PageBreak, ExternalHyperlink
} = require("docx");

// ---------- helpers ----------
const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } });
const H3 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } });

const P = (text, opts = {}) => new Paragraph({
  spacing: { after: 120, line: 276 },
  children: Array.isArray(text) ? text : [new TextRun({ text, size: 21 })],
  ...opts
});

const B = (label, rest) => new Paragraph({
  spacing: { after: 90, line: 270 },
  children: [new TextRun({ text: label, bold: true, size: 21 }), new TextRun({ text: rest, size: 21 })]
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 60 },
  children: [new TextRun({ text, size: 21 })]
});

const link = (label, url) => new ExternalHyperlink({
  link: url,
  children: [new TextRun({ text: label, style: "Hyperlink", size: 21 })]
});

const linkPara = (label, url, extra = "") => new Paragraph({
  spacing: { after: 90 },
  numbering: { reference: "bullets", level: 0 },
  children: [link(label, url), new TextRun({ text: extra, size: 21 })]
});

function cell(text, opts = {}) {
  const { width = 1000, bold = false, shade = null, size = 18 } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: (Array.isArray(text) ? text : [text]).map(t =>
      new Paragraph({ children: [new TextRun({ text: t, bold, size })], spacing: { after: 40 } })
    )
  });
}

function makeTable(headers, rows, colWidths) {
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { width: colWidths[i], bold: true, shade: "D9E2F3", size: 18 }))
      }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((c, i) => cell(c, { width: colWidths[i], shade: ri % 2 ? "F2F2F2" : null, size: 17 }))
      }))
    ]
  });
}

const rule = () => new Paragraph({
  spacing: { after: 200 },
  border: { bottom: { color: "AAAAAA", space: 1, style: BorderStyle.SINGLE, size: 6 } },
  children: [new TextRun("")]
});

// ---------- content ----------
const doc = new Document({
  numbering: {
    config: [{
      reference: "bullets",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 260 } } } }
      ]
    }]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    children: [

      new Paragraph({ text: "Agentic & LLM-Based Recommender Systems", heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
      new Paragraph({ text: "A Focused Research Literature Review and Novel Problem Identification (2023–2026)", spacing: { after: 40 }, children: [new TextRun({ text: "A Focused Research Literature Review and Novel Problem Identification (2023–2026)", italics: true, size: 24 })] }),
      P("Prepared for: B.Tech Computer Engineering research scoping  |  Scope: LLM-based RS, Conversational RS, Agentic RS, Multi-Agent RS, Memory & Personalization, User Simulation, RL-based RS", { children: [new TextRun({ text: "Prepared for: B.Tech Computer Engineering research scoping  |  Scope: LLM-based RS, Conversational RS, Agentic RS, Multi-Agent RS, Memory & Personalization, User Simulation, RL-based RS", italics: true, size: 18, color: "555555" })] }),
      rule(),

      // ================= 1 =================
      H1("1. Scope and Method"),
      P("This review covers 2023–2026 work (RecSys, SIGIR, KDD, WWW, NeurIPS, ICLR, ICML, AAAI, ACL/EMNLP, IEEE/ACM TKDE/TOIS, and arXiv preprints), weighted toward 2025–2026 since the agentic-RS sub-field is moving quickly. It deliberately excludes background tutorial material on what an LLM or a recommender system is, and focuses on: the trajectory from LLM-as-recommender to genuinely agentic recommendation; the current major research approaches; a cross-paper gap analysis that goes beyond authors' stated future work; and a set of concretely scoped, defensible novel research directions with a ranked shortlist and one fully specified proposal."),

      // ================= 2 =================
      H1("2. Evolution: Traditional RS → Agentic / Multi-Agent RS"),
      makeTable(
        ["Stage", "Representative Systems", "Core Mechanism", "What Changed Next"],
        [
          ["Traditional RS (pre-2016)", "Matrix Factorization, BPR-MF, Collaborative Filtering", "Latent factor / similarity models over ID interactions", "Could not use content/text; cold-start; no sequence modeling"],
          ["Deep / Transformer RS (2016–2021)", "GRU4Rec, SASRec (Kang & McAuley, ICDM'18), LightGCN, BERT4Rec", "Sequential neural nets, self-attention, GNN propagation", "Strong at pattern capture, weak at reasoning, explanation, open-vocabulary items"],
          ["LLM-based RS (2022–2024)", "P5 (Geng et al., RecSys'22), Chat-Rec (arXiv:2303.14524), TALLRec / CoLLM, LLMRank, E4SRec", "Recommendation reframed as language generation / prompting / fine-tuning; discriminative vs. generative LLM4Rec (arXiv:2305.19860)", "Single-turn, static, no memory across sessions, no tool use"],
          ["Conversational RS (2016–2024, LLM-boosted from 2023)", "ReDial-based CRS, MACRS, UserSimCRS, Collaborative Retrieval CRS (WWW'25)", "Multi-turn dialogue for preference elicitation, slot filling", "Still largely reactive; lacks autonomous planning across the whole session"],
          ["Agentic RS (2023–2025)", "InteRecAgent, RecMind (NAACL Findings'24), AgentCF (WWW'24), ToolRec (SIGIR'24), Recommender AI Agent (ACM TOIS'25)", "LLM agent with memory + planning + tool use, treats traditional models as callable tools", "Single-agent bottlenecks: role overload, no specialization, weak coordination"],
          ["Multi-Agent / Autonomous RS (2024–2026)", "MACRec (SIGIR'24), Multi-Agent Collaborative Filtering (arXiv:2511.18413), Tri-Party Framework (arXiv:2603.10673), AgentX (arXiv:2606.26859), Self-EvolveRec (arXiv:2602.12612)", "Specialized cooperating/competing agents (user-agent, item-agent, platform-agent); self-evolving pipelines; simulated economies", "Coordination failures, evaluation validity, safety/collusion risks remain open"]
        ],
        [2100, 3300, 3300, 3300]
      ),
      P(""),

      // ================= 3 =================
      H1("3. Major Approaches Currently Being Researched"),

      H2("3.1 LLM-based recommendation"),
      P("Two paradigms dominate: Discriminative LLM4Rec (LLM as a scorer/ranker, e.g., CTR-style models such as CTRL) and Generative LLM4Rec (LLM directly generates item identifiers/text), as taxonomized in the survey by Wu et al. (arXiv:2305.19860). Recent 2025–2026 work pushes on tokenization for generative recommendation (order-agnostic identifiers, universal item tokenization, SimGR arXiv:2602.07847), collaborative-semantic injection (Zheng et al., ICDE'24), reasoning-augmented recommendation (Reason-to-Recommend, arXiv:2506.05069), and inference efficiency (Efficient Inference for LLM-based Generative Recommendation, ICLR'25)."),

      H2("3.2 Conversational / interactive recommendation"),
      P("CRS work has shifted from slot-filling dialogue managers to LLM-driven multi-turn agents that combine retrieval with dialogue policy (Collaborative Retrieval for LLM-based CRS, WWW'25), and toward better evaluation via user simulation (UserSimCRS v2, ECIR'26; CRS Arena, WSDM'25; Bernard & Balog's critique of current CRS evaluation practice, SIGIR-AP'25)."),

      H2("3.3 Memory-based personalization"),
      P("A large 2025–2026 cluster treats memory as a first-class module distinct from RAG: A-Mem (arXiv:2502.12110), Mem0 (arXiv:2504.19413), MemGPT, and recommendation-specific variants such as AMEM4Rec (cross-user memory evolution, arXiv:2602.08837), MemRerank (preference memory for reranking, arXiv:2603.29247), and MR.Rec (jointly optimizing memory and reasoning with RL, arXiv:2510.14629). Most of this work focuses on storage/retrieval and consolidation, not on causal attribution or conflict resolution (see §5)."),

      H2("3.4 Agentic recommendation"),
      P("Defined by the addition of planning, persistent memory, autonomous tool use, and multi-turn adaptation on top of an LLM backbone (Peng et al.'s survey taxonomy: recommender-oriented, interaction-oriented, simulation-oriented agents, EMNLP Findings'25, arXiv:2502.10050). Canonical systems: InteRecAgent (tool-augmented), RecMind (self-inspired planning), AgentCF (autonomous collaborative learning agents, WWW'24), STARec (autonomous deliberate reasoning, CIKM'25), iAgent (agent as a protective shield between user and platform, arXiv:2502.14662)."),

      H2("3.5 Tool-using recommendation agents"),
      P("ToolRec (SIGIR'24) and InteRecAgent treat retrievers/rerankers/filters/KG-lookups as callable tools; SkillGraph (arXiv:2604.19793) reframes tool-sequence selection itself as a recommendation problem. Tool-use is mostly studied for correctness, rarely for cost/latency-aware orchestration (§5)."),

      H2("3.6 Multi-agent recommendation"),
      P("MACRec (SIGIR'24) introduces specialized user-analysis / item-analysis / reflection agents; Multi-Agent Collaborative Filtering (arXiv:2511.18413) orchestrates users and items as agents; the Tri-Party Framework (arXiv:2603.10673) gives items their own agency rather than treating them as passive attributes; RecSys'25's industrial tutorial on Multi-Agentic Recommender Systems (Yousefi Maragheh et al.) documents production design patterns."),

      H2("3.7 Self-evolving recommenders"),
      P("Self-EvolveRec (arXiv:2602.12612) uses LLM-based directional feedback to evolve model code; AgentX (arXiv:2606.26859) performs agent-driven self-iteration of industrial recommenders; Self-Evolving Recommendation System (arXiv:2602.10226) frames the human engineer's role as defining guardrails while agents evolve the modeling pipeline. These target model/code evolution, not the agent's own memory schema or tool-use policy (§5)."),

      H2("3.8 User simulation / agent-based evaluation"),
      P("Agent4Rec (SIGIR'24) pioneered LLM-driven generative agents for behavioral simulation; SimUSER (arXiv:2504.12722), RecUserSim (WWW Companion'25, arXiv:2507.22897), PUB (personality-driven, SIGIR'25, arXiv:2506.04551), and context-aware simulation (arXiv:2604.09549) followed. AgentRecBench (arXiv:2505.19623) and τ-Rec (arXiv:2606.10156) turn simulators into standardized benchmarks with classic / evolving-interest / cold-start scenarios."),

      H2("3.9 Personal AI recommendation agents"),
      P("2025–2026 sees rapid movement from recommend-only assistants to transacting agents: Strategic Buying Agents (arXiv:2607.04708) formalize when-to-buy policies; ACES (arXiv:2508.02630) sandboxes agent purchasing behavior; Commercial Persuasion in AI-Mediated Conversations (arXiv:2604.04263) studies manipulation risk in agent-mediated commerce. This area is largely industry-driven and empirically under-studied academically."),

      // ================= 4 =================
      new Paragraph({ children: [new PageBreak()] }),
      H1("4. Literature Table"),
      makeTable(
        ["Paper", "Yr", "Approach", "Dataset", "Key Contribution", "Limitation", "Relevance"],
        [
          ["A Survey on LLMs for Recommendation (arXiv:2305.19860)", "2023/24", "LLM-based RS (survey)", "N/A (survey)", "Discriminative vs. Generative LLM4Rec taxonomy", "Pre-agentic; no memory/planning coverage", "Foundational framing"],
          ["AgentCF (WWW'24)", "2024", "Agentic / memory", "Amazon CDs&Vinyl, MovieLens-1M", "Autonomous collaborative-learning agents that co-adapt user & item agents", "Two-subset (100-user) eval only; single-agent memory, no conflict handling", "Core baseline for memory & agentic RS"],
          ["MACRec (SIGIR'24, arXiv:2402.15235)", "2024", "Multi-agent", "MovieLens, Amazon subsets", "Specialized user/item/reflection agents collaborating", "No formal coordination-failure analysis", "Multi-agent baseline"],
          ["RecMind (NAACL Findings'24)", "2024", "Tool-using / planning agent", "Amazon, MovieLens", "Self-inspired planning for subtask decomposition", "Reactive tool use; no cost-awareness", "Planning/tool-use baseline"],
          ["Recommender AI Agent / InteRecAgent (ACM TOIS'25)", "2023/25", "Tool-using agent", "MovieLens-10M, Steam", "Treats traditional models as callable tools inside an LLM agent", "Fixed tool pipeline, not query-adaptive", "Tool-orchestration baseline"],
          ["Agent4Rec (SIGIR'24)", "2024", "User simulation", "MovieLens-1M (1,000 agents)", "First large-scale generative-agent simulator with social traits", "Simulated fidelity not validated against real logs", "User-simulation baseline"],
          ["iAgent (arXiv:2502.14662)", "2025", "Agentic / safety", "Amazon, MovieLens", "User-agent-platform paradigm; agent as protective shield", "Focuses on exposure control, not memory security", "Safety/manipulation angle"],
          ["A-Mem (NeurIPS'25, arXiv:2502.12110)", "2025", "Agent memory", "General agent benchmarks", "Agentic memory with dynamic note-linking", "Not recommendation-specific; no attribution", "Memory architecture reference"],
          ["AMEM4Rec (arXiv:2602.08837)", "2026", "Memory-based personalization", "Amazon subsets", "Cross-user similarity for memory evolution", "No causal attribution of memory to outcome", "Memory personalization SOTA"],
          ["Self-EvolveRec (arXiv:2602.12612)", "2026", "Self-evolving RS", "Standard RS benchmarks", "LLM-directed evolutionary code optimization with directional feedback", "Evolves code/model, not agent memory/policy jointly", "Self-evolution baseline"],
          ["AgentRecBench (arXiv:2505.19623)", "2025", "Evaluation / benchmark", "Custom textual sim. + metadata", "First benchmark w/ classic, evolving-interest, cold-start scenarios for agentic RS", "Outcome-only metrics; no failure localization", "Primary benchmark for proposals #9, #14"],
          ["τ-Rec (arXiv:2606.10156)", "2026", "Evaluation / benchmark", "Verifiable simulated tasks", "Verifiable agentic-RS benchmark", "Still simulation-only; sim-to-real validity untested", "Evaluation gap evidence"],
          ["SimUSER (arXiv:2504.12722)", "2025", "User simulation", "MovieLens, AmazonBook, Steam", "Persona/self-consistency + KG memory + visual grounding", "Ignores external life-context (flagged by authors' own follow-up work)", "Basis for goal-aware idea"],
          ["Tri-Party Framework (arXiv:2603.10673)", "2026", "Multi-agent fairness", "Amazon, MovieLens", "Gives items their own agent for exposure/welfare negotiation", "Only 2-way negotiation; no buyer-agent interaction modeled", "Long-term welfare angle"],
          ["PrefRec (KDD'23, arXiv:2212.02779)", "2023", "RL for long-term engagement", "Simulated + real deployment logs", "Human-preference-based reward for long-term engagement", "Pre-LLM; scalarized objective, no interpretability", "Engagement-vs-welfare baseline"],
          ["Explicit User Manipulation in RL-RS (arXiv:2203.10629)", "2022", "Safety / manipulation", "Simulated RL-RS", "Formalizes manipulation via preference-shift exploitation", "Pre-LLM-agent era; no memory-poisoning analysis", "Motivates security idea #2"],
          ["ACES (arXiv:2508.02630)", "2025", "Personal AI agent / commerce", "Programmable mock marketplace", "Sandbox studying what/why AI agents buy", "Single-buyer-agent focus; no recommender-agent co-adaptation", "Basis for PhD-level idea #5"],
          ["Beyond Offline A/B Testing (arXiv:2604.09549)", "2026", "User simulation", "MovieLens, AmazonBook, Steam", "Context-aware agent simulation (external life events)", "Explicitly flags unmodeled goal/context gap", "Direct motivation for goal-aware idea #7"],
          ["SkillGraph (arXiv:2604.19793)", "2026", "Tool-using agent", "ToolBench-derived", "Treats tool-sequence selection as a recommendation problem", "General-purpose agents, not RS-specific cost budgeting", "Basis for tool-budget idea"],
          ["A Survey on LLM-powered Agents for RS (EMNLP Findings'25, arXiv:2502.10050)", "2025", "Agentic RS (survey)", "N/A (survey)", "3-paradigm taxonomy + architecture components (profile/memory/planning/action)", "Synthesizes but does not causally decompose component contributions", "Basis for §6 and idea #14"]
        ],
        [2500, 550, 1550, 1650, 2600, 2400, 1650]
      ),

      // ================= 5 =================
      new Paragraph({ children: [new PageBreak()] }),
      H1("5. Cross-Paper Research-Gap Analysis"),
      P("The following gaps recur across independently authored papers and are not resolved by any single paper's own future-work section; each is stated as a scientific question rather than an engineering TODO."),

      H3("5.1 Dynamic / long-term user preference & memory evolution"),
      P("AgentRecBench and Drift-Aware Continual Tokenization (arXiv:2603.29705) both isolate 'evolving-interest' as a distinct hard regime, but no work separates genuine preference drift from transient noise using a principled, confidence-weighted update rule — most memory systems (AgentCF, A-Mem, AMEM4Rec) use recency- or frequency-based heuristics without an explicit noise-vs-drift discriminator."),

      H3("5.2 Goal-aware recommendation"),
      P("Beyond Offline A/B Testing (arXiv:2604.09549) explicitly names the absence of external life-context modeling (e.g., trip vs. house move) as a fidelity gap in simulators — this gap has not been addressed on the agent-design side either: no reviewed system represents user goals as structured, lifecycle-tracked objects distinct from flat preference vectors."),

      H3("5.3 Planning and sequential decision-making"),
      P("STARec and RLTR-style planners (arXiv:2508.19598) optimize tool-use trajectories via RL, but planning horizon selection and stopping criteria remain heuristic; no work connects planning depth to a measurable user-attention cost."),

      H3("5.4 Tool selection"),
      P("SkillGraph (arXiv:2604.19793) treats tool-sequence prediction generically; InteRecAgent/RecMind/ToolRec call tools reactively without a learned cost-quality budget conditioned on query complexity — the inference-efficiency literature (Efficient Inference for LLM-based Generative Recommendation, ICLR'25) optimizes decoding, not tool-orchestration cost."),

      H3("5.5 Multi-agent coordination"),
      P("MACRec and the Tri-Party Framework study cooperative or bilateral negotiation, but none model repeated-interaction dynamics between an autonomous buyer-side agent (Strategic Buying Agents, ACES) and a recommender-side agent — a setting the algorithmic-collusion literature in economics has studied for pricing agents but not yet for agentic RS."),

      H3("5.6 Long-term utility vs. engagement"),
      P("PrefRec, LTP-MMF, and the Creator-Oriented Information Revelation paper (arXiv:2510.10511) all optimize a single scalarized trade-off; none expose the engagement-welfare trade-off as an auditable, user-adjustable, disagreement-transparent process."),

      H3("5.7 Attention-aware recommendation"),
      P("Clarification-policy work (Uncertainty-Aware Clarification, arXiv:2606.03135) optimizes information gain per question but does not formalize a decaying user-attention budget as an explicit MDP constraint specific to multi-turn recommendation dialogue."),

      H3("5.8 Evaluation / benchmarks"),
      P("AgentRecBench, τ-Rec, and RecRM-Bench (arXiv:2605.11874) report outcome metrics (HR/NDCG, reward-model scores) but none localize failure to a specific agent module (memory vs. planning vs. tool-use vs. reasoning); separately, Bernard & Balog (SIGIR-AP'25) critique CRS evaluation validity conceptually, but no quantitative cross-simulator/real-log rank-correlation study exists for agentic RS specifically."),

      H3("5.9 Privacy, safety, and manipulation"),
      P("iAgent addresses platform-side exposure control; Explicit User Manipulation in RL-RS (2022) and Commercial Persuasion in AI-Mediated Conversations (arXiv:2604.04263) study behavioral manipulation; LLM4MEA (arXiv:2507.16969) studies model-extraction attacks. None study adversarial injection into an agent's persistent, cross-session memory as a distinct attack surface, and no differential-privacy treatment targets the memory-consolidation step specifically (as opposed to model training)."),

      H3("5.10 Scalability and inference cost"),
      P("Efficient Inference for LLM-based Generative Recommendation (ICLR'25) and Continual LoRA Adapters (arXiv:2510.25093) address token-level and adaptation-level cost; agentic pipelines multiply this by many sequential LLM calls per recommendation, and no reviewed paper reports an end-to-end latency/cost-quality Pareto frontier for multi-turn agentic recommendation specifically."),

      H3("5.11 Self-evolving recommendation"),
      P("Self-EvolveRec and AgentX evolve model code/weights; none study catastrophic forgetting within an agent's own memory store when the agent jointly evolves its memory-consolidation policy and recommendation policy over long deployments — a distinct problem from continual-learning-on-weights, since memory forgetting is architectural/retrieval-based, not gradient-based."),

      H3("5.12 What 'agentic' actually adds"),
      P("Nearly every 2025–2026 paper claims agentic superiority over plain LLM prompting, but comparisons conflate memory + planning + tool-use + reflection into a single 'agent' condition versus a single 'non-agent' baseline. No factorial ablation isolates which component drives gains in which task regime — this is the most direct, checkable gap in the entire literature set (§6, and Idea #14 below)."),

      // ================= 6 =================
      H1("6. LLM-Based Recommendation vs. Genuinely Agentic Recommendation"),
      P("LLM-based recommendation (§3.1) treats the model as a single-shot function: prompt/fine-tune → generate a ranked list or item identifiers. It is stateless across sessions, has no ability to invoke external tools or models, and produces exactly one decision per query. Agentic recommendation, per the taxonomy in Peng et al. (EMNLP Findings'25) and the roadmap in Autonomous Information Seeking (arXiv:2607.04433), adds four properties that are individually necessary and jointly sufficient for the term to be scientifically meaningful rather than marketing language:"),
      bullet("Persistent memory: state (preferences, contradictions, goals) carried and revised across sessions, not just within a context window."),
      bullet("Autonomous planning: multi-step decomposition of an ambiguous request into sub-goals, with the ability to revise the plan given new evidence (not a fixed pipeline)."),
      bullet("Tool use / environment interaction: the agent decides when and which external resources (retrievers, KGs, traditional rankers, search) to invoke, rather than always executing a hard-coded sequence."),
      bullet("Closed-loop adaptation: the agent observes the consequence of its own actions (user feedback, environment state) and updates behavior — not just parameters — within and across interactions."),
      P("The scientific contribution of 'agency' is therefore an empirical claim about the causal effect of adding these four properties, which is precisely what §5.12 shows is under-tested. Idea #14 below directly operationalizes this distinction as a falsifiable factorial experiment rather than a rhetorical claim."),

      // ================= 7 =================
      new Paragraph({ children: [new PageBreak()] }),
      H1("7. Proposed Novel Research Directions"),
      P("13 directions are proposed. Each is scoped to be more than 'add an LLM / RAG / prompting / multiple agents' — every idea targets a specific mechanism, metric, or causal claim absent from the reviewed literature."),

      H2("Idea 1 — Memory Attribution for Agentic Recommenders"),
      B("Gap: ", "Memory systems (AgentCF, A-Mem, AMEM4Rec) store and retrieve but never quantify which stored memory item caused a given recommendation."),
      B("Hypothesis: ", "Influence-style attribution of memory entries to recommendation outputs can identify harmful/stale memories, and attribution-guided pruning outperforms recency/random pruning."),
      B("Method: ", "Leave-one-memory-out (LOMO) counterfactual re-inference, approximated via embedding-similarity weighting and validated against literal re-runs on a subsample."),
      B("Dataset: ", "Amazon CDs & Vinyl / MovieLens-1M with AgentCF-style memory logs."),
      B("Baseline: ", "AgentCF, A-Mem/Mem0 adapted to recommendation, without attribution."),
      B("Evaluation: ", "Correlation between attribution score and true LOMO quality delta; downstream NDCG/HR after attribution-guided vs. recency/random pruning."),
      B("Novelty: ", "No reviewed memory system quantifies causal contribution of individual memories to specific outputs."),
      B("Difficulty: ", "Medium."),

      H2("Idea 2 — Memory-Poisoning Attacks on Agentic Recommenders"),
      B("Gap: ", "Persistent-memory agents treat all interaction history as trustworthy; no study of adversarial injected interactions biasing long-term memory (distinct from model-extraction attacks like LLM4MEA)."),
      B("Hypothesis: ", "A small number of adversarial interaction turns strategically placed in history can systematically bias persistent memory and shift future recommendations; recency/frequency-based consolidation fails to filter them."),
      B("Method: ", "Injection-attack templates (fake preference statements, decoy purchases) inserted into simulated trajectories; measure recommendation drift; propose a trust-weighted, cross-session-consistency-based defense."),
      B("Dataset: ", "AgentRecBench / RecUserSim simulators."),
      B("Baseline: ", "Vanilla AgentCF / Mem0-style memory pipelines without defense."),
      B("Evaluation: ", "Attack success rate (share of exposure shifted to attacker-target items), defense recovery rate."),
      B("Novelty: ", "First treatment of memory poisoning (not prompt injection, not model extraction) as an attack surface in agentic RS."),
      B("Difficulty: ", "Medium–High."),

      H2("Idea 3 — Attention-Budget-Constrained Conversational Recommendation"),
      B("Gap: ", "Multi-turn CRS/agent papers optimize task success but not the user's finite attention budget across turns/tool calls/clarifications."),
      B("Hypothesis: ", "Modeling user attention as a decaying budget and optimizing under it via RL yields higher satisfaction-per-effort than unconstrained agents, even at slightly lower raw accuracy."),
      B("Method: ", "Formalize interaction as a budget-constrained MDP; reward = accuracy − λ·attention-cost; calibrate cost function to turn-count/abandonment statistics from public CRS datasets (ReDial)."),
      B("Dataset: ", "RecoWorld / τ-Rec simulator; ReDial for cost calibration."),
      B("Baseline: ", "InteRecAgent, MACRS (unconstrained multi-turn)."),
      B("Evaluation: ", "Satisfaction-per-turn, task success @ turn-budget k, dropout-adjusted NDCG."),
      B("Novelty: ", "Formal attention-budget MDP objective, not just clarification-count minimization."),
      B("Difficulty: ", "Medium."),

      H2("Idea 4 — Query-Adaptive Tool-Budget Allocation for Recommender Agents"),
      B("Gap: ", "Tool-using agents (InteRecAgent, RecMind, ToolRec) call tools reactively at fixed cost; SkillGraph studies general tool-sequence prediction, not RS-specific cost/quality budgeting conditioned on query complexity."),
      B("Hypothesis: ", "A lightweight query-complexity estimator can predict marginal utility of additional tool calls, letting an agent match always-max-tool accuracy at a fraction of inference cost."),
      B("Method: ", "Complexity estimator (query embedding + history entropy) feeds a bandit/RL policy over tool-sequence length; reward = accuracy − cost."),
      B("Dataset: ", "Amazon Beauty/CDs, MovieLens-1M with an InteRecAgent-style tool suite."),
      B("Baseline: ", "InteRecAgent (fixed pipeline), RecMind (cost-unaware planning)."),
      B("Evaluation: ", "NDCG/HR vs. average tool calls and latency (Pareto frontier)."),
      B("Novelty: ", "Cost-aware, query-adaptive tool orchestration — existing efficiency work targets decoding, not tool-call budgeting."),
      B("Difficulty: ", "Medium."),

      H2("Idea 5 — Emergent Collusion in Buyer-Agent × Recommender-Agent Marketplaces"),
      B("Gap: ", "Strategic Buying Agents and ACES study buyer-agent behavior in isolation; multi-agent RS work studies fairness/negotiation but not repeated buyer-agent ↔ recommender-agent co-adaptation, an algorithmic-collusion question unaddressed in agentic RS."),
      B("Hypothesis: ", "Repeated interaction between LLM-driven buyer agents and an engagement-optimized recommender agent drifts toward tacit-collusion-like equilibria (reduced diversity, higher clearing prices) without explicit communication."),
      B("Method: ", "Extend the ACES sandbox / SUBER with multiple buyer-agent strategies and an adaptive recommender agent; run repeated market rounds; test diversity-constraint / exploration-bonus mitigations."),
      B("Dataset: ", "ACES sandbox + Amazon product metadata for realism."),
      B("Baseline: ", "Static (non-adaptive) recommender; single-agent-only settings."),
      B("Evaluation: ", "Herfindahl-Hirschman concentration index, price dispersion, diversity@k over time, user-welfare proxy."),
      B("Novelty: ", "First application of algorithmic-collusion economics to agentic RS × autonomous buying agents, timely given the 2025–2026 rise of agentic commerce."),
      B("Difficulty: ", "High (PhD-level)."),

      H2("Idea 6 — Catastrophic Forgetting in Self-Evolving Agent Memory"),
      B("Gap: ", "Self-EvolveRec / AgentX evolve model code; Drift-Aware Continual Tokenization addresses tokenizer drift — none study forgetting within the agent's own retrieval-based memory store as it jointly evolves memory schema and recommendation policy."),
      B("Hypothesis: ", "Joint evolution without stability-plasticity regularization causes measurable forgetting of stable long-term preferences (regression on 'anchor' items), mitigable via a dual-memory (frozen core + fast-plastic buffer) design."),
      B("Method: ", "Simulate long deployments (500+ sessions/user, injected drift schedule) on RecoWorld/τ-Rec; compare dual-memory vs. single-memory (AgentCF, A-Mem) agents; plot forgetting curves."),
      B("Dataset: ", "Synthetic long-horizon trajectories from MovieLens/Amazon with injected drift, following AgentRecBench's evolving-interest methodology."),
      B("Baseline: ", "AgentCF, Continual LoRA Adapters (as a non-agentic reference point)."),
      B("Evaluation: ", "Anchor-item accuracy drop over time, adaptation speed to genuine drift, stability-plasticity Pareto curve."),
      B("Novelty: ", "First formal treatment of forgetting in agent memory (retrieval-based) as distinct from forgetting in model weights."),
      B("Difficulty: ", "Medium–High."),

      H2("Idea 7 — Goal-Conditioned Recommendation Agents with Life-Context Awareness"),
      B("Gap: ", "Beyond Offline A/B Testing (arXiv:2604.09549) explicitly flags that simulators ignore external life-context (trip vs. house move); no agent-design paper represents user goals as structured, lifecycle-tracked objects distinct from flat preference vectors."),
      B("Hypothesis: ", "Explicitly tracking goals (type, entities, deadline, state: active/completed/abandoned) and conditioning multi-session planning on them reduces 'goal-blind' recommendations and improves goal-aware relevance vs. flat-memory agents."),
      B("Method: ", "Define a goal schema; build a goal-tracking module updated from dialogue + implicit signals; plan multi-session trajectories conditioned on active goals; build a small goal-annotated benchmark atop ReDial/CRS data via LLM-assisted + human-validated annotation (a dataset contribution in itself)."),
      B("Dataset: ", "New goal-annotated CRS benchmark (derived from ReDial) + context-aware simulator methodology (arXiv:2604.09549) for validation."),
      B("Baseline: ", "InteRecAgent, RecMind, AgentCF (flat-memory agentic baselines)."),
      B("Evaluation: ", "Goal-completion rate, goal-conditioned NDCG, goal-blind-recommendation rate."),
      B("Novelty: ", "First recommendation agent with goals as first-class, lifecycle-tracked planning objects; directly answers a gap explicitly named in 2026 literature."),
      B("Difficulty: ", "Medium — strong dataset + method + evaluation story."),

      H2("Idea 8 — Interpretable Engagement–Welfare Trade-off via Agent Negotiation"),
      B("Gap: ", "PrefRec, LTP-MMF, and Creator-Oriented Information Revelation optimize a single scalarized objective; none expose the trade-off as an auditable, user-adjustable process."),
      B("Hypothesis: ", "A two-agent negotiation architecture (engagement agent vs. welfare agent, arbitrated by a user-adjustable dial) yields more interpretable, better-calibrated trade-offs than single-objective RL."),
      B("Method: ", "Each sub-agent proposes candidate slates + natural-language justification; an arbiter combines them under the dial; log disagreement magnitude as an auditability signal."),
      B("Dataset: ", "MovieLens-1M / Steam with simulated binge/diversity-sensitive users (PUB personality simulator)."),
      B("Baseline: ", "PrefRec (single scalarized reward), plain diversity-constrained re-ranking."),
      B("Evaluation: ", "Welfare proxy (provider Gini, diversity@k), correlation between dial setting and measured behavior."),
      B("Novelty: ", "Exposes trade-off via multi-agent disagreement instead of a hidden scalar weight."),
      B("Difficulty: ", "Medium–High."),

      H2("Idea 9 — Module-Level Error-Attribution Benchmark for Agentic RS"),
      B("Gap: ", "AgentRecBench, τ-Rec, RecRM-Bench report end-to-end HR/NDCG/reward-model scores; none localize failure to memory-retrieval vs. planning vs. tool-selection vs. reasoning/hallucination errors, unlike general-agent work (e.g., 'Beyond the Final Answer', arXiv:2510.02837) which has no RS analogue."),
      B("Hypothesis: ", "Agent failures are dominated by a small number of module-level error types whose relative frequency shifts systematically by task regime (classic / evolving-interest / cold-start); fixing the dominant error type yields the largest accuracy gain (causally verifiable)."),
      B("Method: ", "Define a failure taxonomy; build an LLM-judge + human-verified annotation protocol; apply to trajectories from open-source agents (AgentCF, InteRecAgent, RecMind) on AgentRecBench's three scenarios; run targeted ablations to confirm causal impact."),
      B("Dataset: ", "AgentRecBench (extended with trajectory logs)."),
      B("Baseline: ", "Status quo — aggregate accuracy metrics alone."),
      B("Evaluation: ", "Inter-annotator agreement on taxonomy; correlation between module-error reduction and downstream accuracy gain."),
      B("Novelty: ", "Shifts evaluation from outcome-only to causal, module-localized diagnosis; buildable atop an existing open benchmark."),
      B("Difficulty: ", "Low–Medium — excellent B.Tech / undergraduate-publication candidate."),

      H2("Idea 10 — Contradiction-Aware Memory Update for Session-vs-Long-Term Conflicts"),
      B("Gap: ", "AMEM4Rec, MemRerank, Mem-α emphasize accumulation/retrieval, not principled conflict resolution when a session signal contradicts a long-held preference (e.g., a one-off exception purchase)."),
      B("Hypothesis: ", "Explicit contradiction detection (entailment/embedding-based) combined with graduated, confidence-weighted belief updates reduces both over-adaptation to noise and under-adaptation to genuine drift, versus recency- or frequency-only rules."),
      B("Method: ", "Contradiction scorer flags conflicting evidence; Bayesian-style confidence update replaces hard overwrite; test against synthetic 'noise event' vs. 'genuine drift' scenarios."),
      B("Dataset: ", "MovieLens/Amazon with injected controlled noise vs. sustained-drift events (synthetic, precisely specified)."),
      B("Baseline: ", "AgentCF memory update, A-Mem, naive recency-weighted memory."),
      B("Evaluation: ", "Precision/recall distinguishing noise vs. drift; downstream NDCG robustness to injected noise; adaptation lag to genuine drift."),
      B("Novelty: ", "Formal contradiction-aware Bayesian update — existing memory frameworks conflate noise-rejection and drift-adaptation."),
      B("Difficulty: ", "Medium — strong B.Tech/undergraduate project."),

      H2("Idea 11 — Simulation-to-Real Validity of LLM User Simulators"),
      B("Gap: ", "Agent4Rec, SimUSER, RecUserSim, PUB claim fidelity via internal consistency; Bernard & Balog (SIGIR-AP'25) flag validity conceptually, but no quantitative study tests whether algorithm rankings are preserved between simulated and real-log evaluation."),
      B("Hypothesis: ", "Algorithm rankings from LLM-simulator evaluation do not reliably preserve rankings from held-out real logs, and the breakdown is systematically related to simulator design choices (persona granularity, memory depth, personality modeling)."),
      B("Method: ", "Evaluate N algorithms (traditional + agentic) both via held-out real logs and via multiple open-source simulators; compute Kendall's tau between real and simulated rankings; ablate simulator components."),
      B("Dataset: ", "MovieLens-1M / Amazon logs (real) + open-source simulator code (Agent4Rec, PUB, RecUserSim)."),
      B("Baseline: ", "The field's current implicit assumption of simulator validity (no correlation check)."),
      B("Evaluation: ", "Kendall's tau / Spearman correlation, sensitivity analysis on simulator components."),
      B("Novelty: ", "Meta-evaluation study resolving a validity gap explicitly named but not quantitatively tested in recent literature."),
      B("Difficulty: ", "Low–Medium — excellent B.Tech project; requires no new deployment, only public code/data."),

      H2("Idea 12 — Differentially Private Long-Term Memory for Personal Recommendation Agents"),
      B("Gap: ", "Personal AI agents (iAgent, shopping agents) accumulate rich, persistent memory; DP-recommendation literature targets model training, not the memory-consolidation step of an agent that stores raw text."),
      B("Hypothesis: ", "Applying DP noise/clipping at the periodic memory-summarization step (not raw text storage) achieves a formally bounded privacy budget while retaining most of the utility gained from long-term memory."),
      B("Method: ", "DP-SGD-style noise injection on aggregated preference summaries; vary epsilon; measure utility vs. epsilon; run a membership-inference attack as a privacy audit."),
      B("Dataset: ", "MovieLens/Amazon with an AgentCF-style memory pipeline."),
      B("Baseline: ", "Non-private AgentCF memory; regex-based PII redaction (naive baseline)."),
      B("Evaluation: ", "HR/NDCG at varying epsilon; membership-inference AUC; summarization-quality degradation."),
      B("Novelty: ", "First DP treatment specifically targeting agent memory consolidation in RS, distinct from DP model training."),
      B("Difficulty: ", "Medium–High."),

      H2("Idea 13 — Factorial Decomposition of 'Agentic' Gains (What Does Agency Actually Add?)"),
      B("Gap: ", "Nearly every agentic-RS paper compares a full agent (memory + planning + tool-use + reflection) against a single plain-LLM baseline, conflating four components into one binary condition — the central open question named in §5.12 and §6."),
      B("Hypothesis: ", "The relative contribution of memory, planning, tool-use, and reflection is uneven and shifts systematically by task regime — e.g., tool-use dominates for classic recommendation, memory dominates for evolving-interest, planning/reflection dominate for cold-start — such that a single 'agent vs. non-agent' comparison is scientifically uninformative."),
      B("Method: ", "Build a modular agent scaffold with four independently toggleable components on a shared backbone; run all 16 (2⁴) configurations across AgentRecBench's three scenarios; analyze main and interaction effects via factorial ANOVA."),
      B("Dataset: ", "AgentRecBench (classic / evolving-interest / cold-start scenarios)."),
      B("Baseline: ", "Plain LLM zero-shot recommender (no components); full agent (all four on) — the two extremes currently reported in the literature."),
      B("Evaluation: ", "HR@k/NDCG@k per configuration; ANOVA main/interaction effect sizes (partial η²); cost (LLM/tool calls) per configuration."),
      B("Novelty: ", "First causal, factorial decomposition of agentic-RS gains; directly reframes the field's dominant (and under-justified) evaluation practice."),
      B("Difficulty: ", "Low–Medium — outstanding B.Tech / undergraduate-publication candidate."),

      // ================= 8 =================
      new Paragraph({ children: [new PageBreak()] }),
      H1("8. Prioritization of Top 5"),
      P("Scored 1 (low) – 5 (high) on Novelty, Scientific Depth, B.Tech Feasibility, Dataset Availability, Compute Requirement (5 = low compute, favorable), Measurability, and Publication Potential."),
      makeTable(
        ["Rank", "Idea", "Novelty", "Sci. Depth", "Feasibility", "Data Avail.", "Compute (5=light)", "Measurability", "Pub. Potential"],
        [
          ["1", "#13 Factorial 'Agentic-ness' Ablation", "4", "5", "5", "5", "4", "5", "5"],
          ["2", "#9 Module-Level Error-Attribution Benchmark", "4", "4", "5", "5", "4", "4", "4"],
          ["3", "#7 Goal-Conditioned Recommendation Agents", "5", "4", "3", "3", "4", "3", "4"],
          ["4", "#10 Contradiction-Aware Memory Update", "4", "4", "4", "4", "4", "4", "3"],
          ["5", "#11 Simulation-to-Real Validity Study", "4", "3", "5", "5", "5", "4", "4"]
        ],
        [700, 3300, 900, 1000, 950, 950, 1250, 1150, 1150]
      ),
      P(""),
      P("Excluded from the top 5 despite genuine novelty: #5 (collusion) and #6 (catastrophic forgetting) require multi-week simulation infrastructure and longer horizons — better suited to a PhD track (see §9); #2 (memory poisoning) and #12 (DP memory) require security/privacy expertise beyond typical B.Tech scope but remain strong stretch options."),

      // ================= 9 =================
      H1("9. Recommended Paths"),
      B("Best B.Tech project (single semester, clear deliverable): ", "Idea #13 — Factorial Decomposition of 'Agentic' Gains. Fully reproducible on an existing open benchmark (AgentRecBench) and an open-weight backbone (e.g., Qwen2.5-7B-Instruct or Llama-3.1-8B), runnable on a single GPU / Colab-class compute, with a clean statistical story (ANOVA) and a concrete, checkable deliverable: an open-source modular agent scaffold plus a factorial results table."),
      B("Best undergraduate-publication idea (workshop/short-paper scope): ", "Idea #7 — Goal-Conditioned Recommendation Agents with Life-Context Awareness. Combines a genuine dataset contribution (goal-annotated CRS benchmark) with a new architectural component (goal-lifecycle tracking) and a clear evaluation story, directly answering a gap explicitly named in a 2026 paper (arXiv:2604.09549) — a strong angle for a RecSys/SIGIR workshop or short paper."),
      B("Ambitious long-term / PhD-level direction: ", "Idea #5 — Emergent Collusion in Buyer-Agent × Recommender-Agent Marketplaces. Requires building longitudinal multi-agent market simulation infrastructure and importing algorithmic-collusion economics methodology into agentic RS — high scientific depth, timely given the 2025–2026 emergence of agentic commerce (Strategic Buying Agents, ACES), and extensible into a multi-paper thesis (mechanism design, regulation-relevant mitigations, empirical validation with real agent traffic)."),

      // ================= 10 =================
      new Paragraph({ children: [new PageBreak()] }),
      H1("10. Full Research Proposal — Best Idea"),

      H2("Title"),
      P("Decomposing Agency: A Factorial Ablation Framework for Isolating the Causal Contribution of Memory, Planning, Tool-Use, and Reflection in LLM-Based Recommendation Agents"),

      H2("Problem"),
      P("The 2025–2026 agentic-RS literature almost universally reports a single comparison: a full agent (memory + planning + tool-use + reflection, all simultaneously present) against a plain LLM-prompting baseline. This conflates four architecturally distinct additions into one binary condition, so the field's central claim — 'agency improves recommendation' — is currently under-specified as science: it does not say which component, in which task regime, produces the effect."),

      H2("Research Gap"),
      P("No reviewed paper (AgentCF, RecMind, InteRecAgent, MACRec, the EMNLP Findings'25 survey, or AgentRecBench itself) performs a factorial ablation that independently toggles memory, planning, tool-use, and reflection on a shared backbone across multiple task regimes (§5.12, §6)."),

      H2("Research Question"),
      P("RQ: Which agentic components causally drive recommendation-quality gains, and does their relative contribution shift systematically across classic, evolving-interest, and cold-start recommendation regimes?"),

      H2("Hypothesis"),
      P("H1: The main effect of each component (memory, planning, tool-use, reflection) on HR@k/NDCG@k is statistically significant but unequal in magnitude. H2: The rank order of component importance differs significantly by task regime (interaction effect between component and scenario is non-zero) — specifically, memory is predicted to dominate in the evolving-interest regime, tool-use in the classic regime, and planning/reflection in the cold-start regime."),

      H2("Architecture"),
      P("A single shared LLM backbone (e.g., Qwen2.5-7B-Instruct, cross-checked with Llama-3.1-8B-Instruct for robustness) wrapped in a modular agent scaffold with four independently toggleable components, all using otherwise-identical prompt templates:"),
      bullet("Memory module — session memory + persistent cross-session store, following the AgentCF/A-Mem design (retrieval by embedding similarity, simple recency-weighted consolidation when enabled)."),
      bullet("Planner module — ReAct-style multi-step task decomposition (sub-goal generation before tool calls) vs. direct single-shot generation when disabled."),
      bullet("Tool-use module — callable candidate retriever, reranker, and metadata filter (InteRecAgent-style) vs. reliance on the LLM's parametric knowledge alone when disabled."),
      bullet("Reflection module — a post-hoc self-critique pass before finalizing the recommendation vs. no self-critique when disabled."),

      H2("Method"),
      bullet("Implement the scaffold with clean on/off flags per component, sharing a common prompt/config framework so only the targeted component varies between runs."),
      bullet("Run all 16 (2⁴) configurations on each of AgentRecBench's three scenarios (classic, evolving-interest, cold-start), using a fixed subset (~100–200 users/items, matching AgentCF's own dense/sparse subset convention) to keep compute tractable."),
      bullet("Record HR@1/5/10, NDCG@5/10, and per-recommendation LLM/tool-call count (cost) for every configuration."),
      bullet("Fit a full-factorial ANOVA (component × scenario) to estimate main effects and two-way interaction effects; report effect sizes (partial η²)."),
      bullet("Validate the hypothesis-implied best configuration per scenario against the empirically best configuration found (rank agreement check)."),
      bullet("Robustness check: repeat the full factorial grid with a second backbone (Llama-3.1-8B-Instruct) to test whether the effect ranking replicates across models."),

      H2("Dataset"),
      P("AgentRecBench (arXiv:2505.19623) — provides the interactive textual simulator with rich user/item metadata and the three target scenarios out of the box, avoiding the need to build new evaluation infrastructure. Cross-validated with the MovieLens-1M / Amazon CDs & Vinyl subsets used by AgentCF for the underlying interaction data."),

      H2("Baselines"),
      bullet("Plain LLM zero-shot prompting recommender (all four components off) — the field's default 'non-agentic' comparator."),
      bullet("Full agent (all four components on) — the field's default 'agentic' comparator, i.e., what most 2025–2026 papers report as their proposed system."),
      bullet("A non-LLM anchor (SASRec / BPR-MF) to contextualize absolute performance."),

      H2("Metrics"),
      bullet("Recommendation quality: HR@1/5/10, NDCG@5/10 per configuration per scenario."),
      bullet("Cost: mean LLM calls and tool calls per recommendation."),
      bullet("Statistical: main-effect and interaction-effect sizes (partial η²) from factorial ANOVA; Kendall's tau between hypothesis-predicted and empirically observed component-importance ranking per scenario."),

      H2("Experiments"),
      B("E1 — Full factorial run: ", "All 16 configurations × 3 scenarios on the primary backbone; establishes main results table and ANOVA."),
      B("E2 — Cross-model robustness: ", "Repeat on a second open-weight backbone; test whether component-importance ranking is backbone-dependent."),
      B("E3 — Cost-quality Pareto analysis: ", "Plot all 16 configurations' quality against their LLM/tool-call cost per scenario to identify Pareto-efficient component subsets (practically useful even if not the full agent)."),

      H2("Expected Contribution"),
      bullet("The first causal, factorial decomposition of what 'agentic' recommendation gains actually come from, rather than a single conflated agent-vs-non-agent comparison."),
      bullet("Practical guidance for practitioners: which component to prioritize engineering effort on, conditioned on task regime (cold-start vs. evolving-interest vs. classic)."),
      bullet("A methodological argument, backed by data, that the field's current default evaluation practice (single agent-vs-non-agent comparison) is scientifically under-informative — directly actionable as a critique/position contribution."),
      bullet("A reusable, open-source modular agent scaffold and factorial-evaluation protocol that other researchers can apply to new agentic-RS systems as they are proposed."),

      // ================= References =================
      new Paragraph({ children: [new PageBreak()] }),
      H1("References (arXiv / DOI links)"),
      linkPara("A Survey on Large Language Models for Recommendation — arXiv:2305.19860", "https://arxiv.org/abs/2305.19860"),
      linkPara("AgentCF: Collaborative Learning with Autonomous Language Agents for Recommender Systems — WWW'24", "https://dl.acm.org/doi/10.1145/3589334.3645537"),
      linkPara("MACRec: A Multi-Agent Collaboration Framework for Recommendation — arXiv:2402.15235 (SIGIR'24)", "https://arxiv.org/abs/2402.15235"),
      linkPara("A Survey on LLM-powered Agents for Recommender Systems — arXiv:2502.10050 (EMNLP Findings'25)", "https://arxiv.org/abs/2502.10050"),
      linkPara("AgentRecBench: Benchmarking LLM Agent-based Personalized Recommender Systems — arXiv:2505.19623", "https://arxiv.org/abs/2505.19623"),
      linkPara("τ-Rec: A Verifiable Benchmark for Agentic Recommender Systems — arXiv:2606.10156", "https://arxiv.org/abs/2606.10156"),
      linkPara("Autonomous Information Seeking: A Roadmap for Agentic Recommender Systems — arXiv:2607.04433", "https://arxiv.org/abs/2607.04433"),
      linkPara("iAgent: LLM Agent as a Shield between User and Recommender Systems — arXiv:2502.14662", "https://arxiv.org/abs/2502.14662"),
      linkPara("A-Mem: Agentic Memory for LLM Agents — arXiv:2502.12110 (NeurIPS'25)", "https://arxiv.org/abs/2502.12110"),
      linkPara("Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory — arXiv:2504.19413", "https://arxiv.org/abs/2504.19413"),
      linkPara("AMEM4Rec: Leveraging Cross-User Similarity for Memory Evolution in Agentic LLM Recommenders — arXiv:2602.08837", "https://arxiv.org/abs/2602.08837"),
      linkPara("Self-EvolveRec: Self-Evolving Recommender Systems with LLM-based Directional Feedback — arXiv:2602.12612", "https://arxiv.org/abs/2602.12612"),
      linkPara("AgentX: Towards Agent-Driven Self-Iteration of Industrial Recommender Systems — arXiv:2606.26859", "https://arxiv.org/abs/2606.26859"),
      linkPara("SimUSER: Simulating User Behavior with LLMs for Recommender System Evaluation — arXiv:2504.12722", "https://arxiv.org/abs/2504.12722"),
      linkPara("RecUserSim: A Realistic and Diverse User Simulator for Evaluating CRS — arXiv:2507.22897 (WWW Companion'25)", "https://arxiv.org/abs/2507.22897"),
      linkPara("PUB: An LLM-Enhanced Personality-Driven User Behaviour Simulator — arXiv:2506.04551 (SIGIR'25)", "https://arxiv.org/abs/2506.04551"),
      linkPara("Beyond Offline A/B Testing: Context-Aware Agent Simulation for RS Evaluation — arXiv:2604.09549", "https://arxiv.org/abs/2604.09549"),
      linkPara("Breaking User-Centric Agency: A Tri-Party Framework for Agent-Based Recommendation — arXiv:2603.10673", "https://arxiv.org/abs/2603.10673"),
      linkPara("PrefRec: Recommender Systems with Human Preferences for Reinforcing Long-term User Engagement — arXiv:2212.02779 (KDD'23)", "https://arxiv.org/abs/2212.02779"),
      linkPara("Towards Long-Term User Welfare via Creator-Oriented Information Revelation — arXiv:2510.10511", "https://arxiv.org/abs/2510.10511"),
      linkPara("Explicit User Manipulation in Reinforcement Learning Based Recommender Systems — arXiv:2203.10629", "https://arxiv.org/abs/2203.10629"),
      linkPara("What Is Your AI Agent Buying? Evaluation, Implications, and Emerging Questions for Agentic E-Commerce (ACES) — arXiv:2508.02630", "https://arxiv.org/abs/2508.02630"),
      linkPara("Strategic Buying Agents — arXiv:2607.04708", "https://arxiv.org/abs/2607.04708"),
      linkPara("Commercial Persuasion in AI-Mediated Conversations — arXiv:2604.04263", "https://arxiv.org/abs/2604.04263"),
      linkPara("SkillGraph: Graph Foundation Priors for LLM Agent Tool Sequence Recommendation — arXiv:2604.19793", "https://arxiv.org/abs/2604.19793"),
      linkPara("Drift-Aware Continual Tokenization for Generative Recommendation — arXiv:2603.29705", "https://arxiv.org/abs/2603.29705"),
      linkPara("Continual Low-Rank Adapters for LLM-based Generative Recommender Systems — arXiv:2510.25093", "https://arxiv.org/abs/2510.25093"),
      linkPara("RecRM-Bench: Benchmarking Multidimensional Reward Modeling for Agentic Recommender Systems — arXiv:2605.11874", "https://arxiv.org/abs/2605.11874"),
      linkPara("The Future is Agentic: Definitions, Perspectives, and Open Challenges of Multi-Agent Recommender Systems — arXiv:2507.02097", "https://arxiv.org/abs/2507.02097"),
      linkPara("Efficient Inference for Large Language Model-based Generative Recommendation — ICLR'25 (OpenReview)", "https://openreview.net/forum?id=ACSM177hq"),
      linkPara("Multi-Agentic Recommender Systems: Foundations, Design Patterns, and E-Commerce Applications — RecSys'25 Industrial Tutorial", "https://agenticrecsys.github.io/"),
      linkPara("AgentRecSys curated paper/code list (InteRecAgent, RecMind, Agent4Rec, RecAgent, MACRS, ToolRec, etc.) — GitHub", "https://github.com/agiresearch/AgentRecSys"),

      P(""),
      P("End of review.", { children: [new TextRun({ text: "End of review.", italics: true, size: 18, color: "777777" })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  require("fs").writeFileSync("D:/CapStone-48/Agentic_RS_Literature_Review.docx", buf);
  console.log("done");
});