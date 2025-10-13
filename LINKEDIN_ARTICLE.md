# Building Production Systems with Multi-Agent AI: A 5-Week Case Study

While most developers use ChatGPT as autocomplete, I'm coordinating 8 simultaneous AI agents with Git-based synchronization to ship production systems. Here's what I learned about the future of software development.

---

## The Real Question

Every technical leader is asking the same thing: How does software development change when AI can implement but humans orchestrate?

Most teams are still in the single-session Q&A phase. One developer, one ChatGPT window, copy-paste code. That's not where this is going.

The real question is: **How do we coordinate multiple AI agents working in parallel at production scale?**

I spent 5 weeks finding out.

## What Got Built

Motosai is a realistic motorcycle MMO simulator. Full-stack multiplayer with real-time WebSocket synchronization, custom physics engine, cross-platform (desktop + mobile), deployed to production on Google Cloud Run.

71 commits over 5 weeks. ~27,000 lines of code. Solo developer.

But here's what matters: This wasn't about building a game. It was about validating a multi-agent development methodology at production scale.

The game is the proof. The methodology is the point.

## Why Motorcycles?

Two things frustrated me: Cyberpunk 2077's motorcycle physics (bikes turn from origin 0,0,0 - completely unrealistic) and GTA V's obsession with airborne vehicles. I wanted realistic motorcycle simulation with proper counter-steering and lean physics.

Technical hypothesis: Can WebSockets + Cloud Run host immersive multiplayer "basically free"?

Methodology question: Can documentation-driven multi-agent coordination work for complex production systems?

Five weeks later: Yes to both.

## The Architecture Problem

Realistic motorcycle physics isn't trivial. I asked Claude for research papers on motorcycle dynamics simulation. Fed those papers as context. Generated implementations of three different physics models. Added a keyboard key to switch between models while riding in real-time.

Testing each model by actually playing: The academic model from a 2008 paper felt too rigid. The simplified model from 2015 was too arcade-y. Ended up with a hybrid I fine-tuned by matching it to my actual motorcycle riding experience.

The physics implementation demonstrated something important: **AI can bridge research papers to production code.** Not copying Stack Overflow. Not guessing at formulas. Actually implementing academic models and making them playable.

Then came the memory leaks.

## The Memory Leak Saga

Every Three.js project I've built had memory leaks. I never cared because they were smaller scale. For a racing game, 60 FPS is non-negotiable. Memory management became a core design constraint.

The browser would crash after extended gameplay. Chrome DevTools Memory profiler showed heap growth. Heap snapshots revealed the culprits.

**September 7, afternoon. The memory leak sprint.**

Three AI agents in parallel:
- **Agent 1:** Physics engine - found 60 Vector3 allocations per second (one per frame for velocity calculations)
- **Agent 2:** HUD system - canvas contexts accumulating in DOM without cleanup
- **Agent 3:** General leaks - scattered allocations across TrafficSystem, Highway101, camera calculations

Each agent working on separate files. Minimal merge conflicts. Git-based coordination.

**6 commits in 40 minutes.** Memory usage stabilized. FPS jumped from 45 to 60.

This is what proper agent coordination looks like.

The physics leak solution: Object pooling. Three temp Vector3 objects reused across all calculations instead of allocating fresh objects every frame. The pattern worked so well I documented it for future agents.

Over the project: 12+ memory leaks systematically identified and resolved. Built custom profiling tools. Created in-game H menu showing real-time memory usage tracked every commit. Documented every pattern in a 400-line prevention checklist.

That checklist became crucial for agent coordination.

## Documentation-as-Protocol

Here's the core innovation: **Documentation serves as agent-to-agent communication.**

Every doc has dual purpose:
1. Human developers (standard documentation)
2. AI agents (executable context for implementation)

When Agent 1 finds a memory leak pattern and fixes it, Agent 1 documents the pattern. Agent 2 (or Agent 1 after context reset) reads that documentation and applies the pattern consistently across all new systems.

