# Regenerates the top of docs/roadmap/ROADMAP.md from items.json, keeping the hand-written tail.
import json,re,glob,functools,collections,os,datetime,tempfile
D=os.path.dirname(os.path.abspath(__file__))+'/'
R=os.path.join(D,'..','..','docs','roadmap')+'/'
items=json.load(open(os.path.join(tempfile.gettempdir(),'kronomind-roadmap-items.json'))); by={i['id']:i for i in items}
epics={}
for p in sorted(glob.glob(R+'epics/EPIC-*.md')):
    t=open(p).read(); m=re.match(r'# (EPIC-\d\d): (.*)',t); ph=re.search(r'\| Phases? \| (.*?) \|',t)
    epics[m.group(1)]={'title':m.group(2).strip(),'phases':ph.group(1).strip(),'file':'epics/'+p.split('/')[-1],'text':t}
def slug(h): return re.sub(r'[^a-z0-9 -]','',h.lower()).replace(' ','-')
def link(i): return f"[{i['id']}]({epics[i['epic']]['file']}#{slug(i['id']+' '+i['title'])})"
def deps(i): return ', '.join(i['depends_on']) or 'None'
@functools.lru_cache(None)
def depth(x): return 1+max([depth(d) for d in by[x]['depends_on']],default=0)
PH={'0':('Foundations and design proof','The workspace checks itself, the core model exists as types, and the "fact changed over time" scenarios exist as reviewed data.',
 '`pnpm check` passes in continuous integration on Linux and macOS arm64 (FL-002). A forbidden import fails the check (FL-001). The storage contract suite passes against the in-memory store (FL-012, FL-067). The eleven timeline scenarios validate against their schema (FL-027).'),
 '1':('Product 1 for code','Claude Code and Codex save and recall project memory through the MCP server, from one SQLite file, with as-of and known-at questions answered correctly.',
 'The smoke test records a fact, restarts the server and recalls it (FL-037). The storage contract suite passes against SQLite (FL-014 to FL-017, FL-068). Every extraction case passes in replay: each required fact is extracted and no forbidden one is (FL-069). The owner has registered the server with both hosts on an Apple Silicon Mac (FL-038). The performance targets in REQ-35 are met within their stated tolerance (FL-066).'),
 '2':('Self-correction','New information that conflicts with a stored fact is resolved, or proposed for approval, at write time. Feedback is recorded and acted on. Content can be purged.',
 'On the timeline scenarios in replay, the staleness rate and the false invalidation rate are 0 (FL-042). After a purge, the content cannot be read through any read method or query of the database (FL-061). Under the human-approval policy a change waits as a proposal until a person approves it with a command (FL-070).'),
 '3':('Self-healing','A maintenance run verifies code facts against the repository without an LLM, merges duplicate entities, repairs anchors and archives unused facts.',
 'On fixture repositories, with an LLM client that fails if called, a changed manifest version supersedes the stored fact (FL-062), and a deleted file or a missing function name flags it (FL-050, FL-071). A merge can be undone (FL-063). An archived fact is left out of recall and can be restored (FL-065, FL-073).')}
LATER={'4':('Generic core, Postgres and HTTP API','EPIC-10'),'5':('Document management','EPIC-11'),'6':('Domain adapters','EPIC-12')}
o=[]; w=o.append
w("# Roadmap\n")
w("The index of Kronomind's delivery plan: its phases, epics and work items, their dependencies and their status. Details of each work item are in its epic file. How to read and maintain this index is in [`README.md`](README.md); the requirements it traces to are in [`docs/product/REQUIREMENTS.md`](../product/REQUIREMENTS.md).\n")
done=[i for i in items if i["status"]=="Completed"]
review=[i for i in items if i["status"]=="Under Review"]
review_text=f" {len(review)} {'is' if len(review)==1 else 'are'} `Under Review`, waiting for the owner: {', '.join(i['id'] for i in review)}." if review else ""
w(f"**Status on {datetime.date.today().isoformat()}:** the first feature code exists. {len(done)} of {len(items)} work items {'is' if len(done)==1 else 'are'} `Completed`: {', '.join(i['id'] for i in done)}.{review_text} The rest are `Pending`. There are no dates in this plan.\n")
w("## Delivery phases\n")
w("A phase is a capability that can be demonstrated on a real system, not a list of tasks. A work item may start as soon as its own prerequisites are complete, whichever phase it is in.\n")
w("| Phase | Capability | Shown to be complete when | Work items |\n|---|---|---|---|")
for k,(n,c,e) in PH.items(): w(f"| {k}. {n} | {c} | {e} | {sum(1 for i in items if i['phase']==k)} |")
for k,(n,ep) in LATER.items():
    c=sum(1 for i in items if i['phase']==k)
    w(f"| {k}. {n} | See [{ep}]({epics[ep]['file']}) | Defined when the phase is near | {c if c else 'Not yet written'} |")
