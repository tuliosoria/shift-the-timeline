// PUBLIC DEVELOPMENT DEMO — COMPLETE SPOILERS IN THIS SOURCE.
// Original fictional mystery. Not the private editorial case or a production-ready case.
export const catalog=[{id:'bracken-quay-demo',title:'The Last Light at Bracken Quay · public demo',available:true,location:'Bracken Quay Maritime Museum',description:'An original, public development mystery. The source and companion notes contain the solution.'}];
// Private suspect briefs: what each suspect knows, hides and must never say. Only the interviewed suspect’s brief reaches the AI.
const briefs={
 ada:`You are innocent. You did not make or witness the clearance. Voice: practical and dry; you distrust vague talk about “faults”.
What you know and say truthfully:
- From 17:30 to 18:00 today you checked the foyer lights with Dev Hales. The foyer is outside the Lantern Gallery; neither of you entered the service booth.
- Your signed commissioning sheet gives personal clearance authority to exactly three people: Rowan Calder, Leena Shah and Oscar Bell.
- The booth panel matches the palm of the authorised person, who must be physically present. A borrowed card cannot authorise anything. There is no remote clearance and no override.
- Iona stopped the model moving because an independent load test failed. The museum had already guaranteed everyone’s wages for the opening, so nobody gained by reopening it.
- You check wiring and lamps. You cannot certify the model or grant its clearance.
What you are evasive about: you are sore that Iona hired you only to check systems and never asked your opinion of the model. You change the subject if asked whether that annoyed you.
What you do not know: who made the clearance, the event record’s times, or anything about the museum’s accounts. Say so rather than guess.`,
 basil:`You are innocent. Voice: precise and a little prim; you trust your written sheet over anyone’s memory.
What you know and say truthfully:
- You stood at the sole service-booth doorway throughout 17:40–17:50. The booth was empty at 17:40. At 17:50 you checked its interior again: empty, nobody concealed.
- Your complete visitor sheet for 17:40–17:50 names only three people: Kit Mercer (collecting a lens), Priya Sen (checking a sightline) and Rowan Calder (collecting the programme). You saw each enter and leave.
- There is no second door and no window anyone could pass through.
- The trustees authorised a static display. Nobody needed the model to move to keep the event open.
- Iona asks you to record access even for senior staff.
What you are evasive about: staff gossip about Iona. She once corrected you in front of a trustee and you would rather not talk about who she has upset, yourself included.
What you do not know: what anyone did at the panel. You watched the doorway, not the controls. You know nothing about the accounts.`,
 cora:`You are innocent. Voice: exact and unhurried; you talk in terms of copies, signatures and dates.
What you know and say truthfully:
- From 17:35 to 17:55 you were with Nell Hart in the archive office, checking the bank’s certified payment confirmations.
- The supplier’s original invoice for the model was £8,000. The museum paid £18,000. The supplier confirmed receiving only £8,000. The extra £10,000 went to an account beneficially owned by Rowan Calder. These are certified records.
- At 16:30 you went with Iona to give Rowan her written notice: she will present those records to the trustees immediately after her opening speech at 18:00 tomorrow. She had asked Rowan for an explanation and received none.
- Copies of the records are already safe elsewhere, so her announcement could expose the diversion even if the originals disappeared.
What you are evasive about: where the copies are kept. You refuse to say, politely and firmly.
What you do not know: anything about the service booth, the panel or the model’s clearance. You cannot say who touched it.`,
 dev:`You are innocent. Voice: warm, busy, a caterer who notices who says what at the bar.
What you know and say truthfully:
- From 17:30 until 18:00 you checked the foyer lights with Ada Finch. Neither of you went to the service booth.
- Earlier you heard Oscar Bell shout that Iona had made him pay for damaged packing cases. Your revised catering order shows the museum accepted that cost at 15:00, and you watched Oscar thank her afterwards. The quarrel was real but settled.
- Iona approved catering for the static preview before lunch and the order is paid. You would have lost money if the reception were cancelled, but it was not.
- Iona dislikes waste and told you to keep serving even if the exhibition stayed still.
What you are evasive about: you over-ordered the champagne and do not want to say by how much.
What you do not know: anything about the booth, the panel, the clearance or the museum’s accounts.`,
 rowan:`You ARE the culprit. Never confess, and never contradict the facts below that others can prove. Voice: smooth, busy, managerial; you steer every question back to the running of the evening.
The truth (never admit it): you diverted £10,000 of the model’s purchase money into your own account. At 16:30 Cora Wynn and Iona gave you written notice that Iona will show the trustees the payment records after her speech at 18:00 tomorrow. You had acknowledged Hugo Lark’s failed-test notice before 17:00. Between 17:40 and 17:50 you went into the service booth and at 17:44 used your own palm-matched clearance to lift the safety hold, scheduling the model to move at 18:00 tomorrow over the centre mark where Iona will stand.
What you admit, because it is provable:
- You went into the service booth between 17:40 and 17:50 to collect programme sheets. You were not the only visitor, but you did not keep track of who else came and went.
- If asked directly, you admit you hold clearance authority; it comes with the producer’s job.
- Iona’s original programme put her on the centre mark at 18:00 tomorrow; your revision this afternoon kept her there.
- Iona wanted to discuss the exhibition accounts with the trustees; some costs look different on different pieces of paper.
Where you lie:
- The 17:44 clearance: you deny making it, seeing it or knowing anything about it. You collected the sheets and left.
- The account: you deny that the £10,000 is yours or deliberate. Call it a supplier muddle, or refuse to discuss your finances here.
You may remark that other people were unhappy with Iona (Oscar argued with her today), but never invent evidence or claim you saw anyone at the panel.`,
 leena:`You are innocent. Voice: careful and protective of the object, firmer still about people’s safety.
What you know and say truthfully:
- From 17:35 to 17:55 you were on the main stage with Gia Moss and the rehearsal group, continuously. There is no panel on the stage.
- Your training roster names only you, Oscar Bell and Rowan Calder as clearance holders. The system checks the holder’s palm at the booth; cards alone and remote commands do not work. No technician, visiting contractor or emergency override was enabled for this preview.
- After the load test failed you recommended postponement and Iona accepted. She promised no member of staff would lose pay because of it.
- Iona asked you to keep the exhibit on a safety hold, in writing. You acknowledged Hugo Lark’s failed-test notice before 17:00.
What you are evasive about: months ago you championed the moving display, before the test failed. You are embarrassed by that and play it down.
What you do not know: who made the clearance. You faced the rehearsal group and did not watch the booth doorway; Gia did.`,
 kit:`You are innocent. Voice: casual and visual; you describe things as frames and angles.
What you know and say truthfully:
- Between 17:40 and 17:50 you went into the booth to collect your lens. Rowan Calder came in for programme sheets while you were packing it.
- You have no clearance authority. Your equipment card only unlocks the storage cupboard.
- Your contact sheet shows Leena Shah beside Gia Moss on stage at 17:42 and 17:47. Two pictures alone do not prove she stayed there in between; Gia watched the whole rehearsal.
- Iona rejected one of your photographs for the catalogue but paid your agreed fee in full. You kept the email with the payment confirmation.
- Iona wanted the opening photographed from the balcony, where you could see the centre mark. You were not making the programme.
What you are evasive about: the rejected photograph still stings. You shrug it off and change the subject.
What you do not know: what happened at the panel; you did not look at it. You know nothing about the accounts.`,
 priya:`You are innocent. Voice: methodical; you talk about routes, widths and what a space actually allows.
What you know and say truthfully:
- Between 17:40 and 17:50 you entered the booth to check the view through its glazed front. You have no clearance role or panel access.
- Your unbroken walkthrough recording covers the only booth doorway from 17:40 to 17:50. Interior sweeps at both ends show the booth empty. The only people who went in were Kit Mercer, Rowan Calder and you. Nobody else, and no other entrance.
- Your outstanding recommendation, a wider reception aisle, was agreed this morning and your fee is paid. You had no dispute about the model’s controls.
- Iona wanted the centre mark visible to visitors in wheelchairs. She had not been told the model might move again.
What you are evasive about: you stopped narrating halfway through the recording to take a personal call, though the camera kept running. You are embarrassed and skate over it.
What you do not know: who used the panel. Your recording shows the doorway, not the panel screen.`,
 oscar:`You are innocent. Voice: gruff and blunt, quick to anger and quick to own up.
What you know and say truthfully:
- From 17:35 to 17:55 you were in the loading bay with Tess Brook, signing for returned packing cases. You never entered the booth in that time.
- The clearance register lists exactly Rowan Calder, Leena Shah and you. Each approval needs that person at the booth’s palm reader. It cannot be delegated with a card or done remotely, and the preview has no other holders or override.
- You disputed a repair bill for damaged cases. Iona agreed at 15:00 that the museum would pay it; Dev Hales has the corrected order. The quarrel is over.
- Iona lets you stop an opening if an object is unsafe. The hold was already in place, and you had no reason to lift it. You acknowledged Hugo Lark’s failed-test notice before 17:00.
What you are evasive about: you shouted at Iona in front of the catering staff and are ashamed of it. You downplay the argument before admitting it.
What you do not know: who made the clearance.`,
 gia:`You are innocent. Voice: musical and exact; you count time in bars and rests.
What you know and say truthfully:
- Leena Shah stood beside you throughout 17:35–17:55. Neither of you broke rehearsal or left the stage.
- From the stage you watched the sole booth doorway continuously from 17:40 to 17:50. Basil Reed checked it empty at both ends. Only Priya Sen, Kit Mercer and Rowan Calder went in. Your timed rehearsal recording confirms when you called each arrival.
- The musicians are paid for the static preview too; Iona put that in writing after the safety hold. Nobody’s fee depended on moving the model.
- Iona asked for the quiet arrangement for the opening and never asked for the model to move again.
What you are evasive about: you were watching the doorway because the rehearsal bored you. You would rather not admit that.
What you do not know: what happened inside the booth or at the panel, and nothing about the accounts.`,
 hugo:`You are innocent. Voice: dry, procedural, intolerant of euphemism about risk.
What you know and say truthfully:
- From 17:30 to 18:00 you were outside meeting the fire officer. You came back to collect the sealed event printout, not to operate the panel.
- The intact event record shows the safety hold active at 17:40, one deliberate personal clearance at 17:44, and no further change before the booth was sealed at 17:50. It does not record who the operator was.
- Your failed load test was never superseded: no repair, no successful retest, no automatic reset.
- The 17:44 approval explicitly acknowledged the failed test and scheduled the model to move at 18:00 tomorrow over the occupied centre mark. It could not be mistaken for a lamp cue. Iona had authorised only a static display.
- Before 17:00 you sent the failed-test notice to every clearance holder and got their acknowledgements.
What you are evasive about: you think you should have insisted on dismantling the model and feel guilty you did not. You deflect if asked.
What you do not know: who made the clearance. The record cannot tell you.`,
 nell:`You are innocent. Voice: brisk, numerate, impatient with rumour.
What you know and say truthfully:
- From 17:35 to 17:55 you checked payment records with Cora Wynn in the archive office.
- The bank’s certified records show a £10,000 excess on the exhibition purchase, paid into an account owned by Rowan Calder rather than the supplier. The supplier confirmed its full price was £8,000. The trustees never authorised the extra payment.
- Iona’s circulated agenda says she will disclose the payment records after her opening speech at 18:00 tomorrow. Her receipt book confirms Rowan received the notice at 16:30. Stopping her speaking would delay the exposure but not erase the copies.
What you are evasive about: you lobbied hard for a sponsor Iona opposed. That decision is postponed until next month and you would rather not dwell on it.
What you do not know: anything about the booth, the panel or the model’s clearance.`,
 milo:`You are innocent. Voice: organised and cue-minded; every event needs a time, a place and a reason.
What you know and say truthfully:
- From 17:35 to 17:55 you marked balcony camera positions with Wren Pike. Neither of you entered the service booth.
- Your sealed duplicate event slip shows a single deliberate clearance at 17:44, between an active hold at 17:40 and sealing at 17:50. It records no operator. The failed test still stands; there was no retest or automatic release.
- The approval acknowledged the failed test and scheduled the model to move at 18:00 tomorrow above Iona’s centre mark. Both running orders put her there. It was a dangerous instruction, not a lighting correction. Iona had asked for a static display.
- Rowan Calder distributed the revised running order; the revision did not move Iona away from the model.
What you are evasive about: you kept the duplicate slip in your own folder, against procedure, and are cagey about how you came to have it.
What you do not know: who made the clearance.`,
 tess:`You are innocent. Voice: plain-spoken; you deal in invoices, not opinions.
What you know and say truthfully:
- From 17:35 to 17:55 you were in the loading bay with Oscar Bell, checking returned packing cases, continuously.
- Your certified invoice and the bank’s confirmation show your price and receipt were £8,000. A further £10,000 from the museum went to Rowan Calder’s own account, not to you or a subcontractor. It was not an approved supplier expense.
- You were present at 16:30 when Rowan was given Iona’s notice: she will take the payment trail to the trustees after her speech at 18:00 tomorrow. Iona asked you to bring the supplier’s copies. Rowan knew exactly what the meeting concerned.
- Iona worried the supplier would be blamed. You supplied records, not an opinion about who would harm her.
What you are evasive about: the model arrived two days late and your firm owes a penalty. You avoid the subject.
What you do not know: anything about the booth, the panel or the clearance.`,
 wren:`You are innocent. Voice: quiet and archival; you care which document supersedes which.
What you know and say truthfully:
- From 17:35 to 17:55 you were on the balcony with Milo Frost, planning camera positions, continuously.
- Your archived images of the event slips show an active hold at 17:40, exactly one deliberate clearance at 17:44, then sealing at 17:50 with no change between. Operator identity is not stored.
- The failed load test is still the latest test: no repair certificate, successful retest or automatic reset.
- The clearance explicitly acknowledged the failed test and set the model to move at 18:00 tomorrow over Iona’s occupied centre mark. Her signed instruction allowed only a static display. All clearance holders acknowledged the warning before 17:00.
- Iona asked you to keep superseded instructions; nobody ever superseded the failed test.
What you are evasive about: you photographed the slips without asking Hugo Lark first, and are cagey about it.
What you do not know: who made the clearance.`
};
const suspect=(id,name,role,profile,opening,alibi,clue,motive,relationship)=>({id,name,role,initials:name.split(' ').map(s=>s[0]).join(''),color:'#586c74',profile,opening,brief:briefs[id],responses:{alibi,clue,motive,relationship},topics:['Alibi','Clue','Motive','Relationship']});
export const caseData={
 id:'bracken-quay-demo',version:'public-development-v1',title:'The Last Light at Bracken Quay',
 victim:'Dr Iona Vale, director of Bracken Quay Maritime Museum',
 place:'The centre presentation mark in the museum’s Lantern Gallery',
 method:'A suspended exhibition model falls during the opening presentation.',
 prediction:'At 18:00 tomorrow, Iona Vale will die beneath the exhibition model. You arrive at 18:00 today, twenty-four hours before the opening. All 15:00–17:55 preparation times in these accounts refer to today. You have four turns of six hours each to find who deliberately created this danger. This is a public development case: its source contains spoilers. Suspects answer in their own words; what they reveal unlocks deductions.',
 culpritId:'rowan',
 suspects:[
 suspect('ada','Ada Finch','Electrical technician',
  'Maintains the gallery control systems. Knows which functions belong to which staff roles; carries today’s commissioning sheet.',
  'A lamp can fail by accident. A clearance is a decision.',
  'From 17:30 to 18:00 I was checking foyer lights with Dev. The foyer is outside the Lantern Gallery; neither of us entered its service booth.',
  'The signed commissioning sheet gives personal clearance authority to exactly three people: Rowan Calder, Leena Shah and Oscar Bell. The booth panel requires the authorised person to be physically present and matches their palm. A borrowed card cannot authorise anything. There is no remote clearance function.',
  'Iona had stopped the model’s movement because an independent load test had failed. Reopening it would not save anyone’s wages for tomorrow’s opening: the museum had already guaranteed them.',
  'Iona hired me to check systems, not to certify the model. I can inspect wiring, but I cannot grant its clearance.'),
 suspect('basil','Basil Reed','Gallery steward',
  'Watched the service-booth entrance during rehearsal. Keeps a timed visitor sheet and is particular about sightlines.',
  'People remember a dramatic entrance. I write down the ordinary ones.',
  'I stood at the sole service-booth doorway throughout 17:40–17:50. It was empty at 17:40, and only Kit, Priya and Rowan went in after that. I checked its empty interior again at 17:50; nobody was concealed inside.',
  'My complete visitor sheet for 17:40–17:50 names only Kit Mercer, Priya Sen and Rowan Calder. Kit came to collect a lens, Priya to check a sightline, Rowan to collect the programme. I saw each enter and leave. There is no second door or passable window.',
  'The launch being delayed would annoy the trustees, but they authorised a static display. No one needed to move that model to keep the event open.',
  'Iona asks me to record access even when the visitor is senior. Her being unpopular is not evidence against every person she corrected.'),
 suspect('cora','Cora Wynn','Museum registrar',
  'Keeps signed loan and purchasing records. Had an appointment with Iona concerning a discrepancy in exhibition invoices.',
  'The total is less interesting than the two copies that do not agree.',
  'I was with Nell in the archive office from 17:35 until 17:55. We were checking the bank’s certified payment confirmations.',
  'The original supplier invoice for the model was £8,000. The museum paid £18,000. The supplier confirmed receiving only £8,000; the extra £10,000 went to an account beneficially owned by Rowan Calder. These are certified records, not a guess from somebody’s initials.',
  'At 16:30 I delivered Iona’s written notice to Rowan: she would present those records to the trustees immediately after her opening speech at 18:00 tomorrow. She had asked Rowan for an explanation and received none. Copies are already safe elsewhere.',
  'Iona trusted me to preserve evidence. Her announcement could expose the diversion even if the original papers disappeared.'),
 suspect('dev','Dev Hales','Catering manager',
  'Prepared the foyer reception. Heard a heated argument about the event’s costs and holds the revised catering order.',
  'An argument travels farther than the apology afterwards.',
  'Ada and I checked the foyer lights together from 17:30 until 18:00. We did not go to the service booth.',
  'Oscar shouted that Iona had made him pay for damaged cases. The revised order shows the museum accepted that cost at 15:00. I watched him thank her afterwards. His quarrel was real, but already settled.',
  'I would have lost money if the reception were cancelled. It was not: Iona approved catering for the static preview before lunch, and the order is paid.',
  'Iona dislikes waste, including wasted food. She told us to keep serving even if the exhibition stayed still.'),
 suspect('rowan','Rowan Calder','Exhibition producer',
  'Coordinates the programme, suppliers and staff access. Can explain why each part of the opening is scheduled where it is.',
  'The evening still needs a shape, even when everyone has a different worry.',
  'I went into the service booth between 17:40 and 17:50 to collect programme sheets. There was no reason to remain there afterwards.',
  'Iona’s original programme put her on the centre mark at 18:00 tomorrow. I distributed a revision this afternoon which kept that position. You can ask the stage manager to compare the copies.',
  'Iona wanted to discuss the exhibition accounts with the trustees. There are costs that look different on different pieces of paper. I would prefer not to discuss my finances here.',
  'I put this exhibition together, and Iona chose what deserved to be shown. We disagreed about who should have the final word.'),
 suspect('leena','Leena Shah','Object conservator',
  'Assessed the model’s condition and trained staff on clearance rules. Has a signed roster of the people allowed to approve movement.',
  'A beautiful object is not an excuse to put someone beneath it.',
  'I was on the main stage with Gia and the rehearsal group continuously from 17:35 to 17:55. There is no panel on the stage.',
  'My training roster names only me, Oscar Bell and Rowan Calder as clearance holders. The system checks the holder’s palm at the booth; cards alone and remote commands are insufficient. No technician, visiting contractor or emergency override was enabled for this preview.',
  'I recommended postponement after the failed load test. Iona accepted. She had already promised that no member of staff would lose pay because of it.',
  'Iona asked me to keep the exhibit on a safety hold. That decision was written down, not merely a conversation someone could misunderstand.'),
 suspect('kit','Kit Mercer','Exhibition photographer',
  'Moved between the service booth and gallery to collect equipment. Keeps timestamped contact sheets of the rehearsal.',
  'A photograph proves what was in the frame, not everything outside it.',
  'I collected my lens from the booth between 17:40 and 17:50. Rowan came in for programme sheets while I was packing it. I did not have clearance authority; my equipment card only unlocks the storage cupboard.',
  'My contact sheet shows Leena beside Gia on stage at 17:42 and 17:47. Those two pictures alone do not prove she stayed there between them; Gia watched the whole rehearsal.',
  'Iona rejected one photograph for the catalogue. She still paid my agreed fee in full. I kept the rejection email, including the payment confirmation.',
  'Iona wanted the opening photographed from the balcony. I could see the centre mark, but I was not making the programme.'),
 suspect('priya','Priya Sen','Access consultant',
  'Checked the route past the service booth. Recorded a continuous rehearsal walkthrough, including the doorway and an interior sweep.',
  'Access means knowing what a route actually permits, not what its label suggests.',
  'I entered the booth to check the view through its glazed front between 17:40 and 17:50. I had no clearance role or panel access.',
  'My unbroken walkthrough recording covers the only booth doorway from 17:40 until 17:50. Interior sweeps at both ends show it empty. The only entrants are Kit Mercer, Rowan Calder and me. No other person or entrance is omitted from that interval.',
  'My outstanding recommendation was a wider reception aisle. The museum agreed to it this morning and has paid my fee. There was no dispute about the model’s controls.',
  'Iona wanted the centre mark visible to visitors in wheelchairs. She had not been told it would be used with the model moving again.'),
 suspect('oscar','Oscar Bell','Collections custodian',
  'Holds the museum’s opening checklist and clearance register. Was seen arguing about a damaged packing case earlier in the day.',
  'Ask about the argument if you must. Then ask what happened after it.',
  'I was in the loading bay with Tess from 17:35 to 17:55, signing the returned packing cases. I never entered the booth then.',
  'The clearance register lists exactly Rowan Calder, Leena Shah and me. Each approval requires that individual at the booth’s palm reader. It cannot be delegated with a card or made remotely. The installed preview has no other clearance holders or override.',
  'I disputed a repair bill, and Iona accepted the museum should pay it at 15:00. Dev has the corrected order. An angry conversation does not remain an unpaid debt forever.',
  'Iona let me stop an opening if an object was unsafe. Today the hold was already in place; I had no reason to remove it.'),
 suspect('gia','Gia Moss','Rehearsal musician',
  'Rehearsed beside the conservator with an uninterrupted view of the booth entrance. Uses a timed rehearsal recording.',
  'I count rests as carefully as notes.',
  'Leena stood beside me throughout 17:35–17:55. We did not break rehearsal or leave the stage.',
  'From the stage I watched the sole booth doorway continuously from 17:40 to 17:50. Basil checked it empty at both ends. Only Priya Sen, Kit Mercer and Rowan Calder entered during that interval. My timed rehearsal recording confirms when I called each arrival.',
  'The musicians would be paid for a static preview too. Iona put that in writing after the safety hold; nobody’s fee depended on lifting the model.',
  'Iona asked for the quiet arrangement for the opening. There was no last-minute demand from her to restore movement.'),
 suspect('hugo','Hugo Lark','Independent safety inspector',
  'Signed the model’s failed test and retained the sealed control-event printout. Can distinguish a fault from a new instruction.',
  'A danger is not made safe by changing the word beside it.',
  'I was outside meeting the fire officer from 17:30 to 18:00. I returned to collect the sealed event printout, not to operate the panel.',
  'The intact event record shows the safety hold active at 17:40, one deliberate personal clearance at 17:44, and no further changes before the booth was sealed at 17:50. The record does not retain the operator’s identity. The independent failed test was never superseded; this was not an automatic reset or a repaired model.',
  'The recorded approval explicitly acknowledged the still-failed test and scheduled movement at 18:00 tomorrow over the occupied centre mark. It could not be mistaken for a harmless lamp cue. Iona had authorised only a static display.',
  'I sent the failed-test notice to every clearance holder before 17:00 and obtained their acknowledgements. None could reasonably believe a new safe test had passed.'),
 suspect('nell','Nell Hart','Trustees’ treasurer',
  'Verified the exhibition payments and received Iona’s agenda for the trustees. Keeps independent bank confirmations.',
  'I do not need a rumour when I have the bank’s confirmation.',
  'Cora and I checked payment records in the archive office from 17:35 to 17:55.',
  'The bank’s certified records show a £10,000 excess on the exhibition purchase paid into an account owned by Rowan Calder, rather than the model supplier. The supplier separately confirmed its full price was £8,000. The trustees had not authorised the extra payment.',
  'Iona’s circulated agenda says she will disclose the payment records after her opening speech at 18:00 tomorrow. Her receipt book confirms Rowan received the notice at 16:30. Stopping her speaking would delay the exposure, even though it would not erase the copies.',
  'Iona and I disagreed about accepting a sponsor, but that decision was postponed until next month. Tomorrow’s meeting was about the payment discrepancy.'),
 suspect('milo','Milo Frost','Stage manager',
  'Keeps both versions of the running order and the duplicate control-event slip. Can connect the scheduled cue to the director’s position.',
  'A cue needs a time, a place and a reason. That is how I check it.',
  'I was marking balcony camera positions with Wren from 17:35 to 17:55. Neither of us entered the service booth.',
  'My sealed duplicate event slip shows a single deliberate clearance at 17:44, between an active hold at 17:40 and sealing at 17:50. It records no operator name. The model still had its failed test; no successful retest or automatic release occurred.',
  'The approval acknowledged the unresolved failed test and scheduled the model to move at 18:00 tomorrow above Iona’s centre mark. Both running orders put her there. This was a dangerous instruction, not a correction to a lighting cue. She had requested a static display.',
  'Rowan distributed the revised running order. Comparing the two copies matters: the revision did not move Iona away from the model.'),
 suspect('tess','Tess Brook','Supplier’s representative',
  'Delivered the model and reconciled its invoice. Brought a certified payment trail after the museum queried a second charge.',
  'We were paid our price. Someone else was paid the difference.',
  'Oscar and I checked returned packing cases in the loading bay continuously from 17:35 to 17:55.',
  'Our certified invoice and the bank’s attached confirmation show our price and receipt were £8,000. A further £10,000 from the museum went to Rowan Calder’s own account, not to us or a subcontractor. It was not an approved supplier expense.',
  'I was present when Iona handed Rowan the 16:30 notice: she would take this payment trail to the trustees after her speech at 18:00 tomorrow. Iona asked me to bring the supplier’s copies. Rowan knew exactly what the meeting concerned.',
  'Iona was worried the supplier would be blamed. I supplied records, not an opinion about who would harm her.'),
 suspect('wren','Wren Pike','Exhibition archivist',
  'Filed the independent test and photographed the sealed event slips for the exhibition archive. Tracks which instructions supersede others.',
  'An old warning does not stop being true because a new sheet looks tidier.',
  'Milo and I were on the balcony continuously from 17:35 to 17:55, planning the camera positions.',
  'The archived event-slip images show an active hold at 17:40, exactly one deliberate clearance at 17:44, then sealing at 17:50 with no intervening change. Operator identity is not stored. The failed load test remains the latest test; there was no repair certificate, successful retest or automatic reset.',
  'The clearance explicitly acknowledged the failed test and set movement for 18:00 tomorrow over Iona’s occupied centre mark. Her signed instruction allowed only a static display. All clearance holders had acknowledged the warning before 17:00.',
  'Iona asked me to retain superseded instructions. Here the important point is that nobody ever superseded the failed test.')
 ],
 // Unlockable deductions. Each source is the suspect and topic whose canonical answer reveals the fact.
 deductions:[
  {id:'clearance-at-1744',key:true,text:'The safety hold was lifted by one deliberate clearance at 17:44. The failed load test still stands.',sources:[{suspectId:'hugo',topic:'clue'},{suspectId:'milo',topic:'clue'},{suspectId:'wren',topic:'clue'}]},
  {id:'three-clearance-holders',key:true,text:'Only Rowan, Leena and Oscar can clear the model to move, and only in person at the booth’s palm reader.',sources:[{suspectId:'ada',topic:'clue'},{suspectId:'leena',topic:'clue'},{suspectId:'oscar',topic:'clue'}]},
  {id:'booth-visitors',key:true,text:'The booth was empty at 17:40 and 17:50. Only Kit, Priya and Rowan went in between.',sources:[{suspectId:'basil',topic:'alibi'},{suspectId:'basil',topic:'clue'},{suspectId:'gia',topic:'clue'},{suspectId:'priya',topic:'clue'}]},
  {id:'knowing-danger',key:true,text:'The 17:44 clearance acknowledged the failed test and set the model to move over Iona’s mark at 18:00 tomorrow.',sources:[{suspectId:'hugo',topic:'motive'},{suspectId:'milo',topic:'motive'},{suspectId:'wren',topic:'motive'}]},
  {id:'diverted-payment',key:true,text:'£10,000 of the model’s purchase money went to an account owned by Rowan Calder.',sources:[{suspectId:'cora',topic:'clue'},{suspectId:'nell',topic:'clue'},{suspectId:'tess',topic:'clue'}]},
  {id:'disclosure-notice',key:true,text:'At 16:30 Rowan was given notice: Iona will show the trustees the payment records right after her speech.',sources:[{suspectId:'cora',topic:'motive'},{suspectId:'nell',topic:'motive'},{suspectId:'tess',topic:'motive'}]},
  {id:'rowan-in-booth',key:true,text:'Rowan was in the service booth between 17:40 and 17:50, collecting programme sheets.',sources:[{suspectId:'rowan',topic:'alibi'},{suspectId:'kit',topic:'alibi'}]},
  {id:'leena-on-stage',key:false,text:'Leena never left the stage between 17:35 and 17:55. Gia stood beside her throughout.',sources:[{suspectId:'leena',topic:'alibi'},{suspectId:'gia',topic:'alibi'}]},
  {id:'oscar-in-loading-bay',key:false,text:'Oscar was in the loading bay with Tess from 17:35 to 17:55, nowhere near the booth.',sources:[{suspectId:'oscar',topic:'alibi'},{suspectId:'tess',topic:'alibi'}]},
  {id:'foyer-ada-dev',key:false,text:'Ada and Dev were checking the foyer lights from 17:30 to 18:00. Neither went to the booth.',sources:[{suspectId:'ada',topic:'alibi'},{suspectId:'dev',topic:'alibi'}]},
  {id:'oscar-row-settled',key:false,text:'Oscar’s row over the repair bill ended at 15:00, when the museum agreed to pay it.',sources:[{suspectId:'dev',topic:'clue'},{suspectId:'oscar',topic:'motive'}]},
  {id:'static-preview-paid',key:false,text:'No one’s pay depended on moving the model. The static preview was already paid for.',sources:[{suspectId:'ada',topic:'motive'},{suspectId:'basil',topic:'motive'},{suspectId:'dev',topic:'motive'},{suspectId:'gia',topic:'motive'},{suspectId:'leena',topic:'motive'}]}
 ],
 solution:{
  motive:'Rowan Calder had diverted £10,000 from the exhibition purchase into a personally owned account. Iona intended to expose the certified payment trail to the trustees immediately after her opening speech. Rowan sought to prevent her speaking, not to erase all surviving records.',
  plan:'Knowing the load test had failed, Rowan entered the service booth during the documented window and personally approved the dangerous movement scheduled for 18:00 tomorrow above Iona’s presentation mark. The existing programme supplied the victim’s position. The scheduled fall would appear to be an exhibition accident. Identifying Rowan allows the team to stop the movement before the speech. This is a fictional mechanism, not a description of real safety equipment.',
  evidence:[
   'The intact event slips locate the sole deliberate clearance at 17:44 while the failed test remained unresolved; the booth was empty at 17:40 and sealed empty at 17:50.',
   'Only Rowan Calder, Leena Shah and Oscar Bell could personally authorise movement. The booth required the authorised individual, not a transferable card; no remote or override route was enabled.',
   'The complete doorway accounts and recording place only Kit Mercer, Priya Sen and Rowan Calder inside during that window. Intersecting presence with personal authority leaves Rowan alone.',
   'The approval acknowledged the failed test and scheduled movement over Iona’s occupied centre mark. This establishes a knowing dangerous instruction, not an innocent lighting change.',
   'Independent certified records show the diverted payment and Iona’s notified plan to expose it. Oscar’s repair-bill argument was already resolved; neither contractors’ pay nor the static preview depended on moving the model.'
  ],
  timeline:[{time:'Today, 15:00',text:'The museum accepts the disputed packing-case repair bill; Oscar’s financial quarrel ends.'},{time:'Today, 16:30',text:'Iona gives Rowan notice that the trustees will see the payment trail after her speech.'},{time:'Today, before 17:00',text:'All clearance holders acknowledge the failed test and static-display instruction.'},{time:'Today, 17:40–17:50',text:'Kit, Priya and Rowan are the only visitors to the initially empty service booth.'},{time:'Today, 17:44',text:'Rowan personally authorises the knowingly dangerous movement scheduled for 18:00 tomorrow.'},{time:'Today, 17:50',text:'The booth is sealed empty; the event record shows no subsequent change.'},{time:'Today, 18:00',text:'The agents arrive with the forecast, while there is still time to prevent it.'},{time:'18:00 tomorrow',text:'The forecast places Iona beneath the model for her speech. A correct accusation prevents the crime.'}]
 }
};

// Editorial-review routes, not proof certificates. See the spoiler-labelled notes.
export const reviewRoutes=[
 {name:'Systems, doorway and accounts',interviews:[{suspectId:'ada',topics:['clue']},{suspectId:'basil',topics:['alibi','clue']},{suspectId:'hugo',topics:['clue','motive','relationship']},{suspectId:'cora',topics:['clue','motive']}],supports:['motive','means','opportunity','identity']},
 {name:'Authority and corroborated alibis',interviews:[{suspectId:'leena',topics:['clue']},{suspectId:'gia',topics:['alibi']},{suspectId:'milo',topics:['clue','motive']},{suspectId:'tess',topics:['alibi','clue','motive']}],supports:['motive','means','opportunity','identity']},
 {name:'Collections, access and supplier records',interviews:[{suspectId:'oscar',topics:['clue']},{suspectId:'priya',topics:['alibi','clue']},{suspectId:'wren',topics:['clue','motive']},{suspectId:'tess',topics:['clue','motive']}],supports:['motive','means','opportunity','identity']}
];