Example: `MEMORY_LEAK_PREVENTION_CHECKLIST.md`
- 400 lines documenting every pattern learned
- Covers: Animation frames, event listeners, timers, Three.js resource disposal
- Future agents reference this when implementing new systems
- Result: New systems ship leak-free from day one

The event listener pattern was particularly insidious:

```javascript
// This looks fine but LEAKS
window.addEventListener('resize', this.onResize.bind(this));
// Later...
window.removeEventListener('resize', this.onResize.bind(this)); // FAILS
```

Each `.bind()` creates a new function reference. You can't remove the listener because you're passing a different function reference to `removeEventListener`.

**Solution documented:**
```javascript
constructor() {
  this.boundOnResize = this.onResize.bind(this);
  window.addEventListener('resize', this.boundOnResize);
}

cleanup() {
  window.removeEventListener('resize', this.boundOnResize);
}
```

Once documented, I gave an agent the task: "Search entire codebase for `.bind()` in addEventListener calls, refactor all instances."

Done systematically across dozens of files. Perfect consistency. This is where AI agents excel.

## Multi-Agent Coordination

**Configuration:** 1-8 simultaneous Claude sessions running in parallel.

**Coordination mechanism:**
- Heavy Git usage for state synchronization
- Documentation files as communication protocol
- Each agent writes plans/progress for context persistence
- Future agents read prior documentation
- Pattern: Research → Context → Code → Test → Document → Next Agent

**Example workflow - Physics implementation:**
1. Ask AI for research papers on motorcycle dynamics
2. Feed papers as context to Agent 2
3. Agent 2 implements multiple physics models
4. Agent 3 adds keyboard switcher to test models live
5. Human tests and tunes by playing
6. Agent 4 documents final patterns
7. Future agents reference guide for bike variations

**Parallel execution example - Shared resource optimization:**

September 27. Chrome DevTools showed 200+ identical materials for road props (cacti, barriers, signs). Each prop creating its own material instance.

- **Agent 1:** Implement shared material system with reference counting
- **Agent 2:** Apply pattern to geometries
- Both agents updated pattern documentation

Result: 30% memory reduction. Pattern documented for future use.

**What worked:**
- Documentation-as-protocol enables consistent implementation
- Git prevents conflicts when tasks properly decomposed
- Parallel agents deliver speed (6 commits in 40 minutes demonstrated)
- Research → code pipeline works for complex domains
- Rapid iteration: Ship → Test → Find problems → Fix → Document

**What needed human involvement:**
- Design decisions (what to build, what to cut)
- Testing and validation (does it work, does it feel right?)
- Task decomposition (how to parallelize work)
- Creative vision (why is a UFO stealing french fries?)

## Design Decisions Under Fire

After testing, I removed the entire powerup system. ~500 lines of code deleted.

Testing showed players focused on collecting powerups and ignored traffic navigation. The core experience is realistic motorcycle physics + traffic. Powerups were scope creep that detracted from the vision.

Cut it.

Similarly: Pivoted environment from Highway 101 to Death Valley. Fewer assets needed. Procedural mountain generation using mathematical algorithms. Better mobile performance. More focused experience.

I've driven through Death Valley. I ride motorcycles. The authenticity matters.

The UFO stealing french fries? That needs narrative motivation. In Temple Run you steal the idol and are chased by the monster. In Motosai the monster steals from you and you chase it. What would an alien steal? Food everyone loves. French fries.

Absurd? Yes. But it works. Plus the UFO intro features a 3D Earth with height map - educational component showing surprising distances between points and mountain locations globally. All my games incorporate learning.

Design decisions remain human. AI accelerates implementation.

## The Multiplayer Validation

Technical hypothesis: Can WebSockets + Cloud Run host immersive multiplayer "basically free"?

**Answer: Yes.**

Architecture:
- Real-time WebSocket connections on Cloud Run
- Traffic master pattern: One client controls traffic, broadcasts state
- Server only relays (lightweight, scales)
- Supabase for persistence