w("\n## Epics\n")
w("| Epic | Name | Phases | Work items | Status |\n|---|---|---|---|---|")
for e,v in epics.items():
    n=sum(1 for i in items if i['epic']==e)
    w(f"| [{e}]({v['file']}) | {v['title']} | {v['phases']} | {n if n else 'Written when the phase is near'} | Pending |")
w("\n## Work items\n")
# A later phase is listed once it has work items, such as the healthcare proof brought forward into phase 6.
for k,n in [(k,v[0]) for k,v in PH.items()]+[(k,v[0]) for k,v in LATER.items() if any(i['phase']==k for i in items)]:
    w(f"### Phase {k}: {n}\n"); w("| ID | Title | Epic | Depends on | Status |\n|---|---|---|---|---|")
    for i in items:
        if i['phase']==k: w(f"| {link(i)} | {i['title']} | {i['epic']} | {deps(i)} | {i['status']} |")
    w("")
w("## Dependencies\n")
w("Arrows point from a prerequisite to the work item that needs it. Only direct prerequisites are drawn. The order of epics and identifiers is not a dependency.\n")
def graph(phases,title):
    w(f"### {title}\n\n```mermaid\nflowchart LR")
    inside=[i for i in items if i['phase'] in phases]; ids={i['id'] for i in inside}
    ext=sorted({d for i in inside for d in i['depends_on'] if d not in ids})
    for e in epics:
        g=[i for i in inside if i['epic']==e]
        if not g: continue
        w(f"  subgraph {e.replace('-','')}[\"{e} {epics[e]['title']}\"]")
        for i in g: w(f"    {i['id'].replace('-','')}[\"{i['id']}\"]")
        w("  end")
    if ext:
        w("  subgraph EARLIER[\"Earlier phases\"]")
        for d in ext: w(f"    {d.replace('-','')}[\"{d}\"]")
        w("  end")
    for i in inside:
        for d in i['depends_on']: w(f"  {d.replace('-','')} --> {i['id'].replace('-','')}")
    w("```\n")
graph({'0','1'},'Phases 0 and 1'); graph({'2','3'},'Phases 2 and 3')
for k,(n,_) in LATER.items():
    if any(i['phase']==k for i in items): graph({k},f'Phase {k}')
w("## What can start when\n")
w("Work items grouped by how many steps of prerequisites lie behind them. Every item in a step can proceed at the same time as the others in that step, once its own prerequisites are complete.\n")
w("| Step | Work items |\n|---|---|")
for s in range(1,max(depth(i['id']) for i in items)+1): w(f"| {s} | {', '.join(i['id'] for i in items if depth(i['id'])==s)} |")
w("\nThe first work item is "+link(by['FL-001'])+", the scaffold. Nothing else can start before it.\n")
old=open(R+'ROADMAP.md').read(); tail=old[old.index('## Traceability'):]
open(R+'ROADMAP.md','w').write('\n'.join(o)+'\n'+tail)
# verify anchors
bad=0
for i in items:
    heads={slug(h) for h in re.findall(r'^#+ (.*)$',epics[i['epic']]['text'],re.M)}
    if slug(i['id']+' '+i['title']) not in heads: bad+=1; print('bad anchor',i['id'])
print('items',len(items),'bad anchors',bad,'max depth',max(depth(i['id']) for i in items))
