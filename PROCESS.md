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
- **Map data loaded once, not on every run:** a per-route OpenStreetMap query timed out after 90 s. We fetched all of Finland once instead (6,487 stops in 116 s), saved it to `data/bahn.db` and matched stops to routes locally.
