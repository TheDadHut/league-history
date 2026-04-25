# Glossary

League lore, owner identities, and jargon used in the Gaming Disability League (GDL) history site. Required reading for any agent that writes content or analyzes stats.

> **Items tagged `<!-- TODO -->` need to be filled in by a human.** They're things I (Claude) can't infer from the code or existing highlights.

## League basics

- **League name:** Gaming Disability League (GDL)
- **Platform:** Sleeper
- **Inaugural season:** <!-- TODO: year, e.g. 2018 -->
- **Roster size / format:** <!-- TODO: roster slots, scoring (PPR/half/standard), trade deadline, playoff size -->
- **Total owners:** <!-- TODO: 10? 12? --> (active owners, not including past departures)

## Owners

Listed by Sleeper display-name fragment as it appears in `OWNER_COLORS` (in `index.html`). Add full Sleeper display names + real first names as you fill in.

| Key (substring match) | Display name | Real first name | Notes |
| --- | --- | --- | --- |
| `alex` | <!-- TODO --> | Alex | Commissioner. 2024 champion (Tee Higgins finals performance). Self-described "dictator of fantasy" / "babysitter." |
| `henny` | <!-- TODO --> | <!-- TODO --> | Strong waiver-wire operator. Renamed team "I Let Him Off the Hook" after losing the 2024 final to Alex. |
| `jason` | <!-- TODO --> | Jason | Rivalry with Jose. Got bad-trade-pumped in 2024 ("5-win streak, still missed playoffs"). |
| `jose` | <!-- TODO --> | Jose | Trade chaos agent. Famously dealt for Christian McCaffrey in 2024 (CMC played 2 games then re-injured). Pumped Jason with bad trades. Threw 2025 to keep Cat out of the toilet bowl (claims he didn't). |
| `justin` | <!-- TODO --> | Justin | Worst-to-finals run in 2025. Lost final because of Puka Nacua. |
| `liam` | <!-- TODO --> | Liam | <!-- TODO: distinguishing context --> |
| `michael` / `mike` | <!-- TODO --> | Michael | Both keys map to the same color (handles containing "Mike" share Michael's accent). Threw 2025 to juice Nick. |
| `nick` | <!-- TODO --> | Nick | Beneficiary of Michael's 2025 tank. |
| <!-- TODO: damien --> | <!-- TODO --> | Damien | In the contested 2025 Jose trade ("no one wanted to trade and bitched when Jose and Damien Traded"). |
| <!-- TODO: brandon --> | <!-- TODO --> | Brandon | Had a "legendary crashout" in 2025 ("Do you want me to come over?" / "It was nice being your friend while it lasted."). |
| <!-- TODO: cat --> | <!-- TODO --> | Cat (nickname?) | 2025 toilet-bowl participant; Jose allegedly threw to keep Cat from winning it. |

> **If an owner left the league** or only owned for a couple seasons, note that here so agents don't refer to them in the present tense.

## Champions

| Year | Champion | Runner-up | Notes |
| --- | --- | --- | --- |
| <!-- TODO: inaugural --> | <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| ... | ... | ... | ... |
| 2024 | Alex | Henny | Tee Higgins put up a top-10 league performance in the championship round. |
| 2025 | <!-- TODO --> | <!-- TODO: Justin? --> | Justin made finals (worst-to-finals run) but lost due to Puka Nacua underperformance. |

## Toilet Bowl (consolation bracket for the worst record)

| Year | Toilet Bowl winner | Notes |
| --- | --- | --- |
| <!-- TODO --> | <!-- TODO --> | <!-- TODO --> |
| 2025 | <!-- TODO: not Cat — Jose threw to prevent --> | Jose deliberately tanked to keep Cat out of it (claims he didn't). |

## Stat & feature jargon

Terms used across the site's tabs and analytics. Don't paraphrase — these are the names the league uses.

| Term | Meaning |
| --- | --- |
| **Hall of Champs** | The all-time list of league champions, top of the Overview tab. |
| **Best Trader Tile** | Visual on the Overview tab spotlighting the owner with the best trade history. |
| **Grand Larceny** | Leaderboard on the Trades tab ranking the most lopsided trades — measured two ways (WR / ST below). |
| **WR (While Rostered)** | Trade fairness scoring: points scored by a traded player *while the receiving team still rostered them*. Captures whether the recipient actually used the asset. |
| **ST (Season Total)** | Trade fairness scoring: all post-trade points scored by the player that season, regardless of who's rostering them. Captures the trade's full forward-looking value. |
| **DCE (Draft Capital Efficiency)** | Owner-level metric on the Owner Stats tab. Measures points produced per draft pick value spent. Formula is in `index.html` near `buildDraftGrades` / `buildWaiverGrades`. |
| **Waiver Grades** | Per-season letter grades on each owner's waiver-wire performance, on the Owner Stats tab. Computed locally — formula in `index.html` near `buildWaiverGrades`. |
| **Waiver Archetype** | Owner playstyle label on the Owner Stats tab (e.g., aggressive churner, light user). |
| **Hard-Luck Losses** | Fun Stats tab: weeks an owner scored above a threshold but still lost. |
| **Lucky Wins** | Fun Stats tab: weeks an owner scored below a threshold but still won. |
| **Clutch Index** | Fun Stats tab: performance in close games / playoff games vs. blowouts. |
| **Blowout Record** | Fun Stats tab: per-owner wins/losses by margin >= a threshold. |
| **Benching Analysis** | Fun Stats tab: points left on the bench, plus the worst individual "shoulda started him" calls per season. |
| **Luck Rating** | Luck & Streaks tab: actual record vs. record you'd have with median scoring (i.e., did the schedule treat you well or poorly?). |
| **Founders** | Inaugural-season roster of the league, on the Founders tab. |
| **Toilet Bowl** | Consolation bracket for the league's worst records — losing it is a badge of dishonor. |

## Recurring storylines & references

Things that come up across multiple seasons — useful for in-voice writing.

- **Jose vs. Jason rivalry.** Jose has an ongoing campaign of bad-trade-pumping Jason and trash-talking his football knowledge.
- **Alex the commissioner.** Recurring "dictator" / "corrupt commissioner" jokes. Won 2024 anyway.
- **Trade controversy as content.** When trades happen, owners complain. When they don't, they complain about that too.
- **<!-- TODO: more recurring jokes / references --> **

## Season-by-season cheat sheet

Bullet form, factual. Used by `highlights-writer` and `sports-stats-expert` for context. Add seasons as the league progresses.

### <!-- TODO: earlier seasons -->

### 2024

- Alex wins the championship; Tee Higgins delivers a top-10 league performance in the title round.
- Henny climbs the standings via aggressive waiver play; loses the final to Alex; renames team "I Let Him Off the Hook."
- Jose trades for Christian McCaffrey, who plays 2 games and re-injures.
- Jose pumps Jason with bad trades, gives Jason a 5-win streak; Jason still misses the playoffs.
- Jose vs. Jason football-knowledge debate; Jose backs it up by beating Jason head-to-head.
- "Alex exposed as a corrupt commissioner."

### 2025

- <!-- TODO: champion -->
- Michael throws his team to juice Nick.
- The Jose ↔ Damien trade triggers league-wide complaints.
- Alex re-asserts dictator-commissioner role ("babysitter, dictator of fantasy").
- Justin runs the table from last to finals; loses the final because of Puka Nacua.
- Jose deliberately throws to prevent Cat from winning the toilet bowl (denies it).
- Brandon has a legendary in-season crashout: "Do you want me to come over?" → "It was nice being your friend while it lasted."

## How agents should use this file

- **`highlights-writer`**: source of voice + identity. Never refer to an owner by `display_name` if there's a real first name here — use the first name. Match the dry, irreverent register of existing highlights.
- **`sports-stats-expert`**: when validating stat formulas, use the definitions in the jargon table — don't reinvent terms. When proposing new stats, give them names that fit the existing naming style.
- **`orchestrator`**: when a question involves a person or a piece of jargon, check this file before dispatching.
- **All agents**: if you find league lore in `highlights.json` or `index.html` that isn't captured here, flag it for the human to add — don't silently extend the glossary on your own.