The traffic master pattern offloads computation to clients. Server remains lightweight. Cost at current scale: essentially free.

The game supports cross-platform: desktop (keyboard/gamepad) and mobile (virtual joystick + touch zones). Same physics engine underneath. Input filtering adjusted appropriately (less smoothing for touch = more immediate response).

60 FPS maintained on desktop. 30+ FPS on mobile. Sub-100MB memory footprint, stable.

Production deployed. Playable. Validated.

## What This Proves

**Documentation-driven multi-agent development works at production scale.**

Evidence:
- ✅ 71 commits, 5 weeks, production deployment
- ✅ Complex technical challenges solved (physics, memory, multiplayer)
- ✅ Parallel agent execution delivers measurable speed
- ✅ Pattern documentation enables consistency across sessions
- ✅ Cross-platform, stable, performant

This isn't theoretical. It's validated.

**Where AI agents excel:**
- Systematic refactoring across many files
- Parallel module implementation
- Pattern application with perfect consistency
- Research → code pipeline
- Documentation generation as byproduct

**Where humans remain essential:**
- Design decisions (what to build)
- Testing and validation (does it work)
- Task decomposition (how to parallelize)
- Priority calls (ruthless MVP scoping)
- Creative vision (narrative, aesthetic)

The win isn't coding faster. It's **design iteration speed.** Try idea → implement → test → observe → adjust → document pattern. Fast feedback loop enables better decisions.

## The Research Trajectory

This is project two in a series exploring multi-agent orchestration:

**Intelligence** (ChatGPT 3.5 era): Multi-agent RAG system. Individual agent expertise and histories. Agents write reports enriched by subsequent agents. User queries specific agents for domain knowledge. Live but private.

**Motosai**: Documentation-driven multi-agent development at production scale. Validated patterns. Built profiling tools. Created comprehensive documentation-as-protocol.

**Imaprompt** (in progress): CMS API for prompts. URL-based prompt access. LLM-agnostic orchestration. Enriched payloads via HTTP requests.

The progression: Intelligence explored agent-based RAG. Motosai validated documentation-driven coordination. Imaprompt is building infrastructure to scale this approach.

Goal: Standardize patterns. Make multi-agent orchestration accessible to teams, not just individual developers willing to manually coordinate Git and sessions.

The methodology works. Now building infrastructure to scale it.

## What's Next

Short-term: Moving to courtroom simulator using GenAI. Time-boxed - want to get back to other work quickly.

Long-term: Imaprompt. Make these patterns accessible. LLM-agnostic. Team-friendly.

This is where software development is going. I'm not waiting for tools to emerge - I'm building them. Validating patterns. Documenting what works.

## Try It

The game is deployed and playable: https://storage.googleapis.com/motosai-app/index.html

The development journal with full technical details is on GitHub. The memory leak prevention checklist is there too - use it, it'll save you days of debugging.

This was a 5-week exploration of multi-agent development methodology. The next project is already underway.

If you're thinking about how AI changes software development at your organization, I'm happy to discuss what I've learned.

---

**Technical details:**
- 71 commits over 5 weeks
- 1-8 parallel AI agent sessions
- 12+ memory leaks systematically resolved
- 60 FPS desktop, 30+ FPS mobile
- WebSocket + Cloud Run: essentially free
- Cross-platform: desktop + mobile browsers
- Custom physics from academic research papers
- Production deployed and stable

**Key artifacts:**
- DEVELOPMENT_JOURNAL_2025-10-13.md: Complete technical retrospective
- MEMORY_LEAK_PREVENTION_CHECKLIST.md: 400-line pattern guide
- In-game H menu: Real-time memory tracking
- Custom profiling tools: MemoryProfiler, MaterialManager

**The methodology works. The game proves it.**

---

*Note: This article documents a methodology experiment conducted as part of ongoing research into multi-agent AI orchestration. Motosai was built for an informal hackathon but served primarily as production-scale validation of documentation-driven agent coordination patterns.*
