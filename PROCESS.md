# How we worked with AI

Log as you go: what we asked for, what we checked, what we threw away, and where we didn't take the first answer.

## Sat 24 Oct

- **Asked** Claude Code to read the brief, the operations context and the dataset before writing code. It found that drivers have only a name and a home city, so driver risk had to be built from assignments plus a labelled demo history.
- **Decided** a zero-dependency Node app instead of the starter's Next.js + Postgres + Docker, so judges can run it with `npm start`.
- **Rejected the first tuning:** the first engine run sent 17 of 54 orders to a person (31 %). That breaks "only what needs you". We changed it in three ways:
  - Tight-but-not-late buffers became agent-watched.
  - Late predictions built only from the plan (not tracking or a ferry booking) no longer block.
  - The 5 strike-affected ferries became one grouped decision.
  
  Result: 10 orders plus 1 banner.
- **Checked** each live source with curl before building on it (Open-Meteo, Fintraffic Digitraffic).
- **Caught a bug in review:** the first Undo button wiped every decision, not just the current one.
- **Threw away:** the starter's board of lanes, which is the cluttered layout the organisers showed as what not to do.
- **First agent runs failed, and we read the traces instead of trusting "Agent finished".** We found and fixed five problems:
  - Groq's 8k tokens-per-minute limit stopped every run. The agent now waits as told and retries, and tool outputs are smaller.
  - The model wrote its proposal as chat text instead of calling `propose_decision`. After 6 lookups it now gets only the hand-over tools.
  - Forcing one tool by name made `gpt-oss` fail on Groq. We offer a restricted tool list with `required` instead.
  - It invented a `commentary` tool and sent `cost_eur: null`. We retry malformed calls and allow null.
  - Our simulated driver offered "a hotel night" for a car-identity problem and steered the agent wrong. The simulator now answers from that person's real last message in the snapshot.
- **Reviewed every proposal by hand against the dataset.** On CD-420154 the agent proposed a €113 "Northrail ferry". That's actually a *train* for the driver. Root cause: our ferry tool dropped the `kind` field, so the model couldn't tell trains from ferries. Fixed the tool, not the prompt.
- **Result:** 8 of 10 flagged orders got a sourced proposal. Then Groq's free daily cap (200k tokens) ran out.
- **Real Helsinki–Tallinn timetable:** Viking Line's official page refused automated requests (403), and the aggregators disagree. We took one source (laevapiletid.ee, all three operators, service day 25 Oct) and saved it as-is. We dropped the overnight cruise rows (arrive 06:00–08:00 next day) as not useful for car moves, and labelled terminals as unverified and prices as indicative.
- **The first Estonia demo didn't escalate:** the engine correctly picked Viking XPRS 15:30 as the first sailing the driver could make, but our fake "few spaces" quote was on the 16:30. The timetable logic was right; the demo data was wrong, so we fixed the data.
- **Merged a parallel session by reading its transcript, not by trusting it:** a side chat fixed arrival estimates and agent-text formatting in the same files. We checked each file for both sets of changes and found no conflict, then re-tested the merged app.
- **The agent's times were UTC:** its CD-421105 proposal said "12:30" for a 15:30 sailing, because the tools handed it ISO UTC timestamps. Tools now speak Helsinki local time.
- **Facelift from Bahn's own site:** we read bahnexpress.com/about's computed styles (cream #FFFEF7, ink #12110E, warm-grey pills, wide heavy uppercase headings, black pill buttons). Its fonts are proprietary, so we used Archivo Expanded and Geist as stand-ins.
- **Switched the agent to Claude (claude-opus-5-5) via the official SDK:** Groq's free tier kept hitting its daily cap, and its small fallback model wrote weak Finnish. We kept Groq as a fallback when no Anthropic key is set. The model rejects forced tool choice, so after six lookups a text note asks it to decide. Its full responses, thinking included, go back into the history unchanged. On CD-420164 Claude spotted that the earlier run had asked the wrong site (pickup in Tampere, but the handover is signed at drop-off in Helsinki) and proposed one concrete call instead.
- **Finnish everywhere except people's messages:** dataset text (alerts, tasks, events), source labels and step summaries were English in the Finnish view. Each string is now translated once by Claude and cached in `data/i18n-fi.json` (325 strings). Messages stay as written. In the source drawer only field names are translated, never the recorded values.
- **"The dealer has no matching car" needed more than "wait":** empty pickups now offer four options, each saying what happens: wait one more hour, release the driver and reschedule, give the driver a nearby open job (found in the data: CD-420404), or cancel. The agent's instructions now say to weigh these too.
- **Caught a timing bug by reading Claude's output:** it said "Wed 08:27" for a driver deadline of 11:27, because the simulated replies quoted raw UTC timestamps. Fixed at the source, then re-ran.
- **Undo didn't fully undo:** it cleared the decision but left the agent's proposal marked approved. Undo now restores it.
- **Judge feedback "still visually heavy":** we rebuilt the order page around one action panel. It shows a countdown to the real deadline (ferry check-in, the driver's stated waiting limit, task due time), the reason, the one decision and a one-line arrival comparison. Below it sits a route map, and everything else folds into "Details". The queue is now sorted by deadline, and the most urgent row is called out.
- **Checked our own ferry prices:** we had guessed €119–149 for a Helsinki–Tallinn car crossing. Listing sites put a typical car-with-driver ticket at roughly €40–90 off-peak, so we lowered them. The long Germany → Finland crossing is the expensive one (aggregators average about €650–750 for a car).
- **Germany and Denmark:** Germany's Autobahn API is open, but the first pull returned 345 "closures", nearly all single ramps or lanes. We kept only fully blocked roads and live warnings. Denmark's official feed needs an access agreement, so it is marked "not connected" rather than faked.
- **Asked Bahn instead of guessing, then changed the rules.** At the event we asked Bahn 14 questions. Their answers contradicted some of our own assumptions, so we changed the engine and agent:
  - **Removed:** "driver not cleared for exceptional-value cars", value-based damage-claim reasons, "no EV experience", and a higher bar for expensive cars. Bahn trains every driver for every car and rarely moves cars over €100k.
  - **Added as the top signal:** a car picked up and a driver silent for 12 h or more. The agent asks the driver first at 6 h. A GPS gap alone now weighs little, because GPS drops in the German countryside.
  - **Lateness is soft:** a first late car is the agent's job; a customer who already had late cars escalates.
  - **Added:** Travemünde as a known trouble spot, and a seasonal winter-tyre rule (Finland/Estonia legal windows, Germany by conditions).
  - **Labelled:** EV winter range as an estimate, since Bahn has no data on it.
  - **Re-ran Claude** on CD-420452, which now keeps its driver instead of swapping on car value. A fictional order, CD-421106, demonstrates the silent-driver case, which the snapshot doesn't contain.
- **Map data loaded once, not on every run:** a per-route OpenStreetMap query timed out after 90 s. We fetched all of Finland once instead (6,487 stops in 116 s), saved it to `data/bahn.db` and matched stops to routes locally.
