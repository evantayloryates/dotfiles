## October 17 automatic cold/rebind composition candidate

Previous batch published40286b8. Automatic enrolled control recovery now composes
ONE original durable cold child followed by a deterministic durable native rebind
context before renewed control admission. Original recovery ledger remains phase
verified for receipt proof; separate rebindPhase/context/result and before/after
steps retained. Rebind reads original verified cold/native receipts, turns over
same standby process and refreshes exact binding/family proof. Result only clears
standbyRebindRequired after exact primary/service, verified new digest, preserved
automatic opt-in and valid context ID match. Unknown recovery/rebind/checkpoints
stop original control without replay. Error detail retains rebind context ID.

Internal call explicitly retains already-held primary independent-route lock,
while taking existing standby generation lock; standalone public rebind still
takes primary route lock. No public bypass-lock argument added. Virtual rebind
context is NOT a separately scheduled driver job; inspect original ledger and
standby-rebinds/<context>.json. Manual recover_enrolled remains cold-only and
requires separate explicit rebind. Healthy routes still avoid recovery work.
Send/stop/metadata/steer results propagate actual rebind state/context.

Focused14tests PASS including combined cold/rebind result gates and each unknown/
checkpoint failure, plus isolated actual lock-held preflight test: no recursive
primary lock acquisition and no effects. Full isolated
v2-2026-10-17T22-57-36-088Z.json1/1PASS/sourceunchanged; both filtered
harness-v2-{claude,codex}-2026-10-17T22-57-10-303Z.json10checks each PASS.
FINALHOSTb4fc1ec3b7b4000f7acd310d6a262b462af751ddd878fcf48db6d6f9cd408093.

Actual standby status remains waitprimary-live/effectsfalse/recoveryAttemptedfalse,
primarycb68/standby3e8045 and exact binding905865a4622eef6f6f5a9dd59db218be64ce471f3754d8bc80349217b9a02869
unchanged; automaticRecoveryEnabled:false. No new native send/stop/model turn,
wake, process retirement, archivecycle, app restart or new chat. Qualification doc
now explicitly points to current resume frontier; dated historical NEXT text is
not fresh authority. No successful native cold/rebind claim.

NEXT: successful actual absent-primary native recovery + rebound standby and
subsequent ordinary control must be qualified before enabling current enrollment.
Avoid manufacturing current-primary failure solely for green. Both-gone/appquit,
naturalpressure and broader creation/fork/archive/window/person gates remain.
Goal active; legacy observer owns legacy recovery; inbox watcher paused. Keep
Codex-driver and 1Password parked.

## October 17 proof-bound standby reseal/rebind candidate

Previous batch published6ca1a9f. Implemented broker_service_rebind_standby using
original enrolled recovery parent + its original completed native recovery child.
Proof must match exact old binding digest, actor/primary IDs, old service IDs and
old PID/start; child verifies preserved role/settings/anchor/no unknowns and parent
verifies same new primary epoch. Failed/uncertain/cycle/changed/mismatched proof
cannot authorize epoch change. Normal standby CAS still refuses epoch retargets.

New rebind composes EXISTING runIndependentRenewal phases and native primitives:
prepare same standby with archiveTarget recovered primary; quiesce/retire old role;
stable-hook activate/readiness/policy/verify new role preserving settings+anchor.
Both exact owned bypass idle epochs and selectors checked at every phase. Recovered
primary needs initial180s margin, family+later-operation capacity, no unknowns and
current readiness/policy. After turnover, one deterministic native family context
on recovered primary precedes proof-bound CAS enrollment; old canonical bytes are
retained, v2 automatic choice preserved. No process wake/restart/kill/new chat or
permission/input change. New operation remains explicit and not automatically
invoked from cold routing yet. Recovered control continues to expose
standbyRebindRequired:true until the separate verified rebind finishes.

Five rebind tests PASS: exact transition,16 corrupt/uncertain proof refusals,
phase order, each failed/changed phase stops, retained-proof filesystem epoch CAS
with old-byte retention/opt-in preservation/stale CAS rejection. Full isolated
v2-2026-10-17T22-55-42-839Z.json1/1PASS/sourceunchanged. Both filtered
harness-v2-{claude,codex}-2026-10-17T22-55-16-403Z.json10checks each PASS.
FINALHOSTe675ca1b5e4694df83cb83354d0c934daddcb61c7ef2f6159ef7284b8a8e86ee.

Native negative standbyRebindMissingProof j5a84427c1eb94ad990a43caba05f6526
references failed cold parent jea3...; correctly refuses standby_rebind_unqualified,
dispatched:false before rebind ledger/effects. Do not replay either negative.
Binding unchanged905865a4622eef6f6f5a9dd59db218be64ce471f3754d8bc80349217b9a02869;
primarycb68...live/standby3e8045...; actual standby status waitprimary-live,
recoveryAttempted:false and automaticRecoveryEnabled:false. Prior native healthy
send18checks evidence remains on preceding0fa6 source, not newnativecoldproof.

NEXT: successful actual absent-primary recovery + this rebind native qualification
and eventual composition without recursive primary-route locking. No deliberate
current-primary termination/archive cycle solely for green. Do not enable auto
recovery before native qualification; rebind/full appquit/bothcontrollerslost,
naturalpressure and broader creation/fork/archive/window gates remain incomplete.
Existing checkpoint metadataControlTrial.standbyRebindCandidate retains exact
source/tests/negative job. Goal active, watcher paused, legacyobserver owns legacy
broker recovery. Codex-driver and 1Password remain parked.

## October 17 trust confirmation and enrolled recovery routing candidate

Taylor supplied /Users/taylor/Desktop/check-1.png and confirmed accepting its
native workspace trust prompt. Screenshot names the exact interrupt scratch cwd
and shows bypass permissions; it depicts the prompt before acceptance. Current
CLI independently verifies interrupt PID90418/start21:37:26 UTC idle, readiness
and native policy observed, zero unresolved requests, unchanged standby3e8045.
No additional human trust step is required by this observation.

Candidate adds explicit schema-v2 automaticRecovery boolean to exact standby
bindings. V1 remains disabled; enabling/disabling requires existing digest CAS;
ordinary same-epoch renewal preserves explicit v2 choice. Added enrolled cold
recovery composition: independent absence/retained family/exact standby and target
scope checked before ledger and again before one stable durable recovery child.
Unknown child, changed admission, missing restored role or new-epoch verification
halts without replay. Original parent ledger retains submission, child and outcome.
Recovered epochs explicitly require standby rebind; current epoch CAS still refuses
retargeting. Ordinary controller maintenance consults this only after status failure
and only for explicitly enabled enrollment. No global restart or background wake.

LIVE negative enrolledRecoveryLiveRefusal jea3e3e17209a439fb5527540ae81b6fa
refused before ledger/child: primary remains live, no effects. Binding unchanged,
digest905865a4622eef6f6f5a9dd59db218be64ce471f3754d8bc80349217b9a02869,
automaticRecoveryEnabled:false. Do not replay negative parent. No native cold
recovery has been qualified or enabled; do not infer always-on behavior.

Focused19 tests pass. Full isolated v2-2026-10-17T22-51-29-004Z.json passes1/1;
both filtered harness-v2-{claude,codex}-2026-10-17T22-51-{16-390,17-547}Z.json
pass10 checks each. Source0fa6c2cb5591600d023820051da594d5bc509fdabe8228911c1516d64f872339.
Healthy native Codex send coexistence passed all18 checks in
harness-native-native-send-codex-2026-10-17T22-51-56-916Z.json: exact recipient
receipt/causal reply, same durable job and no maintenance/recovery children. Initial
invocation used nonexistent harness-native.mjs and failed before any native effect;
correct existing entrypoint harness-native-service.mjs supplied this evidence.
Final delta preserves post-recovery error effects/retrySafe:false in send/stop.
FINALHOST38891079243d43296f5f8a8b8ee38ee46c85aa8974838892295e0dbcf3c6e4b3.
Full isolated v2-2026-10-17T22-52-53-822Z.json passes1/1, both filtered harnesses
harness-v2-{claude,codex}-2026-10-17T22-52-32-{346,345}Z.json pass10each on final
source. Native coexistence predates only final error bookkeeping; no claim of
native cold qualification. Existing sealed services remain unchanged.
NEXT: actual absent-primary cold qualification,
controlled standby rebind/reseal and appquit/bothgone cases remain incomplete.
Goal active. Legacy observer retains recovery ownership; watcher paused. No CUA,
keyboard, quarantine/auth changes, new chats or process termination.

## October 17 durable standby enrollment refreshes across primary renewal

Previousbatch published80602ef. Addedstandby-enrollment.mjs andpublic
broker_service_enroll_standby/broker_service_standby_status. ExactverifiedLIVE
primary+standby andterminalemptyfamily required atregistration. Rootprivate
standby-enrollments/<primary>.json binds BOTHsession/cwd/PID/procStart/serviceIDs,
familyrequest andtimestamp; no tokens. Immutabledefault/reusedexactbinding; same-
epochgeneration/familyrefresh requirespriorSHA256CAS. Oldcanonicalbytesretained
instandby-enrollment-history/<primary>/<sha>.json beforeatomicreplacement. Changed
session/cwd/PID/procStart refused, notsilentlyretargeted. Readstatus resolvesonly
retainedexactgenerations; changedgeneration/recordsreportinspect, noautowake.
TestscoverCASstaleness, epochretarget, duplicates, exacthistoricalretention.

Integratedfreshfamilycapture inEXISTINGprimaryrenewal WHENabindingexists. Policy
qualifiedsuccessor getsONEdurablederivedfamilyrequestcontext, notanotherscheduled
job. Before-family context/after-settlement/enrollmentoutcome savedinrenewalledger.
Successfulqualifiedsame-epochCAS refreshesbinding; unqualifiedstandby/CASfailure
leavesoldbindingstale andreturnsstandbyRefreshQualified:false, nevercarryoldreceipt
asnewauthority. Unknown/failedfamily publicationstopsrenewalparent. Require3slots
beforeeffectswhenstandbybound (policy+family+lateroperation); no silentbudgetbump.
Withoutbinding, originalrenewalbehaviorunchanged. Thiskeepsordinarylivecontrols
possiblewithexplicitbackupdegradation, whilecoldroutingstaysfailclosed.

LIVEenrolljb59a57d9ed0e4b20b4dc206010ac2023 capturedprimary096.../standby3e8045...
familyrpeer35a620b5a70c440bbbb6126c5075abdf. Initialbindingdigest
ccc058bad0c81e9d528e330912fac2ddf263a47c86d23d8ded033da9a87dbc8c.
Necessarynewfeaturetest: boundprimaryrenew jcb68b77b5365435499f1655d77b77036
succeededwithstandbyRefreshQualified:true. NEWCURRENTprimarycb68b77b5365435499f1655d77b77036,
freshfamilyrpeere51b8082758855b63da28067cb38146d. SameprimaryPID31678/start20:14:51UTC,
samestandby90418/start21:37:26UTC; no nativeprocesskill/restart/newchat. Bindingnow
primarycb68.../standby3e8045... withdigest
905865a4622eef6f6f5a9dd59db218be64ce471f3754d8bc80349217b9a02869.
Originalbinding retainedbyoldsha; nofamilycarryfromretired096. Freshfamilycontext
je51... isNOTdriverjob; inspectrequest/renewalledger, notdriver_wait(context).
Sameparentrenewalsubmissionreusedtrue/samejob, renewalbytesunchanged.
Actualbroker_service_standby_statusafterrefresh resolvescurrentcb68 andreturns
waitprimary-live/coldRecoveryEligiblefalse/effectsPerformedfalse/recoveryAttemptedfalse.
Privateplan.metadataControlTrial.standbyEnrollmentReview retainssnapshot/digests.

FINALHOSTANDNEWPRIMARYSEALED
e90154fabdae220bd246b0bf2b175867fdd1118e980768debffada8af80309b4.
Focused8renewal/enrollmenttestsPASS. Fullpressure
v2-2026-10-17T22-45-20-274Z.json1/1/sourceunchanged; bothsynthetic10checks
harness-v2-{claude,codex}-2026-10-17T22-46-16-491Z.jsonPASS. No newnativecoldrecovery
orordinarymodel-message loopneededforfilesystembindingtest. Standbyrole3e8045...
stillsealed354f32ad, exactarchiveTargetprimaryPID31678. Primaryrolepreservedall
metadata/model/send/stopgrants andrecipientepoch. Old096...terminal/retiredhistory
preserved, no outstandingeffects. Bothbaselinechatsettingsunchanged.

NEXT: gateon-demandcoldrequest routingthroughthisEXPLICITbinding ONLYafteractual
OSabsence/nopeer/0unknown/qualifiedstandby andretainedfamily. Needstablechildidentity
andbefore/afterledger; neverreplayoriginalnegativecoldparent. Enrollmentcurrently
recordsreadiness ONLY anddoesNOTenableautomaticcoldrecovery. Coldrecoverychanges
primaryepoch, so requirescontrolledprovenrebind/resealofstandby afterward; current
CASintentionallyrefusesepochchanges. Appquit/bothcontrollerslost, naturalpressure,
creation/fork/fullarchive/window/personpermissiongatesstillincomplete. Goalactive,
legacyobserverownslegacy35b...broker; watcherpaused; noCUA/input/auth/restart/newchats/
manualkills. Codex-driver/1Passwordparked.

## October 17 independent standby staged without primary interruption

Previousbatch published6d36c73. Bothexistingowned scratcheslive/idle/0unknown.
RetainedfreshPRIMARYnativeemptyfamilyviaj35a620b5a70c440bbbb6126c5075abdf,
rpeer35a620b5a70c440bbbb6126c5075abdf onprimaryservice0968475bc538473f9f8316216d40d8f4;
independentparseverifiedcount0. Thisisaread, notabsence/crashreadinessproof.

Preparednewstandbyrolej3e8045beb41448a389634d678ee105a4 onEXISTINGinterruptscratch,
archiveTargetONLYprimarylocal_c0a18601-5a57-44d0-94ac-2fed3719e7ca/PID31678/
start20:14:51UTC/cwdtransport. No arbitrarywakebody orotherarchiveauthority. Prior
interruptreadrole491b51dd terminalreview2attempts/0unknown, quiescejf8167efea8284e84aa0f8ba4ad0d739a,
retirej0048576856c4449fbd71ef3ba32abb81; no processretirement. Stablehookactivation
je46fb0d068c9484b9e8bd2ecd7bdf32e preservedsettings/anchor, newrole
3e8045beb41448a389634d678ee105a4. Nativepolicynegativej06d4b73768804db2afd769731b6cea6f
passed. Standby→primarynativeget_session j59acd29307fb4df3b8e98595942ec254
receiptverified. Allnativecallsconsumedbyhook; noinferencestartforcontrolread.
Standby keepsgenericmetadataread/family capabilities plusfixedexacttargetrecovery
control; rolegrantdoesNOTimplyawakenedprimary orqualifiedunattendedrecovery.

LiveNEGATIVEcoldrequestj3a7705eb47eb4a02beda24d1fc058fed failedbefore-preflight,
childrenEMPTY, no quiesce/retire/archive/wake ofprimary. PrimarynativePIDstillalive.
Failurepreserved/retrySafefalse; don'treplayoriginalparent. No deliberateprimary
kill/archive/crash, apprestart, newchat orhumanpermissiongate. SameactorPID90418.

AddedREADONLYbroker_service_standby_plan exactactor/service/primary/service/family
arguments. Ownverifiedselectedgeneration/familyreceipt, primaryterminalhistory,
sealedtargetscope andOSprocessabsence required. A liveprimary returnswait/primary-live;
unknown/history/stop/changedepoch/family/standbyissues failclosed. Plannerreturns
onlyeligibility, effectsPerformedfalse/recoveryAttemptedfalse/absenceCauseunclassified;
neverinfercrash frommissingpeer andneverexecuteplan. Threepuretestsincludeabsent
positivefixture, live/OSpresentnegative, unknown/STOP/stalefamily/epochscope refusal.
Actualcurrentplanreturnswaitprimary-live/coldRecoveryEligiblefalse. No auto-failover
routing/enrollment installedyet; no backgroundwakeup or observerduplication.

Coexistenceverification afterstandbyroleturnover: actualfreshCodexMCPordinarysend
harness-native-native-send-codex-2026-10-17T22-39-46-988Z.jsonPASS18checks, primary
controller→standby/recipient stillgets exactcausalreply/settingsunchanged, samejob,
no maintenance/inferenceonprimary/source/globalconfigunchanged. Thisishealthy
sendproof, notcoldrecovery. FINALHOST474d5fade072e9755a5e3d5d9c3d8011bc96449aa7d70f9634b0946278d57fdf;
primarysealed3dc08c68; standbysealed354f32ad. Fullpressure
v2-2026-10-17T22-39-50-521Z.json1/1sourceunchanged. Bothsynthetic10checks
harness-v2-{claude,codex}-2026-10-17T22-39-48-015Z.jsonPASS.

CURRENTprimary096...ready/policytrue,idle31678/start20:14:51UTC,9settled/0unknown,
54slots. Standby3e8045...ready/policytrue,idle90418/start21:37:26UTC,1settled+
1terminalpolicynegative/0unknown,30slots. Bothrecordsettingsbaselineunchanged.
Privateplan.metadataControlTrial.standbyFinal savesexactroles/family/lastplan;
standby*stepsretaindurablejobs. Originallegacy35b...brokeruntouched/observerowned.

NEXT: durable explicitstandbyenrollment/routing linkingexactprimarygeneration to
retainedfamilyreceipt andsealedstandby. Primarygenerationrenewalmustrefreshthat
proof; oldfamily/serviceIDs mustNOTsilentlyfollowarbitrarysuccessor. Onlyafter
independentactualabsence andzero unknowns cannewcoldrequestbeconsidered; original
negativeparentneverreplayed. No deliberatekill/repeatedarchivecyclesforgreen.
Appquit/bothcontrollersgone, naturalpressure, creation/no-folder/fork/fullarchive/
window/personpermissiongatesremainunqualified. Goalactive, watcherpaused; noCUA/
input/auth/restart/newchats/manualkills. Codex-driver/1Passwordparked.

## October 17 recovery role preservation and honest idle-residency evidence

Previousbatch published21d1d9b. Foundrealcold-recoverycompositiongap: d.prepare
alwaysinstalledplainreadrole, losingverifiedmetadata/archive target andmodel/send/
stopgrants. Addedrecovery-role.mjs toderiveprepareargumentsONLYfromverifiedterminal
historicalgeneration+policy with exactsession/build/oldPID/procStart. Rejectmixed
roles/policydisagreement/unresolvedhistory; currentownedbypass targetbindingmust
stillmatchsamePID/procStart/cwd withnoPR/worktree. Preservealltruegrantswithoutadding
newones. Preflightbeforeeffects capturesrole; revalidatetargets beforeprepare;
finalstatusmustmatchrole andsettings. RecoveryresultnowrequiresrolePreserved:true,
notmerelyreadiness/readreceipt. Existingdefaultmetadataenrollmentstorescontroller
session/cwd plusrecipientepoch (notcontrollerPID), so same-sessioncontrollernewPID
needsnoindexretarget if recipientepochunchanged. Nativeactivationcold_rebind still
owns controllernewPID verification. No forgedpermissions or silenttargetrebind.

Tenrecovery/role testsPASS plus2residencytests: read/meta/archive scope, missing or
changedtarget/grants/history, eachrecoveryphasefailure/replaystops. Read-onlyactual
current0968475b policy+status validatedrecoverypreparearguments with SAMEinterrupt
recipient andall3existinggrants. NO actualcoldrecovery/processkillperformed; role
preservationisunit+currentpolicyvalidatedcandidate, notnewnativecoldqualification.

Adapted EXISTING residency-v2 entrypoint with optional --session/--service-id to
newindependentreadonlyobserver. It neverwakes/sends/probes/renews/navigates/manufactures
pressure. Requiresownedverifiedliveidle/readiness/policy, exactsource/PID/procStart/
selectedservice, sufficientlease, zero unresolved andunchangedreservedbudget. Two
puretestsrefuseepoch/source/traffic/input/control/leasechanges. Quarantineremains;
before/afterinputaudit. Idle survival separatefromCronprotection/recovery/pressure.

Actual240second observation: independent-residency-2026-10-17T22-28-43-751Z.json,
17samples, PID31678/start20:14:51UTC/service0968475b/sealed3dc08c68 remainedidle,
reservedSlots8 unchanged, source1c14d49aab7cf0df57e2b6533c2e4ecf534ac0bd2a6e19ed9c26c71d76a46cba
unchanged. idleSurvivalVerified:true,pressureQualified:false,pressureEvents0,
errornull,okFALSE/exit1 deliberatelyUNQUALIFIEDforpressure; no processfailure.
No nativewrites/navigation/input/recovery; noCronprotectionclaim. Don'trepeat
samequiet240s topretendpressure; onlynaturalpressurecanqualifythatgate.

Reviewedinstallednativegovernor afterisolatedcontractFAILEDadapter schema:
governor-contract-2026-10-17T22-30-33-167Z.json retained. Correctsource
index.chunk-CFJssAFf.js SHAabff2bf8cd6fa8d3d18964636ebaa6034e93997a9eea16a8802eaec0f759c9b7,
2111078bytes. Primary2MiBsourcehelperREFUSED; boundunchanged. UsedEXISTINGgovernor
contract8MiBboundedreader forreviewedfunctionexcerpts, noappAPIexecution. Current
nativevictimfilter excludesbusy, stopping, activeagents, liveCronjobs/loopwakeups,
remotecontrol/lanyard/protectedstates. Constantsfp60s/dp2/pp100/mp300s andupidle
threshold extracted underexacthash. Added2.42304adapterpinnedtofullsourcehash with
reviewedp5/logging/Pi/boolean syntheticdependencies; noOSpressure/nativewrites.
Newisolatedgovernor-contract-2026-10-17T22-33-02-096Z.jsonPASS4scenarios (cronprotect,
unprotectedvictim,busyexclude,allprotected/debounce). Syntheticdependenciesremain;
notlivepressure/nativeprotectionconfiguration proof. Earlierfailureimmutable.

FINALHOST354f32adaa32eb7f1d4e4167601646a7045f1294958aa3f7228ba82e8dc6b8fd
addsgovernoradapterafterobserver. Currentcontrollerstillsealed3dc08c68, ready/policy,
PID31678idle,7settled/0unknown/56slots; target90418 unchanged. Fullpressure
v2-2026-10-17T22-33-23-767Z.json1/1/sourceunchanged; bothsynthetic10checks
harness-v2-{claude,codex}-2026-10-17T22-33-57-927Z.jsonPASS. No freshnativecoldcontrol
claimedonthissource; existinghealthyMCPcontrolproofprevioussourcepreserved.

NEXT changedcondition: evaluateexplicitindependentstandbycontroller onEXISTING
ownedother scratch andretainedprimaryempty-familyreceipt, withoutarchiving/killing
currentprimary orrepeatingbudgetcycles. Thenon-demandcoldrecoverycanreuseexact
priorrole; mustpreserveunknown/nativeconsentfailures. If no processloss occurs,
prepare/testnon-effectrouting/guardsratherthanmanufacturecrash/OSpressure. Legacy
observerownslegacy35b...broker; don'tduplicateitswake. Broadercreation/no-folder/
fork/archive/window andnativepersonpermissiongatesstillremain. Goalactive,
watcherpaused; noCUA/input/auth/restart/newchats/manualkills. Codex-driver/1Passwordparked.

## October 17 ordinary controls now maintain bounded controller admission

Previousbatch publishedc911dc6. Reusedexistingdurablebroker_service_renew andpolicy
probe for native metadata/send/stop/steer via native-controller-maintenance.mjs.
Under SAMEindependent-route controllerlock usedbycurrentreadrouting, inspect exact
selectedinstalledliveepoch/terminalattempts/stop/input/state/capabilities/target
scope beforemaintenance. Wholeoperationcount1..4 budget/lifetimemargin checked;
metadatarequiresidle recipient, send/stopallowknownbusy. Insufficientmargin renews
ONEdurablechild; missingpolicy probesonlywithroomforprobe+operation, otherwiserenew.
Afterchild, reselectandreinspect samecontrollerPID/procStart, identicalrecipient
session/cwd/PID/procStart, ALLthreeoldcapabilitybooleanspreserved, andwholeoperation
ready/policyadmitted. Unknown/change/stop/nativeinput preventsadvancement, never
wakes/restarts/handoffs. Healthyrequests haveNOmaintenancechild/files. Expiry
planning iscoveredpurely; reallive qualificationbelow iscapacity, notidleexpiry.

Maintenanceledgerbefore-renew/after-renew/ready, stableidempotencykey perparent,
childjob andobservations preservedbeforetargeteffects. Existingledgerisnot
replacedifwrite-exclusivefails. ReturnedmaintenanceJobId isEXPLICIT; nativeMCP
noMaintenanceChildren checknowalsoexcludesthisfield, avoidingfalsehealthyclaim.
Steerpreflightadmitstwoeffects beforestop; metadatawholebatchcountbeforefirstfield.
Cancelled/failedmaintenance cancontinueasdurablechild, butparenttargeteffectdoesnot
advance; inspectoriginalchild, no newidentity/replay. Fournewmaintenance+existing
focused23checks PASS: capacity/expiredplanning/probebudget, owner/input/grants,
extra-grantdropping, target/controllerepochchange, unready/unknownsuccessors and
singleattemptfailure. No newautomaticgrant/permissionauthority.

ChangedconditionLIVEtest (not47dummyrequests): manualboundedrenew
ja46f2249f31d455083e8b84d489c6935 frombeec0b... createdlowbudgeta46f... with2max,
negativepolicyprobeconsumed1, leaving1slot. Ordinarypublicthreefieldset_session_config
j783bc0245a9544da89f0c7a872651e61 AUTOMATICALLY renewedviachild
j0968475bc538473f9f8316216d40d8f4, thenverifiedtitle/unpinned/high onnewcontroller
0968475bc538473f9f8316216d40d8f4. Targetsame90418, controller same31678.
Allmodel/send/stopgrantspreserved. Immutableoldhistoricalstatusverified/files-retired,
terminalreviewtrue, ONLYpolicynegative reserved and0unknown; requestsdirABSENT,
no protocolfieldrequests existedthere. Firstdiagnosticreaddir assumedthatdir and
failedENOENT; correctedreadonlyreviewusesverifiedretiredstatus+explicitabsence,
notmissingroleinference. MaintenanceReadyAt1792275827724 precedesfirstfieldintent
1792275827734; allthreefieldresults bindsuccessor. Sameparentreattach reusedtrue,
maintenancehash84d747c4.../routehash1acd1ae4... unchanged. Privateplan
metadataControlTrial.automaticControlReview/automaticControlOrder retainproof.

FINALHOSTANDSEALED3dc08c686d9d062e6a53d4248ecf1263b2804e82b2322d233736934190024357.
FreshactualMCP healthy ordinary steering BOTH19checksPASS, includingNOmaintenance
children, distinctstop/sendcontexts, phaseorder, causalreply, sameparentreuse,
source/globalconfig/settingsunchanged:
harness-native-native-steer-codex-2026-10-17T22-24-13-699Z.json and
harness-native-native-steer-claude-2026-10-17T22-24-34-172Z.json.
No formattingfailurethistime. Fullpressurev2-2026-10-17T22-23-59-635Z.json1/1/
sourceunchanged. Bothsynthetic10checks harness-v2-{claude,codex}-2026-10-17T22-24-29-851Z.json PASS.
Current0968475bready/policytrue,idlePID31678/start20:14:51UTC,7settled/0unknown+
1policynegative/56remainof64,deadline1792279424716. Targetidle90418/start21:37:26UTC,
exacttitle/tool/Haiku5.5/high/bypass/unpinnedbaselineunchanged. No outstandingjobs.

NEXT: thisqualifieson-demandmaintenance forKNOWNLIVEcontroller, notprocessloss,
appquit/crash/archive/deletion ornativeauthrecovery. Reuseexistingcoldrecovery
foundationonlywithindependentexactscope/retainedreceipts; legacyobserverstillowns
legacybroker recovery. Read-only residency/naturalgovernor pressure and possible
explicitstandbycontroller failover needseparateevidence; do notrepeatbudgetrenewal
orcontrolledarchivecycles asunattendedproof. Creation/no-folder/fork andfullarchive/
windowcoverage stillremain; nativepersonpermission/deletegates stayintact.
Goalactive, watcherpaused, noCUA/input/auth/restart/newchats/manualsessionkills;
Codex-driver/1Passwordparked.

Final2651fd5e validation: fullpressure v2-2026-10-17T22-21-34-825Z.json1/1/sourceunchanged; bothsynthetic10checks harness-v2-{claude,codex}-2026-10-17T22-21-18-850Z.json PASS.

## October 17 verified focus restoration on existing owned chats

Previousbatch published90def77. InspectedremainingTierAfocus code: restoreFrom
previouslyclaimedfrontapprestored afteropen evenwhenactivationfailed; withFocus
show claimedshown withoutlandedreadback. Factored restoreFocusPolicy with injected
nativeI/O fornon-UI regressioncoverage. Restorationnowreadsbackmainselection AND
frontbundle; activationfailure/unknownsnapshot append(notconfirmed), verifiedfalse.
Interveningmain-sessionchoice skipsBOTHmainandfrontrestoration; interveningother
foregroundapp ispreserved. No repeatedbring-to-front afterhumanchoice.
withFocus showrequiresobservedtarget; open_session emitsnavigationVerified,
focusVerified andfocusDisposition, retainingexistingfocusactionstringcompatibility.
Existingknown-targetopen errorsattemptscopedrestoration; unknown-targetcreation/
forkfailure restorationstillnotqualified. No computeruse/keyboard/helperloaded.

Fivetestfocus suitePASS: positivebothreadbacks, failedmain/front activation,
userintervention, unknownobservation/errors andmissingoriginalsnapshot. Liveowned
open_session transporttargetc0a18601 focusrestorePASS: before maininterrupt74c54.../
frontcom.openai.codex, observedtransporttargetlanded, aftermaininterrupt/restored
Codexfront. Independentpost snapshotmatchesbothbefore values. Before/afterinput
resourceaudits0filters. Reportfocus-2026-10-17T22-20-11-575Z.json,
sourceb180ca0d11a3120f14542efeb436d76b5e29bd48731f2c1b4aa32d7929688c3d.
Nochatcreated, no modelmessage, no permissionchange, no apprestart. Thisqualifies
existing-sessionnavigation/restoration, NOT create/import/forkfocus orfullwindow
management. Finalhost2651fd5edec90b8c6033be2ad83c2a304a9221767671305bb2d7a01c7b9d602a
addsconservativeunknown-originalsnapshotrefusal; livepositivebranchunchanged.
Finalpressure/bothsyntheticreportscheckpointed below. Controllerbeec0b... still
ready/samePID31678/start20:14:51UTC,16settled/0unknown/47slots. Target90418 unchanged.

NEXT resiliencegap identifiedincurrent source: independent-service-route readpath
alreadydoesdurableon-demandrenew/probe; native metadata/send/stop/steercontrolpaths
merelyrefuse when deadline/capacityinsufficient. Reuseexistingrenewal withcommon
whole-operationadmission, preserveexplicitgrants/targetepoch/unknownblocks and
stablechildidentity. Qualifychangedcondition via boundedlowcapacitygeneration,
thenordinarypubliccontrol triggeringrenewal; don'tconsume47dummyrequests or
repeatarchive/wakecycles. Thiswouldimprovealwaysready behavior withoutclaiming
unplannedcrash/quit/delete recovery, which remainsseparate/unqualified.
Remainingcreation/no-folder/fork,fullarchivecleanup/nativepersonpermissiongates
andunattendedresidency alsoincomplete. Goalactive; legacyobserverownsborker;
watcherpaused; noCUA/input/auth/newchats/restarts. Codex-driver/1Passwordparked.

## October 17 enrolled live profile passed with real busy queue/steer

Previousbatch published1cd6011. Adapted EXISTING scripts/live-v2.mjs with explicit
--enrolled --input-free --session <ownedtarget> --controller <exactcontroller>.
No newchat/import/navigation/archive/permissionchanges; explicitownedoperation
allowlist/ownedjobwaits, exactenrollment/ready/policy/targetepoch/budgetpreflight.
Allnative mutations runas durablejobs. Cleanuprestoresbaseline instead ofarchiving
activefixture. Existingdefaultfull11runner remains, profile scope/exclusions are
explicit; doNOTcountadoption ascreation/focus orrestore asarchivecleanup.

qualification.recipientReplyEvidence now supports explicit nativePeer sender/body
SHA256 with cursor/ancestry while retaining exact peer-msg-id mode. Mixedmethods,
foreign/duplicate roots, interveninghuman/toolancestors rejected. No returnednative
message-ID linkage invented; multiple distinctpeerturns supported. Ninequalification
andfourbatchfocusedtestsPASS. metadata-config-route records boundedpreflight
status/PIDs/budget/ready/policy onfuturefailure, no prompts/toolresults.

FIRSTprofile live-v2-2026-10-17T22-15-57-717Z.json FAILED preserved. Initialreply and
pre-dispatchcancelpassed; threeconcurrent metadata parents failedphasecreated with
EMPTYchildren (jf6cc2c6...,j57ad2951...,j3a78f281...). No nativeeffectsfromthoseparents.
Cleanupstop/configrestoredfixture, before/afterinputfilters0. End_turnreply was
followedimmediatelybyidle-onlymetadatacontrols. Exactoriginalstatusnotcaptured,
so nativeidle-lag is a supportedhypothesis, NOT provenretrospectivecause. Changed
condition: explicit samePIDidle waitbeforeconcurrent/batchedcontrols andcleanup;
metadata guards remainstrict. Cancellationchecksnowinclude Independentnative
requestprogress andabsenceofderivedindependentpublicationfile.

Firstprofileleft13slots, below16slotwholeprofilepreflight. Necessaryboundedbudget
renewal jbeec0bded45642239eb6e435fc9c6293 supersededdd6... retainingoldterminalhistory,
model/send/stopgrants andtargetepoch. NEWcurrentcontroller beec0bded45642239eb6e435fc9c6293,
sealedANDhost300971f1ffea036605add006599a17c658a92dcf04211416c4a4659bc667f315,
64maxRequests/1hdeadline, ready/nativepolicytrue, samePID31678/start20:14:51UTC.
Target90418/start21:37:26UTC,enrollmentunchanged. Thisisbudgetrenewal, notcrashrecovery.

REVISEDprofile live-v2-2026-10-17T22-17-16-448Z.json PASS all11PROFILEchecks:
inputauditbefore/adoptexactenrolled/initialdurablesubmit+reuse+causalreply/
prepublicationcancel/concurrentcontrols/batchedcontrols/actualbusyqueuedelivery/
stop+replacementcausalreply/uniquereplies/restorebaseline/inputauditafter.
Concurrents10.2s,batch6.7s,queue2.6s,interrupt9.5s,cleanup7.1s.
Batchedlogrequests:1 meansONEPARENTBATCH, withTHREEnativechildrequests (notone
atomicnative APIcall); don'toverstate batchingefficiency. Queueacceptedwhilebusy;
stopreceipt/stoppedtrue→sameepochidle→replacementaccepted→causalexactreply;
oldcompletionmarkerabsent. No tools/permissionwait required bycountfixture.
Independentbounded262144bytejournal review foundexactlyONEinitialreply,
ONEqueuedfollowupreply andONEreplacementreply; ZEROcountfinishedreply. Thusqueued
followup waspreserved/replied, notdiscarded. Originalgoalrequires preservingqueue.
Ownerreviewprivateplan.metadataControlTrial.enrolledProfileReview retainsUUIDs,
report andrestoration. Baselineexacttitle/toolsource/Haiku5.5/high/bypass/unpinned/
unarchived verified; targetidlePID90418. Controller16settled/0unknown+1terminal
policynegative;47slotsremain. No outstandingnative/modelwork fromprofile.

Finalsourcepressure v2-2026-10-17T22-17-40-807Z.json1/1/sourceunchanged. Bothsynthetic
10checks harness-v2-{claude,codex}-2026-10-17T22-17-28-737Z.json PASS. Profileliveproof
andcontrollersealedruntime matchfinalhost300971f1. Legacyobserver ownslegacybroker;
watcherpaused; noCUA/quarantine/auth/permission/restart/sessionkill/newchats.

NEXT fullobjectivegaps: creation/no-folder/fork andindependentfocus/windowproof;
archivecleanup/publiclifecycle broaderscope, nativepersonpermission/deletegates;
unattendedserviceafterquit/crash/archive/delete andnaturalgovernorpressure. Full
originalcreate-and-restore-focus pluscleanup-archive notprovedbythisprofile.
Do NOT runanotherequivalentcount/profileforgreen. Existingnamedinput-freeprofile
nowservesregressionbaseline whileadvancingremaininginterface/resiliencegaps.
Goalactive; Codex-driver and1Passwordremainparked.

Finalc51ff7e3 validation: v2-2026-10-17T22-14-10-496Z.json1/1/sourceChangedfalse; bothsynthetic10checks harness-v2-{claude,codex}-2026-10-17T22-13-47-266Z.json PASS.

## October 17 read-only MCP steering acceptance and scope audit

Previousbatch publishedefc26b9. Added scripts/review-native-service.mjs with a
review-only nativeproxy mode: advertises/admit ONLYdriver_guide and exact
existingcompletedparent driver_wait (20s/include_result:true). NO driver_submit,
status/write/foreignjob admission; missingparent cannotcreatework. Owner prechecks
completedsteeroperation/args/fingerprint/exacttarget/service/routefile andoriginal
trace path; boundedownedregularfile/no-follow/nonblockingreads. Originaljob,
routeledger,contract andtrace SHA256 unchanged aftereachrun. Threefocusedtests
coverforged/missing/runningparent, submit/foreign/expandedwait refusal andstrict
providerstructuredverdict. These are historicalacceptance reviews, notfreshnative
control/inference/livenessproof and notnewidempotentsubmissions.

Codexgpt-6-sol read-onlyreviewPASS native-steer-review-codex-2026-10-17T22-12-27-820Z.json,
existingparentj828eb62c887848178c553d7827ed52fe. Claude firstreview
native-steer-review-claude-2026-10-17T22-12-26-679Z.json retainsokfalse/finalMarkerfalse:
allmechanicalchecks true, clientexplainedchecks thenendedNATIVE_MCP_OK. Exacttext
criterionremainedstrict, no retroactivepass. LocalbundledCLI--helpconfirms--json-schema.
Claude reviewer now usesprovider JSONSchema{status:enumOK/FAILED,noadditionalkeys};
parserrequires structured_output exactsingle statuskey, never prosemarker.
SecondClaude read-onlyreviewPASS native-steer-review-claude-2026-10-17T22-13-11-881Z.json,
sameexistingparentj211477153e84459c83153d9f3870f63f. Bothfinalacceptancereviews
oktrue,nativeEffectsAttemptedfalse,noSubmissions/historicalBytesUnchangedtrue.
Originalnativeharnessfailures frompreviouscheckpointremain unchanged. Provider
structuredformat improvement appliesreadonlyreviewer; no blanketnativeharness
formatrelaxation. Finalhostc51ff7e340ea3e1a2bebb1faa95b5885b0369a833a44c23fdd2377205a8dd55d
includestracepath/nonblockinghardening afterreviews; finalpressure/syntheticfollow.
Controllerdd6abdf2 remainssealed506797c3, samePID31678/start20:14:51UTC,idle,
ready/policytrue,14settled/0unknown/17slots. Target90418 unchanged. No nativeeffects,
newchats,permission/input/auth/restart/globalconfiguration changes inthisreview.

### Completion audit against original brief and eleven-check runner

Current code/evidence proves narrower components, not full always-on completion.
Historical qualifications remain source-scoped; don't silently carrythemforward.

| Requirement | Evidence and remaining work |
| --- | --- |
| Durable submit/reuse, uncertainty, cancellation | Fullsynthetic/currentpressure plus exactcompletednativeparentreuse; currentnative pre-dispatchcancel stillneeds combinedrunner qualification. |
| Native send and recipient reply | BothfreshMCPs source3669 plus lateststeer replacementreceipts/causalreply. Hostinjection sender/body/cursor correlation explicitly notreturnedUUIDlinkage. |
| Stop/interrupt steering | ToolfreemodelbusyCLIproof andbothnativeMCPphase/order/replychecks plusreadonlyacceptancePASS. Queuepreservation is appcontract, notdiscard. |
| Busy queue-is-not-interrupt | Parser/admission synthetic onlyatcurrentfrontier; actualbusyqueue outcome andpreservedqueuedturn ordering remain toverify. |
| Title/pin/model/effort | Source3cb091a3nativeCLI/bothMCPmodelconfigproof; controlled concurrent/batchedwhole-suite behavior currentroute stillneeds freshcombinedqualification. |
| Elevencheck live-v2 entrypoint | Code still assumeslegacy receiptSource/nativebrokerbatch fields andpeer msg_id, creates acceptEdits fixture, archivescleanup. Needs enrolledexistingfixture adaptation, retainingall11requirements. Currentcomponentproofs donotmake its commandpass. |
| Create chosenfolder/no-folder, fork | ExistingTierAimplementation/historicalbrief only; current-source nativecreation/fork/focusproofmissing. Don'tcreateanotherchat incidentally or downgradebypassfixture toforcecoverage. |
| Focus/windowmanagement | Currentlive-runnersnapshot checks exist, nativefocus/window coverage remains separate; no CUA/quarantine changes authorized bytestneed. |
| Archive/unarchive/delete/projectarchive | Existinggates andpriorcontrolledarchive/wake/rebind proof; notcurrentpublicwholeinterfacequalification. Human-onlydelete/permissioncards stayrequired; no realdeletionneededforsmoketest. |
| Permissionmode | Bypassfixtures currentlyverified; raisesremain nativepersonconsent. Cannotclaimunattendedautomaticpermissionrecovery. |
| Unattendedresidency/recovery | Currentboundedrole deadline/capacity andmanualverifiedrenew/rebind doNOTprovealways-on aftercrash/quit/delete/archive. Existinglegacyobserverownsbroker; preservegovernor/auth/epoch distinctions. |
| Cross-harness availability | ActualClaude+CodexMCP verified; attachedoldCodexbinding remainsstale. Cursor/OpenCode registration/currentruntime exercise andportablehelp/schemacoverage notfreshlyaudited. |

NEXT changedcondition: adaptEXISTINGlive-v2 qualification toexplicit enrolledowned
fixture, currentreceipt/causalcontracts andrestore-onlycleanupwhenactive service
mustremain. Preservecreate/focus andarchivegates asindependentrequiredchecks, not
silentlyreplace11checkswithcomponentloop. Then actualbusyqueue/preservedturnorder,
concurrentcontrol/cancel/current-source combinedsuite; broadercreation/focus and
unattendedlifecycle remain. Goalactive; no same-nativeeffects repeatedforformat.
Legacyobserver ownslegacybroker; watcherpaused; Codex-driver/1Passwordparked.

Final04352d46 checks: fullpressure v2-2026-10-17T22-11-07-943Z.json1/1/sourceChangedfalse; synthetic10checks each harness-v2-claude-2026-10-17T22-10-54-026Z.json and harness-v2-codex-2026-10-17T22-10-54-026Z.json.

## October 17 durable interrupt steering and evidence correction

Previousbatch publisheda028d42. Implemented native-steer-route with parent ledger,
distinct deterministic native phase contexts (NOT separately scheduled driverjobs),
record-before-stop/after-stop/before-send/after-send, full two-grant/capacity/deadline
preflight and exact controller/target epoch guard. Only recognized stopped/alreadyidle
plus verified sameepochidle allows replacement. Cancel/unknown/changedepoch/diskfailure
stops progression; ledgerexisting refuses replay. Public enrolled steer interrupt
now uses this route, queue reuses single native send. Optional controller_session
supported, peer-direct remainsqueueonly. Nativeeffects partially applicable, notatomic.
Originalqueuedmessages remainpreserved; busyqueuedwork may preventidle verification.
Fourfocusedordering/identity/cancel/persistence tests and oneMCPsemantic testPASS.

IMPORTANT CORRECTION superseding priora028d42 busy Bash/sleep claim: exact original
Bash toolresult toolu_01UbrvBn27VdsR8nA5vsMyB2 was PreToolUse refusal ofstandalone
foregroundsleep. Nativebusy observation+stopped receipt proves active-turnstop,
NOT a running subprocess interruption. No subprocessstart/cancellation was proved.
Preserveoriginalrecords; don't cite earlier7event/isError as subprocessproof.
Firstnewsteerforegroundfixture similarlyrefused; idle stop/replacementstillworked,
but NOTbusyproof. Supportedbackgroundsleep/Monitor alternative then refusedby
sealedservicepolicy (onlyepochboundwait/checkentry), no commandran, no bypass.
Policyrefusals preserved; do not weakenpolicy to satisfyfixture.

Changedconditionfixture: toolfreecount1..2000. Sendjdf5804674a834b9e861f150e0896ed59,
nativebusyPID90418 independentlyobserved BEFOREsteer. Parentj71a4121cdff546dc980daddab15a1279
completed withstopRequest rpeer6d2a8ab20f90c10449a3456c6ca403e2 then replacement
rpeerfae611700b72a2e69bfb03e8f003291f. Exactstopped/sameepochidle precededsend;
replyNATIVE_STEER_COUNT_OK independentlycorrelated bysender/body/capturedcursor/
causalpath,6events/hasMorefalse, noCOUNT_FINISHED marker. This provesbusy MODELturn
interruption+replacement, notchildprocesskill. Reattachsameparent reusedtrue,
routeledgerhash7b5836c2... unchanged, no newnativepublication.
Initialidlecompositionparentj66bfd48966be440f9e4c3623dde16d0c retained too.

Extendedexistingfilteredharness --native-steer, separateclaimmode, freshschema,
exactpublicsteer/double-submit/sameparent, distinctphaseIDs, independentledgerphase
order/native stopreceipt-time before sendintent-time, causalreply/settingsproof.
ActualClaudeharness-native-native-steer-claude-2026-10-17T22-09-23-449Z.json and
Codexharness-native-native-steer-codex-2026-10-17T22-10-17-413Z.json EACH:
nativeContractVerified:true, EVERY19mechanicalchecktrue EXCEPTfinalMarkerfalse;
okfalse/failureCategoryharness_output_format retained. Clients returned
NATIVE_MCP_FAILED CORRECTLY because harnessprompt erroneouslystillrequired
independent-native-send andrpeerparentID. Actualsteerreturnsinterrupt/twophaseIDs.
No native replays. Fixedpromptnowrequiresactualroute/phaseidentities; regressiontest
rejectsshared/missing/pendingphases. Originalfailedreportsnotrewritten aspasses.
BothactualMCP runs were IDLE stop/replacement, busy proofis separateCLIabove.
Finalprompt-fixsource04352d46b547ff43dc39560b02c46a521229e822cae8d9e5d5d7056c43d96f9e;
actualMCPmechanicalproofsource6002a427; originalCLIsteercode2e712c715; controllersealed
506797c3. SourcechangesafterMCP areprompt/testonly, no native routechange.
Finalfullpressure/bothsyntheticreports checkpointed next; nofinalpromptfreshnative
replayclaimed. If finalformat acceptance required, use READONLYreview/reattachof
exactoriginalcompletedparent/key and refusemissingparent; don'tsendagainforgreen.

CURRENTcontrollerdd6abdf29e2e415f873b08b9e2893cc6 ready/policytrue,PID31678/
start20:14:51UTC;14settled/0unknown+1terminalpolicynegative,17remainingof32.
Target90418/start21:37:26UTC, ownedbypassscope unchanged. Allwork inprivateplan
metadataControlTrial; legacybrokerobserverownslegacyrecovery, watcherpaused,
noCUA/auth/permission/restart/manualkill/newchats. Codex-driver/1Passwordparked.
NEXT: correct finalformatMCP acceptance byexistingjob read-onlyreattach withoutnew
nativeeffects; revieworiginalfull11live/creation/focus requirements and resumed
unattendedlifecycle qualification. Don'tsubstitutemoreequivalentcount/metadata
loopsforremainingoriginalinterface/servicecoverage. Goalactive.

## October 17 native stop capability and busy CLI proof

Previousbatch published da7ac3c (genericnative send). Added explicit separately
sealed metadata_stop_control:true / metadataStopControl, static exacttarget native
stop_session callback, admission-time sameepoch/knownbusy guards and durable public
stop_session route on enrolledcontroller (optionalcontroller_session). Send/model
grants do not confer stop. Native stop acceptance preserves stopped/already_idle/
requested distinction; route returns verifiedidle only after samePID/procStart,
registeredtarget/bypass/scope observation. Requested/reconnect, missingreceipt,
epochchange, cancelledobservation and idletimeout cannot authorize replacement.
Native queued work is preserved. Native API epoch check is admission-time, not
atomic targetepoch conditioning inside appAPI; don't overstate it.

Installed2.42304.0/2.1.299 source B5chunk SHA
f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff rechecked exact
stop strings and waiting/start refusal; no private APIexecution. Focused31 callback/
receiptchecks PASS including separategrant, singlecall/dedupe, injection/foreign
refusal, pendingnotidle and receiptadmission. Earlierfocused37checks PASS too.
Oldsendonly00acontroller negativej542b38f2a9b44739b5f74ce6754bcbde failed
native_stop_unqualified/dispatchedfalse/retrySafetrue. Preservedfailure.

Newcontroller dd6abdf29e2e415f873b08b9e2893cc6 sealed506797c3a50044090d49bebf3625a63d3f6308fde5011983fcba9ec08e8484d9;
preparedjdd6..., old00aquiescej4b92ea98f320470aa87555df1190e7ef/retirej5ef27ca5b02e47d78e291c1c2c4449cd
reviewed4terminal/0unknown; activateje30b277e55dd4dc190e44b4e78dc71aa withstablehook;
policynegativejb22bc7b726f9432fb413b81cc4ddbd25 passed. SamecontrollerPID31678/
start20:14:51UTC, sametarget90418/start21:37:26UTC, enrollmentunchanged.
IdleCLIstopj79496af4317e41da8423d5598d4407bf completed withalready_idle/stoppedfalse.
Busytestsendja7ab303fdd794fd0acb94ba0e4e731fa accepted once. Capturedoriginalcursor,
observedBash toolcall plus nativebusy BEFOREstop. NativeCLIstop
je3b2d90c339f483abc82eb38dc80530a returnedexactstopped, sameepochidle in~1.1s.
Original30secondsleep hadnotnaturallycompleted (~7s between send/stop);
poststopjournal contains correlated Bash toolresult isError:true, nofinishedmarker,
7events/hasMorefalse. This is actualbusystop proof, not justidlenoop. No manualkill.
Controller3settled/0unknown+1terminalpolicynegative, ready/policytrue; targetidle.

Foundoriginalsteer_session interrupt reused parentctxjobId forstop ANDsend; would
collideat second rpeer identity aftera realstop. Enrolledinterrupt composition now
explicitly refusesBEFOREeffects until distinctdurablephases implemented. Negative
j61821817e4114981a1c17fd100c5b097 verifiesdispatchedfalse/retrySafetrue; not counted
as successfulsteering. Queue-only native path stillsinglepublication.
Finalhost102ac294930553bebf0dfba9c7c4f62db629e2f5b2e798eb90e88c1e46bd7f29
addsthispreflightguard; sealedstopcallbackunchanged506797c3. Fullpressurefinal
v2-2026-10-17T22-06-02-044Z.json1/1sourceunchanged. BothsyntheticMCP finalsource
harness-v2-codex-2026-10-17T22-05-46-912Z.json andmatchingClaude run checkpointed.
No ACTUALstop-specificClaude/CodexMCPcontractyet; existinggenericfixture harness
is not that proof. No freshnative sendcontract onnewstopgeneration claimed.

NEXT: implement persistedsteer route with distinct deterministicstop/send request
identities, preflightBOTHgrants/capacity/epoch, preservedphasefailures and no replay;
verifybusy stop→idle→replacement ordering+causalreplacementreply. Extendexisting
filteredMCPcontract forstop/steer onbothclients. Then originalcreation/focus/full11
live/unattendedresidency remain. Goalactive, watcherpaused, legacyobserverownsbroker;
no CUA/auth/permissions/globalrestart/otherchatmessaging. Codex-driver/1Passwordparked.

## October 17 generic native send qualification

Added separately sealed metadata_send_control:true capability, fixed exact-target
native callback, busy-aware exact epoch admission and durable public send_message
routing through the enrolled controller. Existing ungranted controllers refuse
before dispatch; send capability grants neither archive nor permission changes.
Native acceptance settles publication only (delivered/queued, messageId,
nativeAccepted:true, applied:false). No uncertain send is replayed.

Final host source3669f1359e33a707a6a8e75f1b7dbec07a7e4b1ce62fa223de1fd06932f069fc.
Native controller00a80cb4b85949c8ab776985d4e4d881 remains sealed8d1d09fc, PID31678;
target90418/readservice491b51dd unchanged. Old3900308c retired19terminal/0unknown.
Explicit native-send grant/policy and original CLI sendj9c5289224a774cf4ba83d78f627249a6
verified API acceptance; target produced exact NATIVE_GENERIC_CLI_OK without tools.
Original observer failed: app-native host injection omits returnedmessageId in its
journal origin, and context refresh adds user records. Preserved failure and a
separate retrospective reconciliation from ORIGINAL cursor,109443bytes/25events.
No resend. New observer proves exact native sender/body SHA256 and complete causal
assistant end_turn in bounded cursor window, rejecting duplicate peer roots,
foreign sender/body, missing ancestors and tools. Explicitly DOES NOT claim
returned UUID-to-journal linkage; messageIdAvailable:false records that limit.
Only sender/digest metadata is added under include_causality; user body stays private.

45 focused tests PASS. Fullpressure v2-2026-10-17T22-02-16-244Z.json1/1 unchanged.
Bothsynthetic10checks: harness-v2-claude-2026-10-17T22-02-02-383Z.json and
harness-v2-codex-2026-10-17T22-02-02-381Z.json. ActualfreshMCP18checks EACH PASS:
harness-native-native-send-claude-2026-10-17T22-01-45-237Z.json and
harness-native-native-send-codex-2026-10-17T22-02-21-300Z.json. One publicmessage
perclient, duplicate submission reusedsamejob, exactderivedrequest/service,
recipientreply/settingsunchanged/globalconfig/sourcechecks pass. Controller gets
no inference turn. Busy/queued delivery parser and busy admission have synthetic
coverage only; no real busy/queue/interrupt/steer qualification claimed.

NEXT: generic native stop/steer with busy-state/stop/replacement ordering and
outcome_unknown reconciliation; then originalcreation/focus/full11live and
unattended residency/recovery gates. Avoid equivalent send/metadata repetitions.
Attached old MCP remains stale; freshharness qualification does not refresh it.
Legacyobserver owns broker recovery; watcherpaused; no CUA/auth/input/permission
changes, apprestart/sessionkill/newchats; Codex-driver and1Password parked.

## Explicit model capability verified through native CLI and both MCP clients — October 17

Previous turn progressed/published3cbcc5b. Originalinterface modelselection remained
unserved by independentcontroller; added explicit metadata_model_control:true to
NEW metadata preparation, metadataModelControl:true sealedconfig/policy/status,
static native set_session_model callback, admissionflagcheck, exact persistedmodel
postcondition and public configbatch support. Existingmodel-ungrantedcontrollers
remain scoped to originalthreeoperations; no hostupgrade implicitly grants model.
Renewal code preserves verifiedpredecessor flag; no archive/permission authority.
Full app model IDs required, aliases refused. Installed2.42304/2.1.299 publictool
contract reviewed from .vite/build/index.chunk-B5tintml.js SHA
f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff: offeredmodel
validation, setModel from NEXTturn, selfrefusal, bypass no prompt. Defaultoldsource
extractor first refused stale snapshotmember; retained refusal, used bounded
existingB5member without weakening helper. No private appAPI execution.

Draft review caught undefinedoperation fieldselector before native model tests;
fixed, exactmodel postcondition regression added. Initialfocused33/34 testfailure
was old modelalias expectation; aliases now rejected, testpasses. Allfailures remain
in transcript; no native effect happened in draftvalidation. Focusedcore36checks
and model-MCP contract9checks pass; fullpressure confirms wholefixturecompatibility.
Ungrantedscope live mixedtitle/modelnegativej968b69e365c34a3bbc7c104ea394bc84
failedpreflight atcreated, childrenEMPTY, no title/nativeeffects or legacyfallback.

Intermediatehost82f4d720 passed21:44:10pressure/synthetic; then modelharness/schema
contract added. FINAL HOST AND SEALED source
3cb091a3549a9bd21d6198763fab00b04bc94b9b54ee42de784f8e7a33fd4f96.
Explicitgrantpreparej3900308cc7f146cdbc75dc4dc108f5ed validated nativeplugin; oldbff...
controller quiescedj169eadbdfdf04af8a5e24ce2948ece02/retiredj08828fdd8b7a4efaa6390ef779399772
with13terminalattempts/0unknown. Newmodelcontroller3900308cc7f146cdbc75dc4dc108f5ed
activatedje21d9aeb23e947d0808df35e2257f604, ready/modelcaptrue/nativepolicy
j01af7b12b8c94b519875716229096887. SamecontrollerPID31678/start20:14:51UTC,
target90418/start21:37:26UTC. Enrollment and targetread491b51dd unchanged.

Model-only ordinary set_session_config j34f2d5be05af4fe485d6dd39713336cd switched
targetHaiku5.5 toOpus5.5 with exact native modelchildj1b4a4e7f46324e96967f821dd61fe24e;
restorej177b130e92304ae8a7133a4ce03eedee verified Haiku5.5. No inference turn required.
Extended EXISTING filtered harness with --target-model/fullID and separate
metadata-model claimmode; exactfour distinct children plus independent modelChanged
proof required. ActualClaude19checks PASS: harness-native-metadata-model-claude-
2026-10-17T21-46-16-848Z.json, parentj3d9b2bbe71e34f5592da497c6e8587db.
Fourfieldrestorejd79cf33b0f5349c0923825ebe4fff19b verified before Codextest.
ActualCodexgpt-6-sol19checks PASS: harness-native-metadata-model-codex-
2026-10-17T21-47-26-344Z.json, parentj1a6e339fa2dd479b8c334b0bc6f672f6.
Both changedtitle/pin/model/effort; sameparentreuse/derivednativechildren/readback/
no-modelturn/source/globalconfig/serviceselectionallpass. This proves NEXTturn
configuration, NOT actual modelinference/outputquality or price/billingbehavior.

Finalrestorej9d5575f95cda4474856f983f551612e5, children titlej4af493279b864e8f911a18af9def9f49/
pinj60dc0afb8a764858bd74b1bcaf1c4bf5/modeljf2b685c6372b4461b8674b394c27b5c7/
effortj340059a426084fad8b8e0b03089b2741. Originaltitle/toolsource/unpinned/Haiku5.5/
explicitHigh/bypass restored, exactsameepoch. Reattachsamekey reusedsameparent and
parentledger/nativeevidence hashunchanged. CURRENTmodelcontroller390...status
18settled/0unknown/19reservedof32. Privateplan modelCapabilityFinal retains reports,
oldcapnegativechildrenempty/currentstatus/fixture/no-replaydigest.
Final fullpressure v2-2026-10-17T21-45-26-935Z.json1/1/sourceChangedfalse. Both
synthetic10checks finalsource: harness-v2-claude-2026-10-17T21-45-00-161Z.json /
harness-v2-codex-2026-10-17T21-45-01-295Z.json. No runtimeedits duringliveparents.

NEXT: largest remaininginterfacegap is generic native messaging/stop/steer still
on nonservinglegacyTierB (peer-direct messaging exists, but defaultnative path is
not qualified through independentcontroller). Reuse sealed exacttarget/durable
publication/nativeadmission and distinguish delivery from application. Preserve
busy-state/stop/replacement order and outcome_unknown; do not simply broaden idle
metadata guard to arbitrary tools. Permissionmode remains native-person-gated.
Originalcreation/focus/full11live and unattendedresidency/recovery stillincomplete.
Do not run more equivalentmetadata/recovery variants instead of those requirements.
Goalactive/watcherpaused; legacyobserver ownsbroker; no apprestart/kill/auth/CUA;
Codex-driver/1Password separate. Tool descriptions/public guidance should continue
being reconciled as new routes replace old single-broker implementation details.

## Controlled target-epoch rebind passed after intentional cold cycle — October 17

Previous turn progressed/publishedb756b0c. Added read-only broker_service_metadata_binding
(exactrow/digest, servingnotassessed) and explicit broker_service_rebind_metadata.
Enrollment/rebind writers share targetlock. Rebind requires exact priorcanonical
SHA256, samecontroller/session/cwds, changedtargetPID/start, oldPID ABSENT (present/
reusedPIDrefuses), and currentready/nativepolicy/idleownedtarget/newsealedcapability.
It retains oldrow in metadata-controller-history BEFORE atomicreplacement, then
rechecks qualification/digest/PIDabsence immediately beforepublication. LostCAS
cannot overwrite winner. Interrupted historyretention is not publicationproof;
inspectbinding/originaljob. No nativeeffect, permission, restart or arbitraryretarget
in rebindoperation. Fivefocusedindex tests pass including history/interruption/CAS.

FINAL HOST AND SEALED runtime
9521d90f8a0e2a9907bdcec7be9366f898abda35ccd6c7e9f7dc8f0296a2742b.
Old-live rebindnegative jf840bb740efe4c6bbe68a6630061451e failedretrySafe/dispatchedfalse.
Prepared archivecontrollerd9dc4c0b0c1942e8a3dd733fd1e6c40a from currenttarget13591;
oldmetadata7d6...quiesced/retired with27terminalattempts/0unknown. Archiveactivation
j800c3dda68be483fb00cb4e39d9a87f6/policyj78a9dc327d2544fd82fce09ffc047419 passed.
ONE public cycle parentj66bb01d59a454f20ae459094ba5d87a0 completed all10children:
familyjf84e68503afd487eb488d946188a3765, quiescej44282635f01c4cbf9924a132d00689e6,
retirej6d472e1400de4965979a4911ac3c6784, archivej8bec78d408944a1aacd6d55bd4eecbd8,
unarchivej2fc22e0bf25a4cccb7b3119ebd5f1017, wakej5bbcbbbfbbb1415db1d0e4334de3bdf1,
preparej491b51ddc2a74c0795ef441a54522ff0, activatejbee7f6103c5d4232b843fde2b39545a7,
policyj0a8e66f828bc4114890ded5d7129e557, readjc99325ed824a4f5ea6be4d0a904cf097.
Intentionalnativearchive13591exit/absence, fixedwake/newprocess/fixedreply/ready/
policy/read/settingsanchor preserved. NewtargetPID90418/startSatOct17 21:37:26UTC.
This is intentionalarchive recovery, NOT an unexplained crash/governor/appupdate.
CURRENT TARGET READ service491b51ddc2a74c0795ef441a54522ff0; old9475...retired.

Ordinary pin stale-enrollmentnegativej25955e6f56294ee1b7fc7f397a80dcd2 refused
BEFOREdispatch; oldbinding didnotfollownewPID. Explicit newmetadata preparation
jbff3df8a553f4b078531d948f34b789b sealed newtarget90418. Archived9...controller
quiesced/retired/0unknown; newbff...activatedj0f28c67d054b4fc3a39127320b19f2ea,
ready/policyjffbd979b3a8146eca79e0f537fae02f2. CURRENT METADATA CONTROLLER
bff3df8a553f4b078531d948f34b789b/PID31678/start20:14:51UTC, samecontrollerprocess.
Explicit CAS rebindj456f275c4c2f4472856a21628e737e4a passed, nativeeffects0:
old digest d0f9bbb448a8ac9ea13fd30fb0fd309d6f8a7902ba0257c02f4935557ddaaf16
new digest 1a1112541aa2b8966b18e703980d9eb5c4a558d214a9e5fa01dc92469e5a0598.
Old row remains exact in history/<target>/<oldhash>.json. Olddigestnegative
j33c9bc1cf952437aaba10d3e46f28d33 refused; noforcedpublication. Same-key original
rebindreattach reusedsamejob; activebinding AND retainedhistory bytes unchanged.

Both fresh actualenrolledrouteMCP mutationcontracts on recoveredtarget/newbinding
PASS18checks (actualtitle/pin/effortchange/derivednativechildren/no-modelturn/state
readback/source/globalconfig/parentreuse): Claude harness-native-metadata-enrolled-
claude-2026-10-17T21-38-25-956Z.json parentj4b895375a5494dafa1b3263fa391a6de;
Codexgpt-6-sol harness-native-metadata-enrolled-codex-2026-10-17T21-39-07-946Z.json
parentj563abf2ae7ef4ccc92b400de9e70779e. Claude restorej007517e1eab84108ac99232084c3e3da
then finalCodexrestorej63f48463a038440db420bb489e0a3126 passed ordinary(no controller)
route. Fixture originaltitle/toolsource/unpinned/explicitHigh/Haiku5.5/bypass/new90418.
Finalmetadatastatus12settled/0unknown/13reservedof32. Privateplan rebindFinal retains
rows/historydigest/status/reports; recoveryparent preserves fullnativecycleevidence.
No indexdeletion, unknownreplay, apprestart, sessionkill, CUA or auth/permissionchange.

Finalpressure v2-2026-10-17T21-37-04-211Z.json1/1/sourceChangedfalse. Bothsynthetic
10checks finalsource: harness-v2-claude-2026-10-17T21-36-43-113Z.json and
harness-v2-codex-2026-10-17T21-36-44-249Z.json. Allsourcefrozen duringliveparents.
Recovery roleturnover/newmetadatareseal/rebind were explicit separate durablesteps;
this does NOT establish unattended automatic recovery or full always-onbridge.

NEXT: refresh originalrequirement frontier and choose largest unserved functional
interface gap (model/config and generic native messaging/stop/steer remain on legacy
TierB). Avoid more equivalent coldcycles now: enrollmentrestarttransition is proven.
Reuse exacttarget admission/durablepublication/result separation for newnativeops,
retaining platformhumanconsent and all originalcreate/focus/full11live gates. A
future durable orchestrator can compose roleturnover/recovery/reseal/rebind; not yet
unattended. Goalactive/watcherpaused, legacyobserver ownsbroker; Codexdriver/1Password
separate. Do not wakelegacy or silently mark historical unknowns settled.

## Enrolled targets route ordinary metadata calls automatically — October 17

Previous turn progressed/published2895cd5. Added metadata-controller-index.mjs and
broker_service_enroll_metadata. Explicit enrollment validates existing ready/native
policy/idle target sealedcapability; requests ZERO nativeeffects. Immutable bounded
owned row under metadata-controller-targets/<exacttarget>/<exactcontroller>.json
binds controller session/cwd and exact targetsession/cwd/PID/start. Repeatedsame
entry is idempotent; retarget/conflict refuses without overwriting evidence.
Read only exacttargetdirectory, exactlyone candidate; missing/noenrollment yields
oldroute, but present malformed/ambiguous/stale/unsafeindex refuses beforedispatch.
No workchatcontent scan or implicitenrollment. Controllergeneration renewal may
preserve exacttarget; targetepochchange still requires future controlledrebind.

Public rename_session, pin_session and set_session_config now choose enrolled
controller if metadata_controller omitted. Explicitargument still choosesexact
controller. Existingdurableparent/fieldchildren/targetguard/nativepolicy/aggregate
readback remain; nolegacyfallback for enrolledtarget failures or unsupported
model/mode/via_broker mixing. Calls require driver_submit on independentroute;
direct non-durable wrapper remains a usability consideration. Sevenfocusedtests
cover wholebatch and immutable/idempotentindex, changedepoch refusal, ambiguity,
unsafeentries, staleepoch/nonexistentpeer/movedrecord and explicitchoice nodiscovery.

FINAL HOST c2df416398568b98cb1eb09cb765c3f30737db6a9fff535f4fb6f0d2c87c363e.
CURRENT controller remains7d6d39a0c744462293211e8d9d3b5b3d/SEALEDcb292923,
PID31678/start20:14:51UTC; target74c54e49/PID13591/start20:57:38UTC;
targetreadservice9475...unchanged. Nativecallback/guard unchanged, no extra renewal.
Enrollmentj82df3407f5f841ac87fd3028798d2a14 verified; repeat reusedtrue/nativeeffects0.

Extended EXISTING liveharness with --metadata-config --enrolled-route; separate
metadata-enrolled claimmode. Exact submissions genuinely OMIT metadata_controller.
ActualClaude18checks PASS: harness-native-metadata-enrolled-claude-
2026-10-17T21-33-16-283Z.json, parentj334186c19e28447a8354e3c4db775d10.
Ordinary(no controllerarg) restorejc733bef99e4e48a5b101b112ffe1ffaa verified.
ActualCodexgpt-6-sol18checks PASS: harness-native-metadata-enrolled-codex-
2026-10-17T21-33-55-051Z.json, parentjbabeca753c544d608c67f544c246bb02.
Both changed allthree title/pin/effort, exactderivednativechildren, sameparentreuse,
independentreadback/no-modelturn/unchangedconfig/source/no maintenanceallpass.
Ordinaryfinalrestorej4c5b06b2b2634972b720636667acf12f verified; titlechild
j330cd340c1324d7797996ab16c566b87/pinj64b767d6e6ce49609a8f717b95d28eab/
effortj43e74f59d34f40a39cd8b00dae7a014e. Samekeyreattach sameparent and parentledger/
nativeevidence bytes unchanged. Mixed ordinary title+modelj64ba9f6c78084a4a8a78c54aefe5a721
failedbad_args BEFORErouteledger/child/nativeeffect; didnotfall back. Finalstatus
26settled/0unresolved/27reservedof32. Fixture originaltitle/toolsource/pinnedfalse/
explicitHigh/Haiku5.5/bypass/sameepoch. Privateplan enrolledRouteFinal retainsproof.
Finalresults in testplan reloaded from authoritative jobs after overlapping helper
artifact writes; service parent/child ledgers and nativeevidence are authoritative.
No lost nativeeffect or replay; execute future privateplan helpers sequentially.

Finalpressure v2-2026-10-17T21-33-19-299Z.json1/1/sourceChangedfalse. Bothsynthetic
10checks pass currenthost: harness-v2-claude-2026-10-17T21-32-58-813Z.json and
harness-v2-codex-2026-10-17T21-32-59-913Z.json. AttachedcachedMCP not refreshed by
freshheadless proof. Full originalscope notcomplete; no always-on claim.

NEXT changed-condition step: implement controlled targetepoch rebinding with
retained oldenrollment/history, compare-and-swap/exclusivewriter admission, oldPID
absence and a newly explicitlysealed/currentready controller target. Never delete
index or silently replace authority. Prove stale enrollment refuses, then exact
rebind after owned cold target recovery; this closes a real recovery gap rather
than expanding newcontrollerarguments. Current27/32capacity may justify renewed
controller for nextwork. Then original model/mode/create/messaging/steer/full11live
and sustainedresidency gates. Goalactive/watcherpaused; legacyobserver ownsbroker;
no apprestart/kill/auth/CUA; Codex-driver/1Password separate.

## Real Claude/Codex public mutation MCP contracts passed — October 17

Previous turn progressed/publishedcc8492d. Extended EXISTING native-service-contract,
filtered proxy, harness-native-service and one-shot claims with --metadata-config.
Exact public set_session_config submission only, two identical submissions/same
parent, exactlythree distinct child receipts/derivedIDs/target/service agreement,
independent changed state, unchanged source/global config and no model turns in
controller OR target. Private contract saves baseline/requestedvalues and cursors;
report saves bounded sanitized targetobservation. Claimmode metadata-config is
separate from direct/current reads; duplicateidentity remains refused. No arbitrary
newtools or fallback/permission authority. Eightfocusedcontractchecks pass.

Preserved failure1: first Claude mutation jobj8a1a493e01e047afa62cb9128dcd5d18
DID complete native title/pin/effort changes/allotherchecks. Original report
harness-native-metadata-config-claude-2026-10-17T21-27-47-247Z.json remains FAILED:
bytesRead>0 incorrectly implied modelturn. Bounded131KiBmetadata-only inspection
found no newuser/assistant; native title/agent records appendbytes. Separate
.report.review equivalent file (same basename .review.json) retains retrospective
cursor after lastassistant20:57:41.686Z atoffset1290697,4605bytes/oneattachment/
hasMorefalse, no user/assistant; does NOT rewrite originalreport. New helper
nativeTargetNoModelTurn requires complete bounded observation with onlymetadata;
rejects user/assistant/unknown events and incomplete/malformed observation.

Preserved failure2: while first restoreparentj05c358a32b3143a8aacffa6f3812f31c ran,
source was edited. Runtime guard stopped at before-pinned/runtime_stale AFTER
settledtitlechildjc07f3e2a32b246a0b1305ff5a0e382a9. Pinned submissionkey absent
fromglobaljobindex; effortchild nevercreated; predecessor terminalreview0unknown.
Exact private plan mutationMcpPartialRestoreProof retains knownnoeffect remainder.
Renewalj7d6d39a0c744462293211e8d9d3b5b3d preserved scope and retired oldce...
RemainingONLY pin/effort restoreja6562cf2e343414fa35ce3265ad53e9a passed, no title
replay. Do not repeat this runtime-edit-during-parent mistake. Source froze before
all finaltests/nativecontracts. No uncertain mutation replayed.

FINAL HOST AND SEALED runtime
cb2929231a688e40ca19fa635089cbc2b59134cc2a65e456b59e22063f15c94a.
CURRENT metadata controller7d6d39a0c744462293211e8d9d3b5b3d/PID31678/start
SatOct17 20:14:51UTC; immutabletarget74c54e49/PID13591/start20:57:38UTC.
Targetreadservice9475...unchanged. Corrected actualClaude mutation report
harness-native-metadata-config-claude-2026-10-17T21-29-53-578Z.json PASS18checks,
parentjef24a93b531f47ba979254b713827387, titlej805a43525bb7429385a180b864ca079c/
pinj6ef4c9b6ef524526ba9b511d1da6c07f/effortjc0d97560df764b1186b02bcf04f40cd2.
Claude restorejae80e2302e0e475284d677cfbc598ed5 passed before Codextest.
ActualCodexgpt-6-sol mutation report harness-native-metadata-config-codex-
2026-10-17T21-30-32-218Z.json PASS18checks, parentjc3dca62a6c7145738cc410e62786c753,
titlej2a29bfa166d344a2b3405c675564b957/pinj645cf273ede249fcb667ceb114efb5f9/
effortje75796c3f10a41dca71c967b00ac8fd0. BOTH actually changed allthree baseline
values; not no-opreadproof. Finalrestorej2dc73e1aff9d4daeb6fe47c50560ae21 passed.
Samekeyreattach reusedsameparent; parentledger/nativeevidence bytes unchanged.
Finalstatus14settled/0unresolved/15reservedof32, actualready/nativepolicy. Fixture
originaltitle/toolsource/pinnedfalse/explicitHigh/Haiku5.5/bypass/exactepoch.
Initial absenttitleSource/effort baseline is historical, not byteidentically restored.
Private authoritative plan metadataControlTrial.mutationMcpFinal retains reports,
exactchildren/status/restorationdigest. No apprestart/kill/auth/CUA/unknownreplay.

Finalpressure v2-2026-10-17T21-29-36-223Z.json1/1/sourceChangedfalse. Bothsynthetic
10checks finalsource: harness-v2-claude-2026-10-17T21-29-14-903Z.json and
harness-v2-codex-2026-10-17T21-29-16-045Z.json. Earlier21:28pressure/21:27synthetic
reports are old verifier source; retain distinctions. Generalpublic mutation MCP
qualification NOW proven only explicit enrolledcontroller route on owned target.
Attached oldMCP not refreshed merely by fresh harness success.

NEXT: remove explicit-controller burden for already-enrolled targets through a
bounded deterministic enrollment/selection index, preserving exact capability,
ambiguity/stale/unknown refusal and no legacy recovery fallback. Do not scan work
chat content or silently enroll arbitrarytargets. Then remaining originalcreate/
model/mode/messaging/steer/full11live/residency gates. Do not equate this scoped
pilot with full always-onqualification. Goalactive/watcherpaused; legacyobserver
ownsbroker; Codex-driver fixes/1Password separate.

## Public title/pin/effort routing and durable batches passed — October 17

Previous turn progressed/published7682952. Added explicit metadata_controller to
rename_session, pin_session and set_session_config. Exact controller sessionID
selects stable current generation; only title/pin/effort supported, no model/mode/
via_broker mixing or legacy fallback. Requires durable parentjob, enough capacity/
deadline for wholebatch, actualready/nativepolicy/configured exacttarget. Controller
selection and idle target epoch rechecked between fields. Existing public recipient
control lock spans the parent. Native independent controls still use per-effect
locks: batch is sequential/partially applicable, NOT atomic multi-field transaction.

New metadata-config-route.mjs records wx parentledger, exact per-field durable
submissions/jobs/observations, before/after boundaries, independently verified
receipts and final aggregate disk check. Unknown/failure/cancellation stops later
fields; no replay or automatic rollback. Old public path without controller unchanged.
Synthetic4checks cover validationbeforeeffect, mixedauthority refusal, epoch/capacity
refusal, partial unknown child stopping laterfields and ordered aggregateverification.

FINAL HOST source3be2007ccca886c42c851a92420d795d164e7d0b864f4050bb09771dd87a70aa;
controller STILL ce93557aae974cfcb10b12b6ef70c35c/sealedb33501f6/PID31678/start
20:14:51UTC, target74c54e49/PID13591/start20:57:38UTC. Nativeguard/callback unchanged,
no unnecessary renewal. Public config change je8761f7f02ec4d47b937cc662a55a853:
locked probe title, pinnedtrue, low effort; title/pin/effort separatechildren all
metadataVerified. Public restore je964aa27bcc741059b16bd950cfcf0bd restores original
fixture. Mixed title+model je1e8caae254f444383db8192aaf839ad failedbad_args BEFORE
routeledger/children (no native effects). Public standalone rename
jeff1869de8874e52bf7c2402f5ddbfe8/titlechildj1e954641cbe34aa9bdce3547020e184b;
pin jf59ef20d7f3b449fada12549d22e195c/pinchildj0985b0b9c51446e8b5cab6a72a235d41;
both actual statechanges verified. Final public restore j88abf4e0b0b64c3686bea0e1a4b3f800
children titlejda9ec5e52f9f4b84a5d8f625e9b78557/pinj1c1338297367417daa1a4bb68d99de9f/
effortjdbdfdbe2db39402783448da34107c360. Same-key reattach reused parent, parentledger
AND send/admission/postcondition evidence digest unchanged. Finalstatus15settled/
0unresolved/16reservedof32. Fixture originaltitle/toolsource/pinnedfalse/explicitHigh/
Haiku5.5/bypass, exact nativeepoch. Initial pretest absenttitleSource/effort not restored.
Private authoritative plan metadataControlTrial.publicRouteFinal retains proof.

Final fullpressure v2-2026-10-17T21-25-35-430Z.json1/1/sourceChangedfalse.
Synthetic10checks each currentHOST: harness-v2-claude-2026-10-17T21-25-09-926Z.json
and harness-v2-codex-2026-10-17T21-25-10-997Z.json (configuredgpt-6-sol).
Public native mutation qualification is CLI/sharedop route, NOT actual mutation MCP
harness proof. Prior finalb335 actualread MCP harnesses retain historical scope.

NEXT changed-condition step: extend EXISTING filtered native-service-contract and
harness-native-service with explicit exact public metadata batch mode (separate
one-shot claim identity), qualify fresh Claude AND Codex MCP mutations with
per-field receipts/derivedchildIDs/unchangedconfig/no-modelturn, bounded state
readback/restoration. Reuse proxy/filter/idempotency, no unrestricted tools.
Then remaining default-route usability and original fullcreate/messaging/steer/
11live gates; do not equate explicit controller pilot with full originalcompletion.
Goalactive/watcherpaused; legacyobserver owns broker; no apprestart/kill/auth/CUA;
Codexdriver/1Password separate.

## Native metadata target admission implemented and verified — October 17

Previous turn made progress (published7c105c8). This turn closes preflight-to-hook
identity gap: new nativeMetadataTargetVersion1 manifest/pointer/policy capability;
policy configuration target equals request nativeMetadataTargetBinding, bounded
owned live peer identity and actual ps PID/start at PreToolUse. Exact original
target must still be idle in2.1.299; no spare/parked/self/foreign invocation.
Admission retains metadataTarget observedAt; historical settlement for new pointer
requires exact binding and observation, as well as immutable disk postcondition.
Old metadata history remains reviewable; new writes on old controller refuse
before publication. No change to generic TierB routing or native permissions.
This is admission-time observation, NOT atomic native API epoch preconditioning:
app tool accepts only sessionID; restart after hook return can invalidate
post-effect verification. Do not overclaim atomic fencing.

Preserved old-release negative je17d73a2565c4c16a3e7e3ce54d9c752: failed retrySafe,
no request/control/intent/send/admission, reservedslots11unchanged. First boundary
renewalj459a230bbc9e446781e01181327ee35a on sourcebeda7b10 passed pin/restore and
nativeClaude metadata harness. Review then tightened policy-configured target
comparison; final renewaljce93557aae974cfcb10b12b6ef70c35c preserved same target
and native controller epoch, retired predecessor safely, actualready/nativepolicy.
CURRENT metadata controller ce93557aae974cfcb10b12b6ef70c35c, PID31678/start
SatOct17 20:14:51UTC, target74c54e49/PID13591/start20:57:38UTC. Target read service
9475c62da7bc44538b7a666d2dcedad5 remains unchanged. No archive capability granted.

FINAL host AND sealed source
b33501f6f606cd2fe931dcef825f226d8e127d8bddc6f35a76dd6a54fcb3b390.
Native pinon jbe75ac6a9147442aa7264f366c3cf52c/toolu_plugin_16bff6901d994123943410963f713701;
restore j16948b21846748acafa56e4c0244060b/toolu_plugin_aa84ec4bcee6492291810163b3e83775.
Both metadataVerified and independent admission exacttarget checked. Restored
pinnedfalse/originaltitle/toolsource/explicitHigh/bypass/Haiku5.5, same targetepoch.
Same-key restore reattach reused samejob, send/admission/postcondition evidence
hash unchanged. Final status4settled/0unresolved/5reservedof32, ready/nativepolicy.
Private plan metadataControlTrial.targetBoundaryFinal retains selected exact
request/policy/admission and finalstatus; no tokens copied to docs or memory.

Focused15tests pass, including actual command-hook synthetic regression for
mutually stale policy/request/peer versus real ps; no live target restart injected.
Final full pressure v2-2026-10-17T21-23-20-310Z.json1/1/sourceChangedfalse includes
final regressiontest hashes. Earlier21:22:41pressure passed before strengthened
stale-fixture assertion. Synthetic10checks each finalsource: Claude21:22:16.127 /
Codexgpt-6-sol21:22:17.553. Both actual real-MCP current-route metadata harnesses
14checks each pass on finalcontroller/source: harness-native-current-claude-
2026-10-17T21-22-59-365Z.json and harness-native-current-codex-
2026-10-17T21-23-21-448Z.json. These are metadata READ MCP contracts; pin controls
were durable CLI/native tests, not direct MCP mutation harness qualification.

NEXT: general public metadata routing (title/pin/effort) through explicitly enrolled
qualified controller, then durable batch/concurrency and current native/MCP
verification. Preserve no-match/ambiguous/stale/unknown refusal; no silent legacy
recovery. Full creation/messaging/steer/original11live gates remain incomplete.
Goal active; watcher paused; no broker/globalapprestart/auth/CUA/sessionkills;
legacy observer owns its broker, Codex-driver fixes/1Password remain separate.

## Scoped metadata controls qualified experimentally — October 17

Added explicit sealed `metadataTarget`, separate from and mutually exclusive with
`archiveTarget`. Durable `broker_service_control` supports only title lock, pin
and effort through exact native tools. General rename/config routing is unchanged.
Host preflight requires an owned idle bypass scratch with exact PID/start, no PR
or worktree; unresolved prior attempts block new controls. Independent immutable
postcondition snapshots bind request, original target epoch and native receipt hash.
A later restoration does not erase successful historical settlement.

Native controller65343f043f7141fe8a1563188445931b runs sealed99c110086b0b5e682b7163c71b88f830c51c329f4fb474ba0ae42640927badae,
PID31678/start20:14:51UTC. Explicit target74c54e49-972e-4dac-adfa-d23e01316119
PID13591/start20:57:38UTC. Pin on/off, explicit High effort setup, concurrent
three-field change and concurrent restoration passed with separate native receipts
and persisted readback (change4697ms, restore4653ms). Native metadata read also
passed. Final status10settled/0unresolved, actualready/nativepolicy,11/32slots.
Same-key pin-restoration resubmission reused jfa83d0ed3f9e4e7d881b1555c697a2be;
retained send/admission/postcondition evidence digest unchanged. Original title text
and unpinned restored, effort explicitly High, titleSource tool, bypass/model
unchanged. Original record lacked effort/titleSource: NOT byte-identical restoration.
User screenshot check-1.png shows correct scratch trust prompt; user accepted it,
and current exact live idle process verifies the resulting state.

Preserved failure: first pin jb5936c03e1dc4d76929be049b28afb46 refused BEFORE
publication because private service namespace hid parent registry. Fixed by explicit
parent registry root, bounded owned nofollow read and subprocess regression; no
native request replay. Renewed safely from be7... to653... before new test. Archive
role negative j1635739f0c4e4981b3e0b65b248ebef1 refused before publication.

Final HOST source9aa31b3b9cd5876d2fcc4a1dbeb304dd3c728c0b7e9cec5eec3aff31880536b2
adds unresolved-predecessor host gate after sealed99 native trial. Focused34tests
pass. Full pressure v2-2026-10-17T21-15-01-363Z.json1/1/sourceChangedfalse;
synthetic Claude/Codex10checks each21:14:41/42 reports. Native trial is scoped
control proof, NOT fresh real-MCP native harness proof for host9aa or full live11gates.
Private authoritative plan: probe/scratch-native-read-2026-10-17/
empty-receiver-activation.json metadataControlTrial (contains private enrollment;
read only bounded selected fields). Earlier requirements audit remains historical.

NEXT changed-condition step: add exact metadata-target epoch validation at native
PreToolUse effect boundary, with new sealed capability/version and explicit renewal.
Current checks are host before dispatch and post-effect observation; they do NOT
atomically fence a user/app target restart between those points. Keep route
experimental; do not claim stronger fencing. Then qualify current native positive/
negative admission, batch/public generalroute. Full create/steer/live11gates remain.
No unresolved metadata effects; current controller finite deadline/remainingbudget,
not unattended always-on proof. Legacy observer owns recovery; watcher paused;
Codex-driver/1Password separate. Goal active.

## Requirements audit refreshed; rename lock verification corrected — October 17

Completed original-scope audit against brief.md, README, live-v2.mjs, current
source, structured native/synthetic reports, current owned receiver and actual
legacy broker metadata. Four harness registrations canonicalize to exact repo
launcher; actual attachedMCPdriver46c7a58 still restartRequiredtrue (cached
fingerprint implementation differs, do not compare its reported source hash
with current runtime). Legacy brokerPID79060/startOct16 14:54:25UTC is live/idle
but residentfalse; pinned4af08654/gen6 integritytrue/dependencyPathsObservedfalse.
No legacy repair, wake, source swap, apprestart, authentication or unknown-effect
settlement attempted. Last root449/22unknown audit is HISTORICAL, not refreshed.

Audit exposed concrete rename_session postcondition defect: matching title text
alone could claim lockedtitle without titleSourcetool. Predicate now requiresboth,
consistent with configurationbatch, and mismatch error is fixed/sanitized. Native
rename remains unqualified while generic Tier B is non-serving; do not claim
that passing isolated checks proves it applied in Claude. No new trivial tests;
existing archived-config2checks and full pressure validate unchanged boundaries.

FINAL runtime836da735605c43cd169b9e1bc4b3cf1cf84759a111f2abf935c8348a2499a533.
Pressurev2-2026-10-17T21-02-03-894Z.json1/1 passes122 testfiles; all recorded suite
hashes independently match. Synthetic harnesses10checks each: Claude
harness-v2-claude-2026-10-17T21-01-40-101Z.json / Codexgpt-6-sol
harness-v2-codex-2026-10-17T21-01-41-314Z.json. Fresh same-epoch native renewal
j9475c62da7bc44538b7a666d2dcedad5 succeeded; CURRENT interrupt receiver
9475c62da7bc44538b7a666d2dcedad5, PID13591/start20:57:38UTC, actualready/policy/
no unresolved. Both actual real-MCP metadata harnesses pass14checks on thissource:
harness-native-current-claude-2026-10-17T21-02-21-577Z.json and
harness-native-current-codex-2026-10-17T21-02-22-701Z.json. Prior89e9...generation
retired safely. Controller remains94e5d3705e334fc4aa277698cc3b252f/PID31678/
start20:14:51UTC, sealed OLDtarget5972, cannot silently retarget current13591.
Plan requirementsAuditRenewal retains exact durable renewal; final audit private
artifact diagnostics/v2-requirements-audit-2026-10-17.json records14requirements,
all11 original live gates,63operation layer, five hashed current reports, canonical
registrations and observed receiver/broker. overallQualifiedfalse. Its private
run script initially had wrong repo-relative test hash root; corrected without
changing source/tests or weakening hash check; audit then passed evidence review.

README now starts with current actual qualification and preserves all old legacy/
input-incident notes under historical details. v2-qualification.md has current14row
matrix and all original11gates; older October15matrix explicitly historical. Guide
serves current scope. Direct nativequeue/concurrency Oct15 source4262 and single
nativeStop/replacement Oct17 sourceee81 inspected from structured verifications;
kept historical. latest live-v2 full/control reports are October7, not current.
Original createbranch requests acceptEdits and needs reconciliation with Taylor's
required bypass preference before rerun; old legacy broker cannot serve suite.

NEXT: address the substantive original-interface gap, rather than more recovery
cycles. Extend qualified independent controller with EXPLICIT sealed target-bound
metadata-control capability (title/pin/effort initially), exact native admission,
immutable persisted postcondition receipts and restoration. Existing archiveTarget
capability must not silently gain arbitrary mutations. Qualify current positive/
negative nativecontrols, batch/concurrency then public generalroute; creation and
full steer/live11gates remain later. Do not awaken/repair legacybroker owned by
observer, replayunknowncontrolscratch, changehumanpermissions/auth or useCUA.
Watcherpaused, goalactive; Codex bridge fixes/1Password separate.

## Default cold recovery natively passed; live target refused before children — October 17

No code changes/sourceb1a2fdd466d7e85f6aaedce78df836a5a853e722ffe00a6dad650ec598536f0e.
Fresh explicit controller preparationj94e5d3705e334fc4aa277698cc3b252f sealed
interrupt targetPID5972/start20:54:10UTC. Previousad2...controller quiesce/retire
retained; new94e5d3705e334fc4aa277698cc3b252f activatedj59aa0e4a250d4708ac244e9e537be3e1,
ready/policyj94efea2eeb9f410db967cbfb29145edc samecontrollerPID31678/start20:14:51UTC.
CURRENT transport service94e5d3705e334fc4aa277698cc3b252f.
Target native familyj19b3a7e207684c589fd65f739893b2a0 verified empty; noPR/worktree/pin.

DEFAULT cold mode LIVE NEGATIVE parentj62a817cf463040a59789352f3724f8d3 failed
before-preflight with ZERO childjobs. Independently checked target exactPID5972/
startidle/readiness/admission unchanged/no unresolved, no effects. Negative
remains failed, not a recovery success. Private plan coldRecoverySetup.liveNegativeProof.

Scoped absent state setup, not a simulated unexplained crash: targetc3f1...quiesce
ja72bad91177f4f2ead8de83b9ec262d0, retirej399be247f5b447d4861083524f40d289,
archivejbff3ccb3b1304e6baf7f867fcd77895f. Independent persistedarchivedtrue,
originalPID5972absent/nopeer; archive receipttoolu_plugin_aebaca85def249fd85a15cf39f9a61eb.
Then ONE default cold parentj5ddbe0de55cd40d7be83d1e20a4588e9 completed14.222seconds,
24 before/after steps, EXACTLY SIX children: unarchiveje063573a73704474944d42f7b9d98365,
wakej076490d7efbe47e88ca1f9825731f17c, preparej89e9be8ae5f24d71bb8e2f7b900b668d,
activatej93f5ae9fe59d454ead7110198ac88ab9, policyj0cee73ffbd5d4db88f8bc6a744bf2fa4,
readjd13b3ceb7c57400d911d75ff0fe48b52. NO family/quiesce/retire/archive repeated;
retired STOP/history preserved. No human input. NewPID13591/startSatOct17 20:57:38UTC,
fixedreply/zero tools lineage, actualready/policy/native read, identical stable
anchor/settings/no unresolved verified. CURRENT interrupt service
89e9be8ae5f24d71bb8e2f7b900b668d. Same saved request resubmission reused sameparent
and recovery ledger bytes unchanged/no effect replay.

Both actual real-MCP current-route harnesses on recovered89e9...passed14checks:
harness-native-current-claude-2026-10-17T20-58-00-053Z.json and
harness-native-current-codex-2026-10-17T20-58-01-251Z.json (configuredgpt-6-sol).
Exacttwo submissions/sameparent/derivedrequest/native receipt/no modelturn/no
maintenance/source/globalconfig unchanged all pass. Existing coldRecoverySetup
plan retains requests/results/negativechecks/fullrecoveryledger/finalstatus/harnesses.
No synthetic reruns: source/tests unchanged from prior passing full pressure.

Qualification: default cold entry from already-retired absent target is now
NATIVELY proven once; cycle mode separately proven. Offline-INSTALLED native
failure recovery still only synthetic, not proved by intentionally retired archive.
Unplanned crash/globalapprestart/deleted-session/unattendedsupervision not claimed.
Controller remains sealed to OLD5972, not current13591; current live capability
cannot silently retarget. Human workspace trust persisted across this trial.

NEXT before adding more mechanisms: refresh requirement-by-requirement V2 audit
against docs/brief.md, README.md, live-v2.mjs and the old matrix in
v2-qualification.md (Latest audit Oct15/source702a is HISTORICAL and outdated).
Map each original requirement to actual current source/native/filter evidence;
preserve remaining eleven live-v2 gate scope and later steering/control evidence.
Do not substitute repeated recovery cycles for full interface qualification, or
invent unattended supervision as sole completion scope. Use that audit to choose
remaining concrete implementation/native check. No broadapprestart while legacy
observer owns broker; no CUA/keyboard/auth/permissions/sessionkill. Watcherpaused,
goalactive, Codex bridge fixes/1Password separate.

## Public durable recovery cycle passed; final self guard tested — October 17

Added broker_service_recover in independent-service-recovery.mjs. One durable
parent composes existing child primitives with exclusive per-target recovery lock,
wx parent intent, fixed idempotency keys, before/after steps and retained child
observations. Default cold mode requires originalPIDabsent/nopeer and retained
empty family receipt; can quiesce/retire offline installed source or preserve
already-retired terminal history. Explicit cycle:true intentionally archives a
healthy owned scratch after fresh emptyfamily/terminal review. Controller stays
sealed to exact target epoch, no retarget. Native wake/refusal, newepoch, bounded
postcursor fixedreply/zero-tools lineage, prepare/coldactivate/ready/policy/read,
then stable anchor/settings/no-unresolved checks. No kill/restart/delete/permission
raise/trust bypass. Failed/unknown child stops; reattachment observes original
parent and never restarts children. Self-target caller rejected before filesystem.
Rejected reply observation retained bounded in private recovery ledger.

NATIVE public cycle tested on source
7b73bc8c443ab6b20927fe89a91ebda050b049d5ea8bcb84f41827a80c5bf773.
New controller preparationjad2fe72095f04e99b033168c16c54e02 sealed oldtarget96997/
20:49:14UTC. Old9a2... quiesce/retire retained; newcontrollerad2fe72095f04e99b033168c16c54e02
activated j2b48053132a047409317994894bc82ac; policyj0254b4b4368643b1bddf8e54db86c780.
CURRENT controller ad2fe72095f04e99b033168c16c54e02/PID31678/start20:14:51UTC.

ONE public parentj679872e6af884635a622e3695289c9fd completed in20.864seconds with
32 before/after checkpoints and10 completed childjobs, no manual interleaving:
familyj78da393c565b4c3eb15d5f30ba2d6fe2, quiescej7d003224a9354f0bb8f258ac8c31a548,
retirej3646fa408b464f5c8ce7a19b1b3c606c, archivejacc845037df94d5a99d16f875bde1d3d,
unarchivejdd8cef3ac5cc4f4c93571c5ff0f8c507, wakej1f04b4262d594569b0dafc40cfc8db15,
preparejc3f1c806560b4a64854958254bae69a5, activatej222821af746f4129ac7741ba54f24a72,
policyjca895974e8534e149e7806feaebeb1e8, readj1601384df6f840a099de48b734e968d1.
Actual native archive receipttoolu_plugin_3fd0790e8182461dbb12376be397c1f1;
wake receipttoolu_plugin_53f138d29fea4bcf962218895f276b71. NewPID5972/start
SatOct17 20:54:10UTC/correctcwd. Persistedreplyea9fa0e6-6f9c-4aab-ad0d-059ea2f44a8e
COLD_RECEIVER_READY/tools0 with postcursor lineage; no human input. New service
c3f1c806560b4a64854958254bae69a5 (CURRENT interrupt receiver), actual ready/policy
and readreceipttoolu_plugin_3c1c22535adb44aba63afa988124f8d8. Final anchor/settings
preserved/no unresolved. Parent returned nativeColdRecoveryQualifiedtrue and
unattendedSupervisionQualifiedfalse. TWO actual resubmissions same saved request
reused SAME parent, recovery ledger bytes unchanged/no child replay.

Both fresh real-MCP current-route harnesses on recoveredc3f1... passed14checks:
harness-native-current-claude-2026-10-17T20-54-38-295Z.json and
harness-native-current-codex-2026-10-17T20-54-39-452Z.json (configuredgpt-6-sol).
Native cycle/harness proof is source7b73...; subsequent self-call refusal and
rejected-reply-observation retention hardened host code without altering native
callback. FINAL sourceb1a2fdd466d7e85f6aaedce78df836a5a853e722ffe00a6dad650ec598536f0e.
Final focused7tests, pressurev2-2026-10-17T20-55-32-595Z.json1/1 unchanged source,
and both headless synthetic harnesses10/10:
harness-v2-claude-2026-10-17T20-55-14-536Z.json,
harness-v2-codex-2026-10-17T20-55-15-662Z.json. Self guard actual env-bound negative
case refuses before any state access. Installed receivers remain sealedsource7b73.
Existing private plan orchestratedRecoverySetup and global
independent-service-recoveries/j679872e6af884635a622e3695289c9fd.json retain full evidence.

Next: qualify DEFAULT cold entry natively (currently pure-mode tests only), using
an exact freshly sealed controller and retained emptyfamily/stoppedretired target
whose originalPID is independently absent. An intentional scoped archive can
establish this absent state without killing a process; then one public cold mode
parent should skip family/archive and preserve oldSTOP/history. Do not claim crash
or offline-installed success from cycle mode. After that, integrate bounded
supervision/read-route recovery with explicit inventory/selection and status;
current controller capability is sealed to OLD96997, not current5972. Never
silently retarget it. Unknown historical control-scratch attempt remains parked.
Goalactive; watcherpaused; no legacybroker/globalapprestart/CUA/keyboard/auth changes;
Codex bridge fixes and1Password separate.

## Second native cycle: persisted trust, one wake, new peer and cold rebind passed — October 17

No runtime edits; source remains92d850ec257d5a4b7dea24fca3e89c2b5a26a3e1dd28726ace7248a4754a977a.
Revalidated both live idle receivers/readiness/no unresolved. Explicit NEW controller
preparation j9a2d9461af6e43d6878826b8e205b33c sealed current target interruptPID89369/
start20:45:45UTC (no silent retarget). Prior transportde125... quiescedjc42c211f7ee746c396e51563599a121d,
retiredjb1501766cefd41a2b8badb3e4a64ed5d. Controller activationjf089b6847fdf431eae22253cc0474dc7,
actualready/policyjaa80079e34464f8a918fda90e7799683 verified samePID31678/start20:14:51UTC.
CURRENT transport controller service9a2d9461af6e43d6878826b8e205b33c.

Target native familyj1edf9c5944d24041adcabd77fa20d389 independently parsed0members;
record unpinned/noPR/noWorktree/bypass. Targeta371... quiescej787125c474814cb8810f3d199d186f23,
retirejdcceb2e61826466fbed232f95043fb06 completed five terminal attempts/no unresolved.
Native archivej1da8c4b6f8e64f4f8dcaa9a70f95ca6b verified actual persistedarchive and
PID89369absence, receipttoolu_plugin_a2e2d24ddb1c4fbd98fd1f21a1786ff1. Intentional
archive, not crash/governor. Unarchivej97f4ab5dd8de438fb67cbfba4999b12f restoredrecord/
focus; independent targetpeerabsent/oldPIDabsent before wake. No open/retry needed.

ONE native wakej2bbc05a3fe764356965771925aae333b completed receipt
toolu_plugin_2b48a481e0b74a3d9b59aa56864ec702, native delivery:delivered/message_id
c7e93f62-2836-4193-813a-62f1657a996b. No human step this cycle. New nativePID96997/
startSatOct17 20:49:14UTC observed busy thenidle. Pre-captured cursor independently
observed userUUIDe2199bc9-fc94-4094-bb0a-87ee0f307b34, exact hostInjected peer origin
from transportcontroller, followed by metadata-only ancestors and assistant
b6638cc4-fb80-4f90-bdf4-de280feb9c4a/end_turn/COLD_RECEIVER_READY/tools0.
Journal lacks native message_id (do not claim exact message-ID match); exact
post-cursor origin/time/known fixed reply and lineage retained. Native receipt
alone remains distinct from this independent applied reply/process evidence.

Preparedj6195ac63602d49d3a32d70804b1554df; coldactivationj30a270aa10cc47418a5d3814a6e9a732
retained olda371...selector and absentPID89369, installed onPID96997. Actualready,
identical stable anchor/settingshashes, policyj15cd161035084e5c8b2c807834848a99 and
native readj21f32c3e459c444c8b982cc0c0c32a76 passed; receipt
toolu_plugin_aefc9e7efbd44973a2fda1f056513238, no unresolved. CURRENT interrupt
service6195ac63602d49d3a32d70804b1554df. Transport9a2... remains sealed to OLD89369:
cannot dispatch archive/wake to newer epoch without explicit fresh preparation.

Actual real-MCP current-route harnesses BOTH pass14checks on recovered6195...:
harness-native-current-claude-2026-10-17T20-50-06-029Z.json and
harness-native-current-codex-2026-10-17T20-50-07-175Z.json (configuredgpt-6-sol).
Source/globalconfig unchanged, exacttwo submissions/sameparent/derivedread/native
receipt/no modelturn/no maintenance all verified. No further synthetic repeats
because runtime/tests unchanged and last pressure passed. Private existing plan
secondNativeCycle retains every request/job/result/cursor/receipt/epoch/hash/harness;
local cycle-two.mjs helper only submits/re-attaches exact persisted child identities.
No legacyrestart/CUA/keyboard/quarantine/auth/permission edits.

This proves ONE complete post-trust intentional archive→exit→unarchive→nativewake
→fixedreply→coldrebind→real-MCP read cycle without human intervention. The first
cycle needed human trust. Not a crash/app-restart/deleted-session or unattended
supervisor proof. Next promote the tested coordinated sequence into a bounded
durable service-level recovery operation with before/after child checkpoints,
original identity reattachment and explicit failure/unknown handling. Existing
current-route handles read/renew/probe but not this cold lifecycle. Avoid endless
manual proof cycles or broad app restart while legacyobserver owns legacybroker.
Goalactive; watcherpaused; Codex bridge fixes/1Password separate.

## Actual cold rebind qualified after human workspace trust — October 17

Taylor typed ready in existing interrupt scratch; native workspace trust appeared
for the exact probe folder and Taylor accepted. Read /Users/taylor/Desktop/check-1.png:
exact Trust this workspace? dialog/path, distinct from bypass/hot-reload. Independent
new peer PID89369/startSatOct17 20:45:45UTC/CLI2.1.299/correctcwd/idle confirmed.
No duplicate wake was sent; prior explicit undelivered native failure remains.

Prepared ja371fdf5cddd46bea27ce236abf1f2e5, activated cold_rebind/stable_hook via
j808eeb22c8b843bb8c8488708e7fb826. CURRENT interrupt service:
a371fdf5cddd46bea27ce236abf1f2e5, source92d850ec257d5a4b7dea24fca3e89c2b5a26a3e1dd28726ace7248a4754a977a.
Actual activation ledger records retired6ab7657958214ec59f5b73dd52387b8e,
oldPID20499/start15:48:23UTC absent, newPID89369/start20:45:45UTC; oldselector
retained. Independently compared old/current policy anchor/settings hashes: BOTH
identical. Actual new-generation readiness observed without another consent card.
Native negative policy probej66217031d77c409eb93644795adea0bf passed; positive
readj98fa1d07daab44e4b4b95d1e7699c69f settled actual native receipt
toolu_plugin_465f04d2e0104565ab2a427a710ccbfe.
No unresolved attempts. Plan trustedColdPreparation/Activation/PolicyProbe/
PositiveRead/Verification retain durable jobs/epoch/ledger/hash comparisons.

Actual fresh real-MCP current-route harnesses BOTH pass14checks on recovered
interrupt service, sourceunchanged/globalconfigunchanged/no modelturn/no maintenance:
harness-native-current-claude-2026-10-17T20-47-00-764Z.json and
harness-native-current-codex-2026-10-17T20-47-01-919Z.json (configuredgpt-6-sol).
Plan trustedColdHarnesses retains exact parent/readchild/request IDs and checks.
This qualifies actual read admission/service after intentional archive/exit,
human trust startup and coldrebind. It does NOT qualify automatic cold wake,
crash recovery or app restart. Current transport controller still de12578406fc4e4e91913d5865f3cb22
with OLD sealed target PID20499; cannot archive/wake new target epoch with it.

Fixed observed synthetic pressure hang: v2 test worker waits now have5second
startup deadline and reject terminal worker states immediately instead of polling
forever for startedAt. Explicit queued-deadline/terminal/running tests pass; full
v2file46/46. Pressurev2-2026-10-17T20-46-10-203Z.json passed1/1 final tests/source.
Earlier interrupted stale-source pressure failure retained in prior section.

Next changed-condition experiment: SECOND scoped archive/cold-wake cycle after
human trust, to see whether approval persists and native wake now starts target
without another human step. Need a NEW controller preparation explicitly sealed
to current interruptPID89369/start20:45:45UTC (do not silently retarget existing
capability); obtain current target native emptyfamily receipt, preserve current
terminal generation/STOP/retire, use one archive then unarchive then ONE nativewake
identity. Reconcile native reply/newprocess independently, no replay unknowns.
Cold rebind only after exact newepoch observed. This is authorized scratch testing,
no new approval unless native person-only gate appears. Goalactive; watcherpaused;
Codex bridge fixes/1Password separate, legacyobserver owns legacybroker.

## Fixed native wake implemented; workspace trust rejects cold startup — October 17

Implemented broker_service_wake_target using existing durable native transaction,
sealed target, target activation lock, repeated preflight, one-send callback and
native receipt admission. Original PID must be absent and no target peer observed;
target must remain exact unarchived bypass record with stopped/retired terminal
selector and empty native family proof. Only fixed tool-free COLD_RECEIVER_READY
message; no arbitrary text/consent. Receipt never proves applied reply/new process.
Verified native errors settle as failed without replay; malformed/unadmitted ones
stay unresolved. Current host source92d850ec257d5a4b7dea24fca3e89c2b5a26a3e1dd28726ace7248a4754a977a.

Controller renewal jde12578406fc4e4e91913d5865f3cb22 passed native readiness/policy
in same PID31678/start20:14:51UTC. CURRENT transport service:
de12578406fc4e4e91913d5865f3cb22, installed sealed source
07a6cd56d70f73d5ea23c859645165a00f678e568067c300d3cb21edd8bd5562.
Target capability retained exactly; previous a24b9... retired intact.

ONE wake jf278abaa292e45fc9b68795842cb6f2f (request rpeerf278abaa292e45fc9b68795842cb6f2f)
returned native isError:true, explicit delivery:undelivered, message_id
657dbc5e-a25e-4f13-8c31-ec99a73591c0. Error: Workspace requires trust approval
before starting a session. Native tool receipt toolu_plugin_0fb2f38445504df39815f098d12fa611.
Original parent outcome_unknown retained. Independent read-only reconciliation
plus exact receipt publication now statefailed/receiptVerifiedtrue; controller
status independently no unresolved requests. No new wake/replay. Target peer absent.
Plan scopedNativeWake and wakeControllerRenewal retain exact submission/results.

Taylor supplied /Users/taylor/Desktop/check.png. Read image: exact interrupt scratch
selected, bypass visible, historic module notifications, NO trust dialog visible.
Independently current target still unarchived/bypass/exactcwd/peerabsent. Native
installed app source bounded window around error independently confirms fresh
workspace trust assertion on startup; opening record does not invoke prompt.
Source window SHA8e8054d2b4789a19a55cf6793e17ffef8318ae8d57e206ad698db72b2570b16e.
Actual source says saveTrust is native UI route; do not invoke private IPC/write
app trust state or manufacture accepted trust. Human input requested in existing
Claude Desktop interrupt scratch: type ready and Enter, answer native trust prompt
if shown, otherwise report reply/error here. This is first current trust blocker
turn, not blocked threshold. Goal remains active; watcher stays paused.

Final-source pressure v2-2026-10-17T20-43-52-216Z.json passed1/1 unchanged source;
both actual headless synthetic harnesses passed10checks: Claude
harness-v2-claude-2026-10-17T20-43-33-185Z.json and Codexgpt-6-sol
harness-v2-codex-2026-10-17T20-43-34-284Z.json. Focused33tests/nativevalidator passed
before native test; final failure-settlement focused10tests passed. No coldrebind
or serving claim. Earlier superseded first pressure handle8874 hung after source
changed caused runtime_stale worker failures, unbounded wait in v2.test.mjs.
Verified exact own child71130/parent70176/v2test, terminated ONLY synthetic test
child; parent exitedfailed, reportv2-2026-10-17T20-43-54-264Z.json retains failures
and sourceChangedtrue. No native process killed. Original tests have unbounded
worker polling; bound those waits in future to preserve failures promptly.

Next when Taylor responds, observe target peer/events using saved pre-wake cursor;
if exact new epoch exists, independently qualify tool-free reply and coldrebind
retained6ab7657958214ec59f5b73dd52387b8e onto current source. Do not send duplicate
wake if peer exists. If native trust still unapproved, preserve exact gate and
investigate supported visible startup flow, no trust bypass. Keep Codex bridge
fixes/1Password separate, legacy observer owns legacy broker. No approval needed
for routine authorized tests once native human gate is cleared.

## Native controller renewal preserves sealed cold target — October 17

Fixed generic renewal dropping the optional archiveTarget capability. Preparation
now inherits only from a verified installed same-session/same-native-epoch
predecessor with a complete terminal attempt review and no unresolved requests.
Target identity/cwd/original PID/start are copied exactly, never refreshed from a
new peer. Ordinary receivers stay capability-free; new/inherited targets conflict.
Status returns bounded sealed target metadata only. Dispatch gates are unchanged.

Native durable renewal ja24b9aa179c74a7ca9d3a2b527faeed3 completed. Predecessor
515bd99ddc034ed8a1e9c3c34acc4a29 retired; current transport service is
a24b9aa179c74a7ca9d3a2b527faeed3, source
76964799d150bc63d3cf13b3a78c1b4220c6f0f6b13c53ea202471a56cde5dc7.
Same PID31678/start20:14:51UTC, actual readiness and negative policy probe verified,
31 spare slots, no unresolved attempts. Independently inspected successor retains
interrupt74/cwd/PID20499/start15:48:23UTC exactly; target still has no native peer.
No wake, cold activation, restart, consent or permission change performed.
Plan capabilityPreservingRenewal retains submission/job/status and target absence.

Focused checks10/10. Fresh pressure v2-2026-10-17T20-40-22-503Z.json passed1/1
with sourceChangedfalse. Both actual headless synthetic harnesses passed10checks:
harness-v2-claude-2026-10-17T20-38-23-963Z.json and
harness-v2-codex-2026-10-17T20-38-25-126Z.json (configured gpt-6-sol).
These are synthetic-store harness proofs, not native serving. Prior pressure exec
session8874 remains running at checkpoint; it began before a caught error-path
source correction. Poll original handle; never count it as unchanged-source proof,
and preserve its final report/failure. Fresh pressure is authoritative for final code.

Next implement fixed single native wake to the sealed interrupt target, with
independent absent-old-epoch/retired-generation preflight and immutable native
receipt/postcondition settlement; then renew the controller with preserved target,
qualify actual wake/new peer and cold rebind. No duplicate sends or legacy/CUA
fallback. Current controller service above supersedes prior section IDs. Goal
active; watcher paused; Codex bridge fixes and 1Password remain separate.

## Native archive and physical exit verified; reopen has no new native peer — October 17

Taylor completed transport hot-reload input. Exact native loader loaded notification
20:29:59.688Z, same transportPID31678/start20:14:51UTC idle, readinesstrue. No further
native input required. One tool-free boundaryjef1b9d2ef227487dbe4de99ce4b59996 replied
POLICY_BOUNDARY_OK/tools0. Negative policy probej067664c58adc452cb5c776297b2d1493
verified actual policy/helper/refusal with no nativeMCP. Positive read
j4484ac9aa3ac4efb86830156ce5b50d4 settled receipt toolu_plugin_f677d6c9590d4d65b80fe40e4a6d06b7.
Refreshed target familyj921828716a8e4cecbb9d5eb5aebb82d5 settled native receipt
toolu_plugin_6054d6d4482a42ac88420ed914071759; independently parsed0members.

Target interrupt74/service6ab7657958214ec59f5b73dd52387b8e verified bypass/idle,
PID20499/start15:48:23UTC, no worktree or unresolved attempts. Quiesce
jbf92b804c5094cd0b202412325175118 completed with ownedSTOP/terminalreview3attempts.
Retirejc229463b95dd47039b492d7f4b7676a5 preserved full module/settings/STOP.
Scoped archivej9e363c22b9654b3d827385a252c89bb4 then completed with native receipt
toolu_plugin_4fe2a95807fa4988acd4da4974d599ad. Independent persisted archive true,
oldPID20499 absent, no target peer. Postcondition snapshot retained separately;
archive is known intentional operation, not inferred crash/governor eviction.
No exit-code claim. Controller retained native receipt/statecompleted/cleanupfalse.

Unarchivej1071366700c64a24aecf7f40622734fe succeeded via supported deep link with
focusrestore/nothingtorestore. Same target record unarchived/bypass/samecwd, BUT
no native peer. Openj02ee6b525f49459f8baf6699ea92a089 completed navigation with
wait_native_sec20 and native-peer-timeout/verifiedfalse; poll running originaljob
to terminal, no repeated open/restart. Fresh later check still oldPIDabsent and
no new peer. Preserve timeout as failure of native-process qualification, not
failed navigation or a crash. No cold activation attempted without a new epoch.

Controller archive history remains independently settled after target unarchive,
with no unresolved attempts: verifies retained postcondition history semantics.
Existing plan archiveControllerLoaded/PolicyBoundary/PolicyProbe/PositiveRead,
archiveTargetFamilyRefresh/Before/Quiesce/Retire, scopedNativeArchive/Reopen/Open,
archiveHistoryAfterReopen retain exact jobs, receipts and metadata.
Next qualify one fixed native wake via current controller (send_message scope to
same sealed target), independently observe new peer and receipt before coldrebind.
Do not retry native archive, clear targetSTOP, use legacy broker/keyboard/CUA, or
infer serving from reopened record. Platform initially still reported blocked after the native gate cleared; latest
get_goal now independently reports active, so automatic continuation is available.
Watcher paused; Codex fixes and 1Password separate. Fresh real-MCP current-route
harnesses BOTH pass14checks on transport controller, source
73b2d32233a29090bbfb2b30965fc39e8be77cb256bb59a2eff8b4d4fbf913bb:
pressure/harness-native-current-claude-2026-10-17T20-33-51-039Z.json and
pressure/harness-native-current-codex-2026-10-17T20-33-51-037Z.json.
Actual MCP/native receipts, exact two submissions/same parent, derived readchild,
same selected service/no maintenance, no external tools/modelturn/source/config
change all verified. Parentsjcb359f4647544da7b7a19eaf22a1d36a (Claude) and
j1e3dc972b11a4b6aa08859ce567120c0 (configured Codexgpt-6-sol; actual model setting
read before test). Plan harnessNativeAfterArchive retains reports/IDs/checks.
Final live transport idle/verified5slotsused/no unresolved; target peer stillabsent.

Attached cached MCP driver_status read-only recheck still driver46c7a58/runtime
64c8563f7be1cda864fdf4b37d527f35de93ae7f5185dbde6f59b3aca037b480,
restartRequiredtrue (its sourceBuild75ac4e... uses cached build implementation).
Fresh harness qualification does NOT refresh this attached binding. No writes
through cached MCP; refresh/Codex changes remain separate. Native human gate is
resolved; latest platform get_goal reports active. Actual cold-start wake/rebind
is next, not another approval request.

## Native hot-reload gate revalidated; goal blocked pending human input — October 17

After controller implementation and target-race fix, same person-only native input
gate persisted across three consecutive goal turns. Rechecked exact transport
PID31678/start20:14:51UTC: waiting/nativeInputRequiredtrue/readinessfalse,0slots.
Consumed remaining metadata event after prior cursor; bounded inspection identified
it as unrelated automatic ios-agent Stop-hook cleanup, not loader readiness/consent.
Then performed20second session_wait on updated exact cursor: no events, status still
waiting,0bytes. No resend, native request/probe/archive, target STOP/retirement,
permissions change or process action. Existing work is published and synthetic
checks passed; next actual recovery step cannot run until native loading qualifies.

Required human action remains in Claude Desktop's EXISTING
claude-driver-transport-scratch-2026-10-15: if Enable hot reloading for this session?
is shown, choose Enable for this session and Submit; otherwise report exact wording
in this Codex chat. Then use this goal's Play/Resume if still blocked. No tool can
answer the person-only consent or resume the platform goal automatically. Do not
resume watcher, repeat prompt messages or try keyboard/CUA/auth/permission workarounds.
Existing async question stays pending. Plan archiveControllerBlockedAudit preserves
the exact state/cursor/wait and next changed-condition step. Goal must remain
incomplete; blocked status stops unchanged automatic continuation, not user replies.
On resume recheck live epoch/deadline/source, loading/readiness, refresh policy
boundary only if necessary, negative probe/positive read, then scoped target
STOP/retire/archive, independent exit/reopen/coldrebind/read. Preserve all old unknowns.

## Archive target generation race closed before native dispatch — October 17

Audit found historical retired target status could remain valid after same-process
successor installation. Added parent-held target global independent-activation lock
through controller worker and postcondition observation (same key as activation/
retirement), plus exact current target selector/pointer match to retired generation,
build and sealed PID/start. Target must still be bypass/idle and scoped. Pure
preflight rejects stale history with new selector, generation, epoch or mode.
Actual lock integration test holds activation lock, verifies archive queues while
unrelated target runs, cancels queued work without worker admission, then permits
one remaining worker after release. No native archive or target mutation performed.

Nine focused tests pass. Final frozen-source pressure1/1passes:
pressure/v2-2026-10-17T20-22-19-767Z.json. Filtered synthetic-store harnesses each
10checks pass: pressure/harness-v2-{claude,codex}-2026-10-17T20-22-01-104Z.json.
These qualify host race controls, not native lifecycle/recovery. Installed controller
remains source81a56... (unchanged callback); current host adds admission guards.
Rechecked exact transportPID31678/start20:14:51UTC still waiting,
nativeInputRequiredtrue/readinessfalse/0slots. Existing asynchronous request for
human hot-reload response remains pending; do not repeat sends or fabricate input.
Plan archiveGenerationRaceReview records finding/fix and gate. Next actual loader
readiness/policy/read then target STOP/retire/archive/reopen/coldrebind/read as below.

## Sealed archive controller installed; transport hot-reload input pending — October 17

Taylor completed transport bypass+ready. Independently verified exact existing
transportc0a18601-5a57-44d0-94ac-2fed3719e7ca/PID31678/start20:14:51UTC,
idle2.1.299/bypass, no existing receiver module or settings. Existing chat reused;
native start-session alternative deferred, no new chat created.

Implemented optional prepare archive_target: seal exact distinct owned idle bypass
scratch target cwd/PID/start into generation. Candidate only accepts fixed native
archive_session args for that target; rejects self/other target/reason/_consent.
Public durable broker_service_archive additionally requires target already stopped/
files-retired with terminal history, no worktree/pin/openPR, exact live old epoch,
and settled empty native caller-family receipt. Ordinary controller permission
pipeline still owns native admission. Settlement requires archived disk state,
oldPID absence/no observed same-host peer plus native callback/admission; immutable
postcondition observation retained separately for historical attempt review after
target reopens. Transport success/error alone stays unresolved; no deletion/replay.

28focused tests pass incl bound target, native callback/refusal and postcondition
corruption. Full frozen-source pressure1/1passes:
pressure/v2-2026-10-17T20-17-56-179Z.json. Filtered synthetic-store harnesses each
10checks pass: pressure/harness-v2-claude-2026-10-17T20-17-35-711Z.json and
pressure/harness-v2-codex-2026-10-17T20-17-35-712Z.json.

Actual preparej515bd99ddc034ed8a1e9c3c34acc4a29 native validation passed; service
515bd99ddc034ed8a1e9c3c34acc4a29 source81a56b0d352c39123dd54235088e30539e36dfb202291481ed8b3a94ecb8eb89
seals interrupt74/PID20499/start15:48:23UTC. Activationj0ff785fa0889488fb1cec2373a9a1b4b
installed module+stable settings, no readiness yet. Plan archiveControllerPrepare/
archiveControllerActivate retain exact jobs. No archive/targetSTOP/retirement yet.

Initial mods-load jobjbcefc0b1a47242b2acb5f58c8c5b2933 used WRONG skill name mods.
Exact native user receipt matched, bounded response confirmed no tool calls/skill
unavailable; failure preserved archiveControllerModsLoad. Corrected single job
je08bb6d9f869463d87c49c0571c4a957 loaded Skill(plugin-authoring) once, exact tool
toolu_012SNVGTPqnom5zzkBjLqnHi and correlated native user23eaae8d-d9e8-4caa-99a1-2e74421da63c.
Captured cursor beforehand. Native peer independently changed idle→waiting;
readinessfalse/policyfalse/nativeInputRequiredtrue, no request slots consumed.
Model cannot confirm prompt wording; do not infer ready from its reply.

Asked Taylor asynchronously in this Codex chat to open existing transport scratch
in Claude Desktop and, IF it shows Enable hot reloading for this session?, select
Enable for this session and Submit (otherwise report wording). Person-only loader
consent remains native boundary even in bypass; never click/manufacture/replay it.
Next recheck loading/native readiness, one tool-free boundary if policy snapshot
needs refresh, negative policy probe and positive read. Only then scoped target
quiesce/retire/archive, independent physical absence, reopen/new-epoch coldrebind/read.
Legacy observer unknowns, watcher pause, Codex/1Password separation preserved.

## Delivered offline filesystem flow fixture-qualified; native bootstrap alternative — October 17

Added test/independent-offline-retirement.test.mjs. Runs actual delivered STOP/
retire commands in exclusively owned temporary app/peer/config/state namespaces,
with sealed source/runtime policy and a fixture process observed exited. These
are synthetic epochs, not Claude native processes. No app records exist in the
fixture, exercising supplied retained cwd context without real app state.
Success preserves module/settings bytes and STOP, supports retained-settings move
and repeated retirement without replacement. Unknown original intent remains
byte-identical, keeps STOP, and prohibits module retirement. Registration drift
refuses before STOP; preexisting destination collision preserves both trees and
refuses before retirement ledger. Owned sealed fixture trees cleaned up afterwards.
Three new integration cases pass; nine focused tests pass with offline/STOP unit
contracts. Full frozen-source pressure1/1passes including new cases:
pressure/v2-2026-10-17T20-13-42-093Z.json. No executable source changed this turn;
prior filtered harness source evidence remains applicable, not repeated.
Positive actual native process-loss/recovery remains unqualified.

Important route correction before requiring Taylor's manual transport mode step:
current CLI2.1.299 generated ccd_session/start_session declaration explicitly has
permission_mode and permits same-or-lower mode (omit to inherit). Import path's
acceptEdits limitation does not establish native start's behavior. Exact declaration
hash332911b2203d28d02965597b34f0b907cac6e8e7cfcb9dfba4995316df1bef3e
retained in plan nativeControllerStartAlternative. Declaration evidence only;
no native start attempted. Told Taylor to hold off manual mode setup while this
route is qualified. Next implement one fixed durable native controller bootstrap
through current independent checkpoint/native permission audit, verify persisted
bypass and native peer, then scoped physical exit/reopen/coldrebind/read. Do not
use old legacy broker, create Codex chats, manufacture consent or infer readiness.
Goal active; watcher paused, legacy unknowns and Codex/1Password work separate.

## Explicit offline STOP/retirement prepared; live refusal verified — October 17

Extended independent quiesce/retire with explicit offline:true. Reuses full broker
lock, ownedSTOP and terminal-attempt review, exact sealed module/settings evidence,
exclusive retention moves and durable before/after ledgers. Missing app records
use exact retained generation locator; no arbitrary folder discovery. Offline
mutation additionally refuses ANY observed same-host live peer, including successor
or ambiguous duplicate peers; oldPIDabsence rechecked around effects. Unknown
attempts stay unresolved and prohibit retirement. No auto-restart/replay/STOPclear.
Retired offline context preserves historical source; default live paths unchanged.

Actual negative tests on live interrupt74/service6ab7:
quiesce jobja82d53689ef2454c8097cc9f6b4ab52f and retirejob
j64a2dc5e28854e85a986a552e8553ff8 both refused. Original failedjobs retained.
Before/after STOP/quiescence/retirement absent, module/settings hashes identical;
plan offlineMutationLiveRefusal records exact evidence. Positive actual absent
process STOP/retirement remains unqualified.13focused tests pass including
absent/reappearing/reused/new-peer/ambiguous-owner refusals and API opt-ins.
Frozen-source pressure1/1passes: pressure/v2-2026-10-17T20-10-38-021Z.json.
Filtered synthetic-store harnesses each10checks pass:
pressure/harness-v2-claude-2026-10-17T20-10-19-197Z.json and
pressure/harness-v2-codex-2026-10-17T20-10-19-198Z.json. These do not prove crash recovery.

Scoped controller route identified: existing driver-created transport scratch
local_c0a18601-5a57-44d0-94ac-2fed3719e7ca, cwdprobe/transport-2026-10-15,
no live process/pinned/openPR, but acceptEdits. It is not eligible for bypass-only
independent enrollment. Asked Taylor asynchronously in this Codex chat to open
that exact existing Claude chat, select Bypass permissions and send ready, then
reply here. Authorization is already standing; native permission interaction is
human-only. Do not silently use acceptEdits or weaken enrollment. While pending,
current interrupt receiver remains live/idle with no unresolved. Next use qualified
transport controller for scoped archive/reopen and actual cold epoch proof; preserve
legacy observer unknowns. Codex fixes and 1Password remain parked/separate.

## Read-only offline installed-generation inventory prepared — October 17

Added explicit broker_service_status offline:true, exclusive with historical.
Uses retained generation locator for missing app record; no current native version
or peer required. Exact oldPID must be affirmatively absent before/after sealed
source/settings/selector/pointer review and again around attempt inventory. Any
present/reused PID or observation error refuses. New bounded diagnostic categories
distinguish unavailable epoch/process observation and offline_predecessor_pid_present.
Existing live and historical defaults unchanged. Offline readiness is labeled
historical; no crash cause, replay permission or no-successor-process inference.
No STOP/move/restart/signal/permissions/native effect performed by this API.

Eight focused tests pass: affirmative absence twice, present/reused/unknown/error,
reappearing PID and original unresolved attempt preservation, plus existing status
and result contracts. Actual live negative test refused with
offline_predecessor_pid_present; ordinary live status still verified same idle
PID20499/start15:48:23UTC and no unresolved requests. Plan key
offlineInspectionLiveRefusal retains both. Positive actual absent-process inventory
remains unqualified. Final-source pressure1/1passes:
pressure/v2-2026-10-17T20-08-51-628Z.json. Both filtered synthetic-store harnesses
pass10checks: pressure/harness-v2-{claude,codex}-2026-10-17T20-08-35-970Z.json.
These are synthetic operation/store checks, not crash/recovery proof.

Retirement/quiescence currently require live idle peer; offline inventory does not
change those mutation requirements. Next qualify scoped lifecycle controller and
physical exit, then orderly coldrebind/read and offline crash retirement under
terminal-attempt requirements. Global restart deferred to preserve legacy observer
ownership. Scanner found only pending Oct7/Oct11 legacy reports; watcher remains
paused, reports left pending/unacknowledged and durable observerReconciliationFrontier
notes that these do not establish current observer outcome. Codex fixes parked.

## Native caller-family metadata qualified; scoped process test next — October 17

Added durable broker_service_family using existing independent request, budget,
checkpoint/native permission audit and settlement machinery. Exact linked:true,
include_archived:true,limit100 only; legacy unbound receiver still get_session only.
Family response parser rejects malformed/duplicate/caller rows and arbitrary text;
full-limit evidence remains insufficient for complete lifecycle preflight.

Renewalj6ab7657958214ec59f5b73dd52387b8e installed service6ab7657958214ec59f5b73dd52387b8e
on samePID20499/start15:48:23UTC, native ready/policy observed. Installed build
203c6207727f2796ca4b1367a772db46e3fb07d19be89cea23e83d77fa16b86c.
Family jobj91a84c63b1914fae80d277db67220f4b initially outcome_unknown because actual
native success was exact text "No other sessions found." rather than JSONarray.
Original job/failure retained. Added exact-sentinel handling to host reviewer,
then reconciled SAME request rpeer91a84c63b1914fae80d277db67220f4b without resending.
receiptVerifiedtrue/statecompleted, native toolu_plugin_fd103fb6c0594bc2beca1cd8579d718e.
Fixed-query preflight now qualified with0linkedmembers, archiveAuthorizedfalse.
Native result/admission/control evidence retained in existing plan nativeFamilyRead.
An attempted bounded installed CLI source lookup for empty sentinel found no marker;
that search does not establish implementation cause. Actual correlated native
response is the evidence for exact sentinel support. No broad text heuristics.

28focused tests pass including legacy query refusal, fixed args, duplicate replay,
receipt corruption and exact sentinel negatives. Final-source pressure1/1passes:
pressure/v2-2026-10-17T20-06-22-701Z.json. Both filtered synthetic-store harnesses
pass10checks: pressure/harness-v2-claude-2026-10-17T20-06-13-649Z.json and
pressure/harness-v2-codex-2026-10-17T20-06-13-647Z.json. These harness results do
not qualify native lifecycle controls. Final live status verified idle sameepoch,
2slotsreserved, originalfamilyrequest settled, no unresolved, terminalreviewcomplete.
No archive/stop/delete/unarchive, signal, app restart, consent or permission change.
Next qualify scoped native archive controller and independently observe process
absence/reopen/new-epoch coldrebind/read. Current native family metadata is not
physical-exit or cold recovery proof. Codex fixes and legacy observer remain separate.

## Family preflight contract prepared, native query still pending — October 17

Added lib/native-family-preflight.mjs with a fixed caller-family query
{include_archived:true,limit:100,linked:true}. Pure normalized-metadata review
refuses broadened query keys/values, absent/full-limit responses, malformed or
duplicate IDs, caller inclusion and missing/extra/duplicate ownership reviews.
Even passing review grants no archive authorization or physical-exit proof.
It does not parse native content, qualify its receipt/epoch, or infer ownership.
Three focused tests pass. Frozen-source pressure1/1passes at
pressure/v2-2026-10-17T20-03-17-452Z.json; filtered synthetic-store Claude/Codex
harnesses each pass10checks at pressure/harness-v2-claude-2026-10-17T20-03-11-408Z.json
and pressure/harness-v2-codex-2026-10-17T20-03-11-409Z.json. These are synthetic
operation/store checks, not native family or recovery qualification.
No native query, module installation, process control,
permission change or app restart performed. Existing get_session receiver remains
unchanged. Next integrate a separately receipt-qualified native family read through
the independent service, then use this preflight before scoped lifecycle testing.

## Explicit cold epoch rebind admission prepared, not executed — October 17

Extended experimental activation with cold_rebind:true, requires stable_hook:true.
Default same-process path unchanged. Cold mode requires a DIFFERENT independently
verified current native epoch, exact old retired-source/ownedSTOP/terminal history,
unchanged anchor/settings and distinct generation. Scoped existing PID observer
must report oldPID absent before and after review (also repeated by activation
preflight and before selector mutation); live/reused/unknown PID refuses. Oldselector
still retained exclusively. No cold inference from missing peer metadata or send.
Fresh receiver guard still enforces registered idle bypass scratch and exact native
version/cwd/PID/start. Cold option performs no navigation/restart/consent/permission
change. It requires retained predecessor and cannot adopt an empty/unqualified path.

Seven focused turnover/activation tests pass, including explicit cold flag, changed
new epoch, affirmative oldPID absence, live/sameepoch and unknown-attempt refusals.
Frozen-source pressure1/1passes: pressure/v2-2026-10-17T19-58-01-566Z.json. Both
filtered synthetic-store harnesses10checks pass source/configunchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T19-59-00-485Z.json. No actual cold
activation, oldPID exit, native archive or app restart this turn; cold path remains
unqualified natively. Current0e39receiver/settings/STOP/budgets unchanged.

Lifecycle discovery corrected start_session namespace to ccd_session, not session_mgmt.
get_session declarations describe native parentSessionId/detached. list_sessions
linked:true scopes the CALLER's family, with boundedlimit; not arbitrary targetfamily
and a full-limit response cannot prove completeness. Existing receiver module still
admits distinct-target get_session only; no family query sent. Existing plan
nativeFamilySurfaceDiscovery retains these facts and declaration-only limits.

Before considering authorized app restart, bounded ownership snapshot found177job
records/no queued or running jobs, and3idle registered desktop processes: current
interrupt74/PID20499, control8f/PID42813, legacy35/PID79060. Legacy process start
FriOct16 14:54:25UTC, unique epoch verified but residentfalse/waiterfalse and pinned
runtime dependency epoch mismatch/template stale. This is liveness, not successful
legacy recovery. Existing observer ownership/unknown legacy requests preserved;
no duplicate wake or global restart. Plan coldRestartOwnershipSnapshot and
legacyOwnershipReconciliation retain sanitized metadata; no chat messaging.

Next add a bounded native caller-family metadata operation/control preflight for a
scoped reversible process-disposition experiment, preserving legacy observer state.
Then actual new-epoch rebind/read proof and offline crash/record-loss reconciliation.
Cold mode cannot bypass native consent or deletion's human card, and is not automatic
crash repair. Goal active; Codex fixes and attached cached MCP refresh separate.

## Versioned native lifecycle declaration audit before cold tests — October 17

Added lib/native-lifecycle-surface.mjs and explicit read-only
scripts/mod-lifecycle-surface-299.mjs --session <owned receiver>. ExactCLI2.1.299,
verified idle receiver/current selector, bounded owned generated declaration files,
source hashes and unchanged context required. Report only API method names/input
fields and fixed lifecycle facts; no declaration evaluation or lifecycle calls.
Source hashes retained even when semantic admission fails.2focused mutation tests
pass; final frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-53-01-287Z.json. Before final context/hash-retention refinement,
both filtered synthetic-store harnesses10checks pass unchanged source/config:
pressure/harness-v2-{claude,codex}-2026-10-17T19-51-31-376Z.json. Final refinement
also executed actual audit successfully; it adds diagnostics only, no native effect.

Actual generated-surface report pressure/mod-lifecycle-surface-299-
2026-10-17T19-52-39-914Z.json/sourcee0e898f3c013e9c44407eb7635cf98efb4ed5eb251d437d381a23857011ece0b
qualifies declaration evidence only. Session API has16methods, none exit/close/
dispose/stop/archive. turn.abort and ccd stop_session describe model turn interruption;
stop_session explicitly leaves session open/idle, so not physical retirement.
Archive declaration says process stop and possible related-session/worktree effects;
delete requires human card in EVERY mode; unarchive preserves conversation. These
are descriptions, not executed implementation or physical/recovery proof. Exact
4tool inputs retained; app-owned _consent fields are never manufactured.
Initial lookup assumed start_session in ccd_session_mgmt and missed; namespace
assumption preserved as unqualified discoveryMiss, no invocation attempted.

Metadata-only preflight of exact interrupt74 scratch: worktreePathnull, notpinned,
no openPR.969disk session records inspected locally for exact cwd and directID
references; no other samecwd/directreferences found, no rawrecords/transcripts
exported. This does NOT qualify native archive-family scope. Existing plan
lifecycleMetadataPreflight/lifecycleDeclarationSurfaceReview retains bounded counts,
reporthash and limitations. No stop/archive/delete/unarchive, signal, app restart,
consent or auth change. Current0e39service still installed2/32slots; no worker or
sender started by audit. Legacy broker unknowns/observer ownership untouched.

Next qualify native family/ownership scope and the actual bounded lifecycle control
path before a reversible disposable-session archive/reopen experiment. Do not
substitute turn-stop, module retirement or declarations for actual process absence.
Cold/crash/deleted-session and physical-process proof remain open; deletion's human
card remains a platform gate. Goal active; Codex fixes parked, cached MCP separate.

## Actual deadline expiry routes through one qualified renewal — October 17

Changed no executable source this turn. Used supported renewaljb37794d774c84952807c0781b1d8fefa
to prepare60second/capacity4generationb37794d774c84952807c0781b1d8fefa. It completed
native readiness/policy probe on samePID20499/start15:48:23UTC; one slot used.
Confirmed live idle epoch and originaldeadline1792266436851, then waited actual
wallclock beyond it without editing timestamps/budget or sending an old request.
Postdeadline status verified expiredtrue with3unusedslots and no unresolved;
currentplan recommended renew/lifetime-margin. This was genuine expiry, not capacity
exhaustion or artificial clock mutation. Source remains e5069a2068af59888c17598e454671f67a0bc024972dcb93786fa7604f697dde.

Routed parentjdc9ec715d42047948fad6a5dcea46a17 completed exactly one renewalchild
j0e39125bc2f74cd5a9cef3f94513d021 (built-in probe) and one readchild
j545a02b2dd9f4238a1eee7769db1c0db on fresh successor0e39125bc2f74cd5a9cef3f94513d021.
Published native receiptVerifiedtrue/cleanupPendingfalse; native tool
 toolu_plugin_649cac1c7631455fa16e7371fa8c9ba5. Persisted target session/title/cwd/
archive fields match currentcontrol8f. Route firstdecision lifetime-margin verified.
Sameparent/key reattachment preserves route+renewal ledger hashes. Oldexpired
historical status verifies exact unchangeddeadline, ownSTOP, one terminal probe and
3unusedslots. Shared anchor/settings hash/inode/size/mtime unchanged. Entire wait/
expiry/renew/probe/read interval native journalgrowth0/events0. No model message,
app restart, permission change or native effect attempted on expiredgeneration.

Current0e39125bc2f74cd5a9cef3f94513d0212/32slots,30spare, no unresolved;
deadline1792270059295, same idle nativeepoch. No active sender/parent/child/waiter.
Existing plan expiryRouteSetup/Wait/ExpiredReview/expiryRoutedRead/Verification holds
all clocks/status/jobs/receipts. Prior queue/readiness/format failures preserved.
No repeated synthetic checks for evidence/docs-only changes; executable checks from
prior turn remain applicable, and this native run exercises expiry-specific path.

Next scoped cold/crash/deleted-session and physical-process recovery qualification,
starting with supported lifecycle/ownership evidence; preserve legacyunknown work
and observer ownership. On-demand expiry recovery does not prove an idle daemon,
app restart recovery or changed native epoch repair. Attached cached MCP refresh
still separate. Goal active; Codex fixes parked.

## Queued renewal admission failure reproduced and fixed — October 17

Bounded native pressure used fresh capacity2generation99a5... (one probe consumed,
one real read slot remaining), then3concurrent routed reads. With old5second route
mutex bound, one ordinary read and one renewal+read completed; third parent
jf32eadcaa99c430ca3312dc805474954 failed lock_timeout after5seconds. No route ledger
was created for failed parent; no child admitted. Successful targetmetadata matched,
native journalgrowth0. Original failedjob and evidence preserved, never resubmitted.
Setupj99a5edee8a7244e1bece83380ebd851d; renewalchildj5dc6b2f3a698419bb7670b55ab5f3be9
created known terminal5dc6... . Existing plan queuedRenewal*5s retains exact outcomes.

Changed route admission default60sec, optional queue_timeout_sec1..120. Added explicit
admission boundary wrapper: timeout/cancellation before callback entry returns
admittedfalse/dispatchedfalse/retrySafetrue; errors after entry keep original
uncertainty and cannot masquerade as no-effect. User/parent cancellation after
child submission still requires inspecting child jobs. Six focused route tests pass,
including both admission boundary sides; frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-43-52-981Z.json. Both filtered synthetic-store harnesses
10checks pass source/configunchanged: pressure/harness-v2-{claude,codex}-
2026-10-17T19-44-17-246Z.json. Sourcee5069a2068af59888c17598e454671f67a0bc024972dcb93786fa7604f697dde.

Changed-condition setupj7881bb7de62b451dbbeec009d5e7462b created capacity2generation
7881... . Repeated3concurrent readers with fresh keys/default60sec allcompleted:
parentja2c2720697d74b1188c7ffa0b4f8bcfb read last oldslot;
parentjafeaaf98390e4747935e28aa2fea8e44 ran ONE qualified renewalchild
j9be92135198647d19f464dfab740a8cf and one readchildj428744ea3f50432baa42f2610804bc2f;
parentjbcbe092125794c42bff4a0b1a9c8d0b0 waited7718ms before admission, then one
readchildj0e8bbcc45cee400e90bc63b5631df3e1 on successor9be9... . All persisted metadata
independently matchescontrol8f. Parent durations2138/7784/8921ms include queue,
not native latency SLA. Shared settings/anchor hash/inode/mtime/size unchanged;
old7881STOP/history and original failed5sec parent remain verified. Entire new
pressure journalgrowth0/events0. Exactly3current successor attempts (one probe,
two reads), no unresolved. Current9be92135198647d19f464dfab740a8cf3/32slots,
29spare,deadline1792269897312, samePID20499/start15:48:23UTC. No active native or
headless parent/child/sender/waiter. Existing plan queuedRenewal*60s holds evidence.

Next expiry-triggered routing and scoped cold/crash/deleted-session/physical process
proof. Bounded queued-renewal success is not unbounded queue or unattended daemon
proof. Original readiness timeout/direct format failures retained. Cached attached
MCP refresh remains separate; Codex fixes parked. Goal active.

## Fresh Claude/Codex MCP current-route native contracts qualified — October 17

Extended existing explicit native harness with --current-route; default direct
contract unchanged. Exact healthy selected-service plan preflight, same4tools only
(guide/status/exact submit/waits), new current-mode persistent claim distinct from
old direct claim. Proxy records metadata-only nested child receipt mapping. Parent
submission twice must reattach samejob; derived native request uses real readchild,
not parentID. Route qualification additionally requires selected service match and
ONLY readchild, no maintenance. Full final marker still strict; prior Claude direct
format failure remains immutable. Six focused contract/classifier/claim tests pass;
frozen-source pressure1/1passes: pressure/v2-2026-10-17T19-40-37-331Z.json.

Actual fresh canonical MCP clients both pass all14checks:
pressure/harness-native-current-{claude,codex}-2026-10-17T19-40-43-088Z.json.
Hostsource4aa2f8fbe10a3c0016e02cf35f1b7ab6c42eaeee5640da23f34b2537bc0cb9a2,
receiver remains pinned0ba5... . Configured Codexmodel gpt-6-sol/canonical launcher
independently verified; Claude restricted/no session persistence; neither has shell,
files/browser/apps/other tool access. No refused/out-of-scope calls, source/config
unchanged, exact final markers, zero native journalgrowth/model turns.
Claude parentj1c76c19e9e6c463988db85d0adb5f645→readchildjdcf26394a31c476e8f11f95d59103766,
native toolu_plugin_635bbf4084dd4005aae30a8fe59e846c.
Codex parentj9c1b8b102da24118ba5f006af6dc61b0→readchildjf8e503ae390949e3bec1a23319869c94,
native toolu_plugin_9946bc55c84e4e6f925c6230a1dc3624.
Both persisted targetmetadata independently match currentcontrol8f session/title/cwd/
archive. Original report hashes and IDs retained in existing plan
freshCurrentRouteMcpReview. Currentbb97now7/32slots,25spare, no unresolved; same
PID20499/start15:48:23UTC, deadline1792269345930. No active client/parent/child waiter.

Current chat attached MCP driver_status independently rechecked read-only: olddriver
46c7a58/runtime64c856... still restartRequired:true. No write through cached binding,
no global config/source/app/MCP process change. CurrentAttachedMcpReview retains
sanitized metadata. Fresh-client integration does NOT refresh that binding. Supported
current-chat refresh remains separate from successfully connected fresh clients;
Codex-driver fixes still parked.

Next queued-renewal admission pressure (currentroute mutex5sec vs observed native
readiness18-24sec), expiry routing and scoped cold/crash/deleted-session recovery.
Healthy fresh-route proof does not cover harness-triggered maintenance or unbounded
queues. Original readiness timeout/direct format failures remain. Goal active.

## Queued routed reads and duplicate submission native pressure — October 17

Previous turn implemented bounded current read routing/capacity renewal. This turn
changed no executable source; exercised final hostf6901d752f7e1a3556a7a43b500091dfff859ae00b1c7c0729b9d8ccca9c6357
against pinned receiver0ba5... on currentbb972ca6ef564e77850b68749d319c85.
Submitted3distinct current-read parents concurrently plus one duplicate of the first
key. Actual parentsj77963545f8a64919883929368045c3b0,
j6558611a8fb943b6af96545dd76a7463,ja49614aedc89453f8244c9b6de4dd33b allcompleted.
Fourth submission reused first exactjob. Three distinct real readchildren/requests,
no renew/probe children, each persisted target session/title/cwd/archive metadata
independently matchedcontrol8f. Actual capacity delta exactly3, from2/32to5/32.

Native intervals sorted byreceipt do not overlap:446ms,410ms,596ms. Parent elapsed
including queue1217ms,2280ms,3638ms. These are sampled timings, not latency SLA.
Native journalgrowth0/events0, samePID20499/start15:48:23UTC. All5current attempts
terminal (four reads plus one probe), no unresolved,27spare slots. Deadline remains
1792269345930. No model message, app restart, permission change or hand-edited budget.
No active parent/child/sender/worker/waiter. Existing plan
currentRouteQueuePressure retains submissions/jobs/outcomes/verified receipts and
native interval proof. Earlier readiness timeout remains preserved. No repeat
synthetic suite was needed for docs/evidence-only changes; prior executable checks
remain applicable and this native run also exercised the final result-success guard.

Next fresh real Claude/Codex MCP clients through the new current-route API (earlier
native MCP qualification used direct explicit service read), then queued renewal,
expiry routing and scoped cold/crash/deleted-session recovery. This small healthy
queue does not establish unbounded queue or callers waiting behind renewal. Current
route admission lock still has its existing5second wait bound. Goal active; Codex
fixes parked, current-chat cached MCP refresh separate.

## On-demand read routing with native capacity renewal — October 17

Added broker_service_read_current: durable parent, exact current stable selector,
valid distinct target before effects, per-receiver route lock. Pure bounded routing
permits at most one renew, one probe and one read; no recursion/retry. STOP/wait/
inspect/repeated maintenance/changed selection or uncertain child stops. Actual
child driver_submit jobs retain deterministic keys before submission and realjobIDs
before waiting; no synthetic child identity or probe/read request collision. Parent
cancellation does not cancel/settle children; inspect retained child handles. Parent
route ledger records all phases/results. Automatic renewal uses3600sec/32slots.
Initial eight focused route/planner tests pass (all action paths, one-effect limits,
uncertain child, changed selection, invalid target). Frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-35-10-907Z.json. Native/host source
0ba5fc8137cb330462aaa8e0d505fd904b2d4fdebf8f3a30f1ff0a42e7d21837. Both filtered
synthetic-store harnesses10checks pass source/configunchanged on this source:
pressure/harness-v2-{claude,codex}-2026-10-17T19-36-08-875Z.json.
After native tests added explicit route-success check: child native result must have
matching serviceId, receiptVerifiedtrue and statecompleted. Failed/foreign native
result remains preserved after-read and cannot qualify parent success. Nine focused
tests pass plus final frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-37-21-993Z.json. New predicate also reviewed retained actual
native result read-only; no repeat dispatch. Native/harness source scope above is
kept separate from this final additional guard.

Healthy native parentj7f3892ca9de045919b80daa0a864c5c1 completed exactly one readchild
j6a2b932d0df849cc860dd809f1f75198 against533f; targetmetadata independently matched.
Samekey parent reattachment preserved route ledger, exactly one additional slot.
Then bounded real capacity pressure used3real metadata reads to exhaust old533f6/6,
not synthetic budget edits. Parentsj82b99fdcd28f436a91daba382d197397,
j40ac8d1cd774401fa139ad85623cd170,jaabefecd8e034d769e433dc9ade8ada1 each readonly
(one readchild). Fourth parentj1d28c9410b1b4eaaaa89f8258c38ef53 automatically selected
renew on capacity exhaustion, retained childjbb972ca6ef564e77850b68749d319c85 (full
7step renewal/built-inprobe), then one readchildjca64e5aee633404b96f000497c7a9584.
Successorbb972ca6ef564e77850b68749d319c85 native public receiptVerified/publishedtrue,
cleanupPendingfalse; all4pressure metadata payloads independently matchcontrol8f.
Renew probe rpeerbb... differs from read rpeerca64... . Same parent reattachment
preserves route+renewal ledger hashes. Old533f history/STOP and all6attempts terminal.
Shared anchor/settings hash/inode/mtime/size unchanged. Across pressure+turnover+
probe/read native journalgrowth0/events0. Original shell observation stopped on
running fourth parent; polling exact same live job later completed it, no newjob.
Currentbb97 capacity2/32used,30spare/no unresolved, deadline1792269345930,
samePID20499/start15:48:23UTC. No active parent/child/sender/worker/waiter remains.
Existing plan currentReadRoute/currentRouteCapacityPressure holds all identities.

Next sustained/queued pressure and expiry-triggered routing evidence, then scoped
cold/crash/deleted-session recovery and physical process proof. This establishes
on-demand capacity renewal, not daemon/idle resumption or unrestricted always-on.
Prior15sec readiness failure preserved. Current-chat cached MCP refresh separate.
Goal active, Codex fixes parked.

## Read-only current-generation action planning — October 17

Added broker_service_plan and pure planIndependentService. Before/after exact stable
selector equality plus live status/native epoch/source identity required. Actions:
read/renew/probe/wait/stop/inspect. Own STOP and unresolved attempts precede expiry/
capacity; unqualified/historical/control/native observations inspect. Native input,
busy or unobserved readiness waits.90sec lifetime margin or no capacity recommends
renew; missing policy audit recommends probe only with capacity for probe+read.
No automatic effect, reservation, wake, restart, prompt, scheduling or authorization.
Actual operations still revalidate admission. Four focused policy tests pass with
STOP/unknown/malformed/busy/loading/expiry/capacity/read/probe cases. Frozen-source
pressure1/1passes: pressure/v2-2026-10-17T19-33-02-755Z.json. Both filtered synthetic-store harnesses
all10checks pass source/configunchanged: pressure/harness-v2-{claude,codex}-
2026-10-17T19-33-16-706Z.json.

Actual current533f plan returned read with4spare slots; stale821f returned inspect/
selected-generation-changed. Before/after pointer/budget hashes and reserved IDs
unchanged, native journalgrowth0. Existing plan stableReceiverPlanReview holds this
read-only evidence. No new native send/read/renewal/probe in this turn; current533f
remains2/6slots, no unresolved, deadline1792269039143 on same native epoch. Previous
15second renewal failure remains intact; no active sender/worker/waiter.

Next connect bounded on-demand read routing to these decisions, preserving durable
one-attempt identities and one-renewal budget rather than recursive retry. Then
sustained pressure and authorized recovery qualification. Planner is not automatic
resumption or always-on service. Crash/cold/deleted-session/physical process proof
and current-chat cached MCP refresh remain open. Goal active; Codex fixes parked.

## Renewal includes native readiness and policy qualification — October 17

Renewal now checkpoints7steps: prepare/quiesce/retire/activate/readiness/policyProbe/
verify. Readiness polls exact installed context/epoch with bounded30second budget,
refuses STOP/expiry/uncertainty, then one durable negative probe uses the parent
renewal job identity. Requires capacity>=2 (one slot permanently consumed by probe).
Final policy-qualified ledger/readAdmissionQualified requires fresh ready/audit,
terminal attempts, no STOP/expiry and unused capacity. servingQualified remainsfalse;
positive read is separate.10focused renewal/probe tests pass, including each phase
failure/cancellation/timeout and delayed18.59sec readiness fixture. Final frozen-source
pressure1/1passes: pressure/v2-2026-10-17T19-30-26-527Z.json. Both filtered synthetic
harnesses10checks pass source/configunchanged: pressure/harness-v2-{claude,codex}-
2026-10-17T19-30-43-774Z.json.

Preserved native failure: integrated jobj821f09f4bbae439fbbd554dcc9f9a2dc/source296d...
failed before-readiness at original15sec bound; prior effects completed, no probe
sent. Actual ready arrived18.59sec after activation,3.5sec after failure. No crash,
restart or model turn. Original failed job/ledger remain unchanged. Raised bound30sec
based on this evidence, specific independent_service_readiness_timeout category.
Late-ready generation separately qualified using new policy probej59b044efda634154a13dec8685baf375
and readj0215d87076bf4e94bee351510bded2ea; targetmetadata matched/journalgrowth0.
These were new supported operations after definitive absence of any original probe,
not replay or relabeling of the failed renewal.

Changed-condition native renewalj533f569be2e748089763c7fba947b3ba then completed all7
steps from known terminal821f generation, source7886789dbea9dc9471e945787ba17a7b04199145c8002ec95690be7237340946.
Successor533f569be2e748089763c7fba947b3ba; actual readinessWaitMs23441. Built-in probe
rpeer533f569be2e748089763c7fba947b3ba terminally verified. Returned readinessObserved/
nativePolicyObserved/readAdmissionQualifiedtrue,servingQualifiedfalse. Same-key
reattachment samejob/unchanged ledger. Positive public readj1de90f10febd4939b8711c4e8f2a5038
completed receiptVerified/publishedtrue,cleanupPendingfalse, native tool
 toolu_plugin_b1037d626fb94548b6fcce4eea7356b8; persisted targetmetadata matchescontrol8f.
Across entire renewal+probe+read native journalgrowth0/events0. Shared anchor/settings
hash/inode/mtime/size unchanged. Old821f history/STOP and original failed job verified.
Current533f capacity2/6used, no unresolved, deadline1792269039143, samePID20499/start
15:48:23UTC. No active sender/worker/waiter. Existing plan qualifiedRenewal*,
lateReadyStandalone*,qualifiedRenewal30* holds exact jobs/failures/readiness/evidence.

Next bounded automatic renewal decision/read routing and sustained pressure.30sec is
a tested budget, not a loader latency guarantee; late observations must preserve
failure and original identity. Automatic daemon/recovery scheduling, crash/cold/
deleted-session and physical process recovery remain unproven. Current-chat stale
MCP refresh separate. Goal active, Codex fixes parked.

## Durable native negative policy probe qualified — October 17

Added broker_service_policy_probe, explicit experimental independent receiver and
one durable driver_submit identity. Parent job maps to exact rpeer request and
exclusive global probe record. Private child holds broker read-lifecycle lock,
checks exact installed source/epoch/idle/readiness/no STOP/arms, refuses prior
unresolved attempts, reserves permanent slot, checkpoints before one send. No
protocol request/control created. Uses existing strict terminal missing-request
screen through attempt reviewer: native policy audit/helper/refusal/exact absent
request/control/admission/results. Never broad no-effect/positive serving claim.
Bounded timeout/cancellation/worker-loss leaves original identity/slot and evidence,
no cleanup replay; status reviews delayed terminal evidence without resending.

Six focused probe/refusal tests pass: each effect/checkpoint failure, timeout,
cancelled/invalid input and narrow proof gates. Frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-26-31-896Z.json. Both filtered synthetic-store harnesses
all10checks pass, source/config unchanged: pressure/harness-v2-{claude,codex}-
2026-10-17T19-27-09-895Z.json. Host sourcea655b302273f60b1fbbeaca3ca35cfd050f3537a93c147692d4a974dabda2f67;
receiver remains pinned4316b7ee634ce41c5306c142b0dc5df06ac438017ba2dc9e233692710ef1d627.

Actual probejecd36ad6999c4b048a4d45f59e376fb1 on service44e1287366824bfe82e42a32458e9635
completed terminalRefusalVerified/policyInvocationObserved/scopedNoNativeMcpQualified,
servingQualifiedfalse. Exact request rpeerecd36ad6999c4b048a4d45f59e376fb1. Same-key
reattachment samejob and probe/send/refusal hashes unchanged. Separate positive
public readja93978a8866f4cfa8dcc71c709f15bb7/requestmatchingrpeer suffix completed,
receiptVerified/publishedtrue,cleanupPendingfalse; native tool
 toolu_plugin_851b2962c7314615aa935cd7d446f8f0. Persisted target session/title/cwd/
archive fields match current control8f. Entire probe+read native journalgrowth0.
Status2/6slots used, one settled read/one terminal refusal/no unresolved. Native
PID20499/start15:48:23UTC unchanged, readiness/policy audit observed. No model
message, app restart or permissions change. No active sender/worker/waiter.
Existing plan durablePolicyProbe*/durablePolicyProbeRead/Verification holds evidence.

Next integrate renewal readiness waiting and durable probe identity, then automatic
bounded renewal decisions/read routing. These are explicit one-shot operations,
not scheduled always-on or crash/cold/deleted-session recovery. Physical process
retirement/current-chat cached MCP refresh remain open. Goal active, Codex fixes parked.

## Durable one-shot stable receiver renewal — October 17

Added broker_service_renew, requires experimental opt-in and durable driver_submit
job. Job suffix is successor service identity. Per-receiver renewal mutex; existing
prepare/quiesce/retire/activate APIs retain their own lifecycle locks. Durable global
independent-service-renewals/<jobId>.json records before/after prepare, quiesce,
retire, activate and verify. Prepare occurs before predecessor STOP to minimize
downtime. Before each effect exact idle native epoch/receiver/current selector is
revalidated. Live predecessor must verify installed and terminal before preparation.
No retry/rollback/resume branch. Uncertain phases keep original identity and error
category. No prompt/token/native result payload in renewal ledger. Installation is
explicitly servingQualified:false; readiness is only verification-time observation.
Six focused transition/turnover tests pass, injecting each effect/checkpoint/epoch
failure and confirming no later effect or replay. Frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-24-26-618Z.json. Both filtered synthetic-store harnesses
all10checks pass with unchanged source/config: harness-v2-claude-2026-10-17T19-24-50-149Z.json
and harness-v2-codex-2026-10-17T19-24-50-146Z.json under pressure/.

Actual durable renewalj44e1287366824bfe82e42a32458e9635 completed predecessor8f32→
successor44e1287366824bfe82e42a32458e9635 on samePID20499/start15:48:23UTC,
source4316b7ee634ce41c5306c142b0dc5df06ac438017ba2dc9e233692710ef1d627.
All5steps checkpointed. Result readinessObserved:false at install-time; later live
status independently observes fresh readiness. It correctly retains policyObserved
false and servingQualifiedfalse. No policy probe or public native read performed
on this new generation yet. Budget0/6,deadline1792268674323. Original job/key
reattaches samejob and unchanged renewal ledger; old8f history/STOP/terminal attempts
verify. Shared anchor/settings hashes/inode/size/mtime unchanged. Entire renewal
native journalgrowth0/events0. Original plan durableRenewal contains job, before/
after evidence. No sender/worker/waiter remains active; bounded new module installed.

Next formalize durable negative policy probe (currently qualification uses explicit
missing-request native self-test), then integrate bounded automatic renewal decisions
and read admission. Current operation is one-shot orchestration, not a daemon or
unattended always-on proof. Crash/cold/deleted-session and physical process recovery,
current-chat cached MCP refresh remain open. Goal active; Codex fixes parked.

## Stable settings preserved across native generation turnover — October 17

Integrated guarded successor activation for stable_hook. Existing watched module
or new private runtime still refuses. Existing stable anchor/settings/selector must
all validate. Read-only historical inspection independently verifies selected old
source is files-retired, own STOP matches, every attempt terminal, no unresolved.
Exact same native epoch and anchor/settings hashes required. Old selector is moved
exclusively to predecessor retired-receiver-selector.json, verified by hash, then
new selector written exclusive; ledger records before-retention/publication phases.
No anchor/settings rewrite. Interruption is inspect-only, no rollback/replay.
Nine focused tests pass; first frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-21-44-120Z.json. Native source8aef7f301ece2a596461c3fad4114075d14597ac21383873dc3a28dabbde83b6.

Actual oldd80 quiescencejf090feddead54fd8a988fede7167ab9c reviewed both attempts
(one settled read, one terminal refusal), ownSTOP. Retirementjbbd685694e8b486898fdee2efff06286
preserved module, left shared settings/anchor unchanged. Preparation
j8f324f5961b34691b8b78740c29ae3d2 created successor8f324f5961b34691b8b78740c29ae3d2,
capacity6/deadline1792268502415. Activationj27b9e2c1bc734878bb7018f91e4b5c86
retained oldselector and installed successor on samePID20499/start15:48:23UTC.
Fresh readiness observed. No model boundary message or extra human consent.
Native missing-request selftestrpeerf22914391a4f2804d7a4a9af0efb3579 produced
matching current-generation policy audit/helper/refusal and terminal review.

Public readj5f5e34bb0b0148c7bd7bc6f187af8333/requestmatchingrpeer suffix completed,
receiptVerified/publishedtrue,cleanupPendingfalse, native tool
 toolu_plugin_230413aa0b9a49138f171c8c91e203de. Persisted target session/title/cwd/
archive fields independently match control8f. Reattachment samejob; result/admission/
control hashes unchanged. Across ENTIRE quiesce/retire/prepare/selector activation/
selftest/public read interval, native journal growth0/events0. Shared anchor/settings
hash/inode/size/mtime unchanged before/after. Retained selector matches prior hash;
old history verifies with terminal attempts and STOP alongside successor.
Original plan empty-receiver-activation.json stableHookTurnover*/stableHookSuccessor*
holds durable identities and evidence. Successor2/6slots used, no unresolved,
intentionally left installed/bounded. No sender/worker/waiter remains active.

After native run tightened independent historical PID/start comparison and selector
reread equality; these additional assertions are synthetic/current-source checked,
not a repeat native turnover. The stricter predicate also passed a read-only review
of actual retained predecessor selector/policy and freshly verified historical status.
Final pressure1/1passes: pressure/v2-2026-10-17T19-22-55-841Z.json. Both filtered
synthetic-store harnesses10/10checks pass with unchanged source/config:
pressure/harness-v2-{claude,codex}-2026-10-17T19-22-41-746Z.json.
All actual native source identity retained above.
Next automatic bounded renewal/controller and pressure/recovery evidence. Cold,
crash/app-update/record-loss and physical process retirement remain open; current
chat cached MCP refresh separate. Goal active, Codex fixes parked.

## First stable hook native activation and public read — October 17

Integrated stable_hook:true opt-in through durable broker_service_activate. Existing
empty-receiver guards retained; existing stable entry/selector also refuse. The
policy factory comes from prepared sealed source, not mutable host generation.
Stable hook is written sealed, selector binds newly committed private pointer,
settings exclusive write follows; before-settings ledger covers partial effects.
Context validates anchor/settings against sealed artifact factory and, while
installed, matches the active selector/private pointer. Historical contexts do not
borrow a successor selector. Default per-generation hook route unchanged.
Both filtered synthetic-store harnesses pass all10checks with unchanged source/config:
pressure/harness-v2-{claude,codex}-2026-10-17T19-19-46-382Z.json. These are separate
from the actual native read evidence below.
Ten focused tests pass, including identical stable settings/entry across synthetic
generation/build/native epoch changes. Frozen-source pressure1/1passes:
pressure/v2-2026-10-17T19-18-21-078Z.json, sourceChanged:false.

Actual prior2e21 quiescent/exhausted receiver revalidated on samePID20499/start
15:48:23UTC; all4attempts terminal. Retirement jobj48174eff195c461bb19d7d192c675f91
preserved entire module and original settings/STOP. Preparation
jd80efff6c0594355ba3835a18a0f6bfd created service d80efff6c0594355ba3835a18a0f6bfd,
sealed buildcc732b332a9e58eeb2b7357724a5e373c3eb60fcaf2a5f95c1db6944a2f6d879,
capacity6,deadline1792268313734. Activationj6da00321e11145b7b3b8b35a5260f2e7
installed stable entry and selector/settings/module. Actual fresh readiness retained;
no additional consent prompt. Tool-free boundaryjcf1be548e9ba469dbaf184ea6198d038
returned exact STABLE_HOOK_BOUNDARY_OK/end_turn/tools0. Missing-request self-test
rpeer20d38621e44ae7b2aabc577f8bd1c382 reserved slot0, sent once under private lifecycle
lock, actual native policy audit/helper/refusal terminally verified; no unresolved.

Public readjd5bbcc3d19bc4142a2bc6fe846df536c/requestmatching rpeer suffix completed,
receiptVerified:true,published:true,cleanupPending:false. Native tool
 toolu_plugin_53786cbc2d7444a1a6eef9d56fbbaa8d. Returned control8f session/title/cwd/
archive fields independently match current record. Native journal growth0; same-key
reattachment returns original job and unchanged result/admission/control hashes.
Original plan empty-receiver-activation.json holds stableHook* identities, delivery
and observations. Budget2/6 used, no unresolved. Bounded native service intentionally
left installed; no active sender/worker/waiter and no app restart/permissions change.

Next implement preserved selector turnover after quiescent retired predecessor,
with unchanged stable settings and exact anchor. Current activation deliberately
refuses occupied stable paths; do not manually overwrite/rearm them. Need second
native read after actual turnover without boundary, then broader recovery/process
and always-on proof. Current-chat stale MCP refresh remains separate. Goal active,
Codex fixes parked.

## Standalone stable receiver entry built, not installed — October 17

Added pure receiver-hook-artifact builder: embeds built-ins-only selector/file loader
plus bounded stdin/child handler dispatch, fixed receiver settings command, hashes
and paths. It hash-loads selected bootstrap, calls shared sealed inventory/native
ancestry admission, rechecks selection, then runs only the fixed sealed handler with
private state and PreToolUse argv. Child timeout4sec/output64KiB; output must be a
PreToolUse object without an allow decision. Failures emit fixed sanitized denial.
No workspace dependency imported by generated entry. Existing handler retains all
request/admission/STOP checks. Builder has no install or activation effects.

Actual staged executable test forwards to the sealed handler's denial; wrong
session refuses in entry. Synthetic peer/real parent ancestry, not desktop proof.
Initial executable run produced no output because /var paths resolve to /private/var
in import.meta.url. Canonicalized direct-run identity; next run still failed because
the existing handler's direct-run check also needed canonical argv. The wrapper now
invokes the validated handler's realpath; broker argument/policy/hash unchanged.
Failed pressure report retained: pressure/v2-2026-10-17T19-16-37-404Z.json,457/458
pass with the new forwarding assertion failing. No failures erased or demoted.
After correction eight focused tests pass and frozen-source pressure1/1 passes:
pressure/v2-2026-10-17T19-17-06-436Z.json, sourceChanged:false.

Still no candidate activation/selector publication; no live settings/module changes,
messages or restart. Next integrate explicit anchored policy/lifecycle, then first
native audit and two-generation turnover with identical settings/no model boundary.
Do not infer native positive dispatch from synthetic denial forwarding. Goal active;
Codex fixes remain parked.

## Shared sealed-runtime receiver hook admission — October 17

Factored the existing bootstrap full sealed inventory/fingerprint verification into
one private pinnedRuntime function, reused by unchanged helper entry semantics and
new exported admitPinnedReceiverHook. The hook requires an independent namespace,
exact unchanged expected pointer, native request binding capability/version1,
PreToolUse receiver session/cwd and actual native ancestry. It returns only the
fixed selected sealed handler/state/native binding; no helper receipt, environment
change, tool execution or permission decision. Actual handler request/STOP checks
remain mandatory after entry admission.

Extended real staged-release tests: child invocation imports the hash-selected
sealed bootstrap, qualifies a synthetic peer with real parent ancestry, refuses
stale pointer/foreign cwd and verifies no helper-selected receipt. Eight focused
selector/file-loader/bootstrap/native-policy/retention tests pass. This is synthetic
peer evidence, not an actual desktop hook invocation. Existing native context and
installed generations are unchanged. Next build the stable executable around the
bounded selector loader and hash-verified bootstrap, preserve handler process argv
identity, then integrate candidate activation and qualify native two-generation
turnover. Frozen-source pressure1/1 passes: pressure/v2-2026-10-17T19-15-33-240Z.json,
sourceChanged:false. No sends/restarts/settings changes. Goal remains active;
Codex fixes parked.

## Bounded receiver selector file loader prepared — October 17

Added read-only loadReceiverSelection around the exact selector contract. It checks
owned nonsymlink receiver/private generation directories, refuses group/world
writable directories/files, reads bounded O_NOFOLLOW/nonblocking file descriptors,
and checks descriptor/path inode, times, mode, owner and size after reading. It
hash-checks the sealed anchor, selected handler and bootstrap against their bound
metadata and rechecks the selector bytes before returning. No executable path is
accepted from the selector. Six combined selector/native-policy/generation tests
pass, including actual-file symlink, oversize and modified-handler rejection.

This remains unused preparation code, returning executionQualified:false. It does
not establish full sealed release inventory, native ancestry, atomic turnover or
hook execution. Next integrate those checks into a built-ins-only executable and
candidate lifecycle; preserve existing actual handler request/STOP/native admission
gates. Do not deploy this loader alone or infer readiness from it. No native sends,
settings edits, app restart, STOP change or installed generation mutation occurred.
Frozen-source pressure1/1 passes: pressure/v2-2026-10-17T19-14-38-446Z.json,
sourceChanged:false. Previous turn was implementation progress; goal remains active,
Codex fixes parked.

## Stable receiver selector contract prepared — October 17

Added pure lib/receiver-runtime-selection.mjs as the first stable-hook component.
It accepts an exact selector schema, derives the private generation/handler/bootstrap
paths rather than accepting an executable, and requires matching pointer generation,
build, bootstrap, native PID/start/session, private namespace, policy binding and
settings/anchor hashes. Existing policy request-binding version and zero-rescue
requirements remain mandatory. Selection grants no readiness or dispatch authority.
Two focused tests include twelve identity/path/hash/policy substitution refusals;
five combined selector and existing generation/policy tests pass. Frozen-source
pressure1/1 passes: pressure/v2-2026-10-17T19-13-45-525Z.json, sourceChanged:false.

This is an unused pure contract only: no stable executable, selector publication,
filesystem ownership admission or lifecycle integration is implemented yet. Nothing
was deployed, no settings changed, no native call/message/restart occurred. Next:
build the bounded owned-file entry around this contract; validate sealed inventory
and native ancestry without importing mutable workspace code, then integrate an
explicit candidate activation path. The first native install still requires actual
hook audit, followed by two-generation turnover with identical settings bytes and
no model boundary. Existing quiescent generation and STOP remain untouched.
Previous confirmation turn only restated recorded approval; this turn adds source
and passing regression evidence. Goal active; Codex-driver fixes remain parked.

## Installed settings-read adapter qualified; no refresh API established — October 17

Previous turn progressed fresh native MCP harness integration and safe closeout.
Investigated whether generation settings could reload without a model turn using
supported module API. Current native generated declarations expose settings.read
only, explicitly read-only. Exact installed2.1.299 dispatch calls frr(n) after source
validation. Adapter frr returns DW(ct()) for merged data or DW(fe(source)), with
policy transform for policy source. No explicit refresh operation in this adapter.
Provider internals are not qualified as cache refresh; do not infer reload from a
read API or remove existing native boundary/audit requirement.

Added scripts/mod-settings-contract-299.mjs, current version gated and exact unique
function prologue/boundary. Extracted bounded1800byte installed window offset
204825436/SHA0cfb633582f54750ccf230c6c1f9aec1a01f68cea12e1c0a196aa746047f6fca.
Actual adapter+source validator execute with synthetic settings providers/clone/
policy transform only. Five checks pass: merged snapshot isolation, selected-source
provider, policy-only transform, invalid/inherited source rejection, unredacted
synthetic env field. No actual settings read, native module/tool/process call,
write, inference or refresh. Report pressure/mod-settings-contract-299-
2026-10-17T19-09-44-506Z.json. Source lookup misses/ambiguous short names and large
module refusal retained in diagnostics/settings-adapter-extraction-2026-10-17.json.
Narrow unique prologue avoids unrelated frr/prr in another bundled module.

Final unchanged-source pressure1/1pass: pressure/v2-2026-10-17T19-10-33-864Z.json.
Both synthetic-store headless harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T19-10-20-922Z.json. These do not
replace prior real native evidence or erase the preserved Claude format failure.
This changes next implementation: use a stable owned per-receiver PreToolUse entry
rather than rewriting the loaded hook command for every generation. Build a sealed,
built-ins-only anchor and strict receiver selector tied to exact service namespace,
pointer/build/bootstrap/native epoch and owned policy/settings hashes. Preserve all
existing request/native admission/STOP gates and immutable old history. The first
anchor install still needs actual native boundary/audit qualification; do not claim
that a static selector or source tests load settings. Then switch generations by
validated selector and package publication, retain identical settings bytes, and
prove two real native reads across turnover without journal growth/model boundary.
Held/unbound/failed native reload outcomes remain gates; no synthetic consent.

Current2e21 generation remains quiescent with STOP, capacity4/4 used and all attempts
terminal. No new native request, message, process signal or app restart this turn.
Don't reuse slots or lift STOP to test the anchor; retire/preserve it and prepare a
fresh bounded generation when anchor implementation is ready. Physical retirement,
cold recovery, record-loss recovery, current-chat stale MCP refresh and always-on
pressure remain open. Goal active; no pending sender/worker/waiter; Codex fixes parked.

## Fresh real Codex/Claude MCP native metadata qualification — October 17

Previous turn progressed same-process generation replacement and successor serving.
Current Codex chat's attached driver_status reports restartRequired:true, cached
driver46c7a58; exposed broker_service_status schema lacks independent session/history.
No write attempted through stale binding. Configured Codex MCP command independently
matches canonical launcher; configured model gpt-6-sol. No global configuration,
Codex process or attached MCP process changed. Fresh ephemeral clients work; this
chat's cached binding is NOT claimed refreshed. A supported refresh remains open.

Added separate explicit --live scripts/harness-native-service.mjs for real scratch
metadata qualification; existing synthetic harness-v2 remains never-native.
Fresh stdio proxy exposes only guide, exact service status, ONE exact durable read
submission identity (duplicate reattachment permitted), and waits for its observed
job only. Target/operation/key/args/unknown-job changes refuse. No general native
mutations, resources, shell/browser/app tools. Claude restricted/no persistence;
Codex ephemeral/ignore-user-config/read-only, configured gpt-6-sol with shell/unified
exec/computer/browser/apps disabled. Raw output/trace private and bounded; only
owned test harness process group is timed out, never desktop receiver/session.

Native Codex report pressure/harness-native-codex-2026-10-17T19-02-11-907Z.json
all12checks passed. Exact jobj833eff28cea44d71b5c24498f6728b9a/request
rpeer833eff28cea44d71b5c24498f6728b9a, native tool
 toolu_plugin_9c568931e57f44fbbc886ff38a3327b3,296ms module path.
Claude report pressure/harness-native-claude-2026-10-17T19-02-33-335Z.json remains
ok:false: native/transport/identity/idempotency/receipt/config/source/no-model-turn
checks passed, but model added a short preamble before NATIVE_MCP_OK, violating
strict final output check. Exact jobj16a383eaf31a4f80a5a6e10830c81b6f/request
rpeer16a383eaf31a4f80a5a6e10830c81b6f, native tool
 toolu_plugin_dedecbfd4a224e3ca7418e8760d4f7a6,291ms module path.
Both actual metadata payloads independently match control8f identity/title/cwd/
archive state. No receiver model turn, no refused/out-of-scope calls, no config
changes. Outer headless model latency is separate from module timings; no SLA.

Original reports immutable, hashes retained in pressure/harness-native-review-
2026-10-17.json and existing plan liveMcpHarnessReview. New classifier preserves
ok:false/failureCategory harness_output_format while separately reporting
nativeContractVerified:true; missing/failed operational checks never qualify.
No extra native read to repair cosmetic output. Actual native runs were frozen
host sourcefb6d... before diagnostic classifier/claim metadata additions; later
current-source pressure covers those additions, not a repeat native qualification.
Final unchanged-source pressure1/1pass for current diagnostic/claim additions:
pressure/v2-2026-10-17T19-05-22-881Z.json. Four focused policy/classification/
persistent-claim tests pass. A persistent exclusive
native-harness-attempts claim now blocks a disconnected rerun of same harness/
receiver/service/target; original two contracts backfilled, no new native calls.
Inspect original contract/job before any rerun, never generate a new identity to
retry unknown work. Preserve the Claude output failure; do not relabel all tests pass.

Successor2e21 budget4/4 used: prior read + these two reads + terminal self-test.
Closeout quiescence jobje506aefcbf294411a749b52f83cb842e completed, ownSTOP,
quiescent:true, three settled reads/one terminal refusal/no unresolved. Current
module/settings retained but admission stopped; do not clear STOP or replay IDs.
Predecessor db2 retained settings/STOP/history and old d5 unknown unchanged.
No active sender/worker/waiter. Native client reports/trace/jobs preserved.
Next supported process disposition/warm-cold/record-loss and always-on proof;
prepare a fresh bounded generation before more native work. Goal active,
Codex bridge fixes parked. Cached current-chat MCP refresh remains separate from
successful fresh-client integration.

## Owned settings retirement and live generation replacement — October 17

Previous turn progressed durable locators and staged indexed successor2e21.
Extended existing broker_service_retire with independent-only retire_settings:true.
Global receiver activation lock serializes settings retirement against activation;
private broker lock still covers current terminal/STOP/retired-source review.
After module retirement, exact owned policy settings are exclusively moved to
old namespace retired-settings.json, never deleted or overwritten. Ledger records
before-move/hash and retained phase; exact backup can be read as uncheckpointed
and explicitly finalized after partial move, without moving or overwriting again.
Unrelated current/successor settings are preserved; legacy route refuses this flag.

Historical-only context now inspects preserved retired source, not current watched
path. A successor can occupy that path without redefining predecessor evidence.
watchedPathAssessed:false makes this explicit; retirement ledger/STOP/inventory
remain required, so an unretired installed source does not acquire history mode.
Retired settings are verified against original policy hash and phase, independent
of a successor's current settings. Live dispatch still uses current settings and
strict installed generation; historical evidence never grants dispatch authority.
Six focused tests cover retained old settings with unrelated successor bytes,
corrupt backup refusal, missing retirement/drift and existing source/tree gates.

Actual settings-retirement jobjca3ec970640f40abbe6896a80db384de preserved original
db2 settings hash and STOP; shared settings path absent. Old history verified via
retained-settings. Then existing empty-receiver activation job
j4a980a08cc8a41feb65355053c80ac75 installed prepared successor
2e2144d47ac746cc9b6ad646578b21e2 on SAME interrupt74/PID20499/start15:48:23UTC.
Native watcher wrote fresh readiness automatically, no additional human consent.
Sealed successor source dc9604... remains distinct from current host8de1fe... .
Tool-free successor boundary jobj3dd2982ba06a48e79169c0150a39072f returned exact
SUCCESSOR_POLICY_BOUNDARY_OK/tools0. Missing-request self-test
rpeer02f63b522baf404cb8f2b5f73c6cfa21 retained valid native refusal/helper/policy
and independently terminally reviewed; no unresolved attempts.

Successor public read jobjd464f215658848479e243cd8271f6514 returned exact derived
request rpeerd464f215658848479e243cd8271f6514; receiptVerified:true,published:true,
cleanupPending:false. Native toolu_plugin_992300dcc85f4b88bfcfc3c0cc2623e8.
Target control8f session/title/cwd/archive metadata independently matches.279ms
module path, not SLA; native journal growth0. Same key reattached same job; result,
admission/control hashes unchanged. Same idle native epoch. Old STOP and retained
settings hashes unchanged; predecessor historical status still verifies while
successor is installed. Successor budget2/4 used (self-test + settled read); two
unused slots, no replay. No app restart/process signal/permission change.

Evidence existing probe/scratch-native-read-2026-10-17/empty-receiver-activation.json
settingsRetirement,successorActivation,successorBoundary,successorRefusal,successorRead.
All original retired bytes, locators and failures remain. Current successor module
and settings intentionally left live/bounded to its private deadline; old STOP stays.
Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-58-11-158Z.json.
Both filtered harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-57-58-138Z.json.
Next supported native process disposition and actual warm/cold/record-loss recovery,
current-source real harness integration and natural-pressure/always-on proof.
Manual composition of verified operations is not unattended recovery qualification.
No pending sender/worker/waiter. Goal active; Codex fixes and old d5 unknown untouched.

## Durable generation locators independent of app records — October 17

Previous turn progressed retired-history mode without native version/peer reads.
Added owned bounded global independent-service-generations/<serviceId>.json
locators: exact schema/service/session, normalized receiver cwd under PROBE_DIR,
exact derived namespace, timestamp/job identity and preparation-intent or verified-
retirement origin. No tokens. O_NOFOLLOW/owned regular file <=4KiB/stable read;
linked/foreign/malformed/oversized/out-of-scope entries refuse, never guessed path
or silent fallback. Exclusive first write is retained; matching reuse preserves
original bytes/origin, conflicting identity refuses. Locator is metadata only,
not readiness, source proof, authorization or a live-control target.

Preparation writes locator before namespace/release/candidate effects. Verified
retirement retains/backfills a locator after successful exact-owner review.
Historical inspection prefers locator, passes derived historical record to child,
and avoids app-record lookup in both layers. Missing locator retains legacy record
resolution; malformed present locator refuses rather than falling back. Child
still independently verifies namespace, watched absence, retirement/STOP/pointer/
sealed inventory/package/policy. Live operations retain app/live guards and never
use historical override. State derivation extracted unchanged into shared location
helper; existing exports remain compatible.

Five focused tests pass: first-origin preservation/conflict, missing vs invalid,
links/bounds/foreign records; retired context with app record/version/peer observers
throwing; live/installed/drift gates retained. No actual app record deleted.
Existing db2 retirement revalidated without repeating module move in durable job
jb5e48bb12140411fa90e4c6e64d91c85, then locator retained verified-retirement.
Actual public historical request succeeds with parent getRecord/versions/peerRecord
all throwing. Native child uses locator-derived record. Retirement/STOP/original
receipt hashes unchanged; evidence indexedHistoryObservation in existing plan.

Fresh indexed successor preparation only, jobj2e2144d47ac746cc9b6ad646578b21e2,
service2e2144d47ac746cc9b6ad646578b21e2/source
 dc9604e2b9f720d7f7e98275db4ece66fd4dbe205efabcb18ba13493d19eb8da.
Native validator passed; locator timestamp precedes preparation effects. No active
pointer, watched module or settings change; old STOP unchanged. Candidate retained
for future explicit predecessor transition; deadline in private preparation. Do
not activate through empty-receiver path (old settings exist), delete old history,
or replay consumed IDs. Evidence empty-receiver-activation.json locatorBackfill,
indexedHistoryObservation and successorPreparation under existing probe folder.

Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-54-43-963Z.json.
Both filtered harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-54-30-663Z.json.
Next explicit predecessor settings transition / generation replacement, supported
native process disposition and actual crash/archive/deletion/recovery qualification.
Locator+fixture proof does not claim destructive native tests or always-on success.
All old settings, STOP, retired bytes and evidence remain; no sender/worker/waiter.
Goal active, Codex fixes and old d5 unresolved self-test untouched.

## Explicit retired-history verification without live native dependencies — October 17

Previous turn progressed filesystem retirement and scoped receive interception
absence proof. Read-only process mechanism review found native-resource-process
qualifies spawned probe children, not desktop CLI retirement. No old stop grant,
process signal, native stop, app restart or session mutation used this turn.
Physical retirement still unproven; do not substitute turn-stop for process exit.

Added broker_service_status historical:true with explicit independent session.
Only retired watched-directory-absent generations qualify. Verifies retained
active pointer/sealed generator/package/inventory, own STOP, policy/settings and
attempt history; no current app-version or peer read and no current permission-
mode requirement. Live/default status and all mutation/dispatch paths retain strict
current version/peer/mode gates. Historical mode refuses requireIdle or installed
source and cannot be requested for reads or legacy status. Driver lifecycle audit
marks versions not assessed rather than resolving current versions for this path.

Output verificationMode historical-retired,nativeEpochAssessed:false, process
status not-assessed, loaderOutcome not-assessed,nativeInputRequired:null,
servingQualified:false. Readiness/native policy fields remain retained historical
observations, not new live qualification. Receipt reconciliation remains live-bound;
this change does not permit offline publication or semantic outcome rewriting.

Isolated retired fixture uses module loader hooks making versions()/peerRecord()
THROW if touched; historical verification passes even current record mode manual.
Default live path hits refused version guard; requireIdle/installed source/drifted
retirement generation refuse. Fixture owns all files and never invokes native app.
Two focused tests pass. Actual explicit historical public inspection of db2 retired
generation verifies source and history; retirement/STOP/original result hashes
unchanged. No actual process exit or app-update experiment performed. Evidence:
probe/scratch-native-read-2026-10-17/empty-receiver-activation.json
retiredHistoricalInspection. Same native host can remain alive during this test.

Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-51-53-740Z.json.
Both filtered harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-51-39-234Z.json.
Remaining: historical resolution still obtains the app's session record to derive
owned receiver cwd. Durable independent generation index is needed before user
archive/delete or unavailable record can be handled without guessing paths. Add
that before destructive-lifecycle tests, then supported physical process disposition,
generation replacement, warm/cold recovery and always-on qualification. No pending
sender/worker/waiter; all retired files/settings/STOP retained. Goal active,
Codex fixes and old d5 unresolved self-test remain untouched.

## Filesystem retirement and receive-callback absence verified — October 17

Previous turn progressed scoped quiescence. Extended existing broker_service_retire
with optional explicit receiver session; omitted session retains legacy route.
Under private broker lock require same idle native epoch, verified own STOP and
quiescence ledger hash, current terminal attempt review. Snapshot strict module
shape: three exact sealed runtime files plus only six fixed non-executable loader/
editor auxiliary paths, each <=1MiB,total<=4MiB. Reject links/unknown paths/changed
runtime bytes. Current auxiliary bytes are hashed and preserved, not qualified by
legacy289 declaration hashes. Durable before-move ledger, exclusive atomic move
of whole module into private retired-module, full inventory readback and final
files-retired checkpoint. No deletion, settings/STOP/source/receipt change.

Historical independent context now has explicit allowRetired only for status and
receipt settlement. Requires watched directory absent, exact retirement generation/
epoch ledger, own STOP and preserved inventory/package. Default read context still
refuses retired registration. Before-move/moved uncertainty can be observed as
files-retired-uncheckpointed but is not silently finalized. Successor ownership
is not inferred. Same-live-epoch requirement remains; offline historical proof is
not yet implemented. Four module-tree/routing tests plus sealed-generator test pass.

Initial pre-submit attempt found duplicate broker_service_retire name: legacy
schema rejected session before job creation/effects. Preserved failure, corrected
by extending existing optional route, added general unique-OPS invariant test.
Same original key then submitted jobj9714cc00885240de839be606544b3c4b and completed.
Exact nine-file inventory preserved outside watched path; directory absent; settings
and STOP hashes unchanged. Same key reattached same job. Fresh status verifies
sourceDisposition files-retired; historical read reconciliation receiptVerified:true,
published:false, original native tool ID unchanged. Native unload/process disposition
not claimed by filesystem result.

One scoped receive-callback absence probe after retirement: malformed owned token
which sealed old handler consumes before capacity/intent/tools if registered. No
request ID, native operation or budget slot. Persisted direct msg
d518a826-caa8-4e56-8b2b-4724ce671235 reached exact native user
1eb092ef-6e08-4319-be5a-4ed611ab4dc5, causal terminal RETIRED_CALLBACK_ABSENT,
tools0. SamePID20499/start15:48:23UTC idle; settings/STOP unchanged. This verifies
effective receive interception absent for this probe, not physical process retirement
or full resource disposal. No retry or broader model work. Evidence:
probe/scratch-native-read-2026-10-17/empty-receiver-activation.json retire and
callbackAbsenceProbe; private retirement.json retains inventory.

Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-48-33-569Z.json.
Both filtered harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-48-21-082Z.json.
Next supported native process disposition/ownership and generation replacement,
then warm/cold recovery, natural-pressure and always-on proof. Do not reuse an
old one-shot native stop grant or kill unrelated sessions. Current retired settings
and STOP retained; host process still live; no active sender/worker/waiter.
Old d5 unresolved self-test remains untouched. Goal active, Codex fixes parked.

## Generation admission stopped and quiescence verified — October 17

Previous turn progressed independently bound terminal refusal review. Added public
broker_service_quiesce(session,service_id,experimental:true). Namespace-isolated
child uses SAME private broker lifecycle lock held for complete native read
transactions. It waits for prior read completion, validates same owned idle native
context, preserves a before-stop ledger, exclusively writes generation/epoch-bound
private STOP, revalidates context and reviews all attempts while still locked.
No cancel/replay, module move, permission change, native send/unload/process kill.
Existing foreign/ambiguous STOP or partial ledger refuses; no automatic STOP clear.
A failed post-stop review preserves STOP; unresolved attempts remain unresolved.
Status now exposes admissionStopped and stopMarkerMatchesGeneration separately.
Three focused tests cover exact STOP ownership, lock ordering and failure semantics.

Actual service db2 on interrupt74/PID20499 quiescence job
jff543fcd62274e70880df8652a425162 completed: admissionStopped:true,
stopOwnerVerified:true,quiescent:true, one settled read and one terminal refusal,
no unresolved attempts. nativeUnloadQualified/processRetired:false.
Same key reattached same original job. STOP/quiescence ledger remain installed.

One explicit negative public read after STOP, jobj2d69635b156f44f49fee1f33e8b3de9c,
failed independent_service_read_refused/retrySafe:true before private request
publication. Independent review: request/native intent/native send record absent,
reservedSlots still2, STOP hash unchanged, journal growth0. Global durable read
attempt retains that definitive preflight refusal; do not replay it. No native
message or effect requested by this negative check. Original settled/refusal bytes
and old d5 generation untouched. Evidence empty-receiver-activation.json quiesce
and postStopRead under probe/scratch-native-read-2026-10-17.

Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-44-53-210Z.json.
Both filtered harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-44-37-554Z.json.
Next: exact module-tree/settings ownership-preserving retirement with STOP kept,
then independently qualify native callback unload and physical process disposition.
Filesystem move alone cannot prove native unload. Source/policy/receipt history
must remain available for read-only review after module movement; current context
assumes installed module and needs explicit retired-owner handling. Avoid using
legacy289 tooling hashes as current299 ownership proof. Recovery and always-on
still open; goal active, Codex fixes parked. No pending sender/worker/waiter.

## Missing-request refusal terminal review — October 17

Previous turn progressed native prepare/activate/refusal/read qualification.
Added narrow independent terminal review for invalid_request with missing protocol
request only. Callback marker alone still insufficient. Requires exact ready and
intent/time; live validated sealed context; same build/bootstrap/generation/session/
PID/start helper completion, correct sealed broker-check script, verified native
ancestor; matching bound policy and unique native Bash policy audit in the intent
through helper-completion interval; affirmative absence of request, control, native
admission, module result and standard result. Unexpected reads/errors remain
unresolved, not absent. Other refusal reasons remain unresolved, especially
already-dispatched. Native policy audit lacks requestId and is explicitly only a
unique temporal policy observation, never native MCP admission on its own.

Status separates terminalRefusalRequestIds from settledRequestIds. This establishes
scoped no-native-MCP callback disposition, not standard lifecycle settlement or
retirement authorization. It writes no result/control and does not clear evidence.
Six focused tests cover exact positive path, missing/foreign/duplicate/late audit,
wrong source/epoch/ancestor, competing artifacts and forged outcomes.

Actual current db2 generation review: one settled public read0a6679..., one terminal
missing-request refusal161bd0..., no unresolved attempts. Original intent/refusal/
helper byte hashes unchanged; no send. Older d5 generation remains one settled read
and unresolved9022... self-test, lacking callback marker; no terminal upgrade.
Evidence empty-receiver-activation.json terminalRefusalReview under
probe/scratch-native-read-2026-10-17. Same native contexts independently verified.

Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-42-43-959Z.json.
Both filtered harnesses ten checks pass, unchanged source/config:
pressure/harness-v2-{claude,codex}-2026-10-17T18-42-31-341Z.json.
Next: quiesce admission with scoped private STOP and revalidate all attempt state
under the correct lifecycle locks before any retirement. Status snapshots never
exclude concurrent new requests or authorize filesystem changes. Preserve native
loader-generated files and settings ownership; filesystem movement alone is not
native unload or physical process retirement. Then recovery/always-on proof.
Goal active, Codex fixes parked; no pending sender/worker/waiter.

## Native input resolved; prepared/activated receiver serving verified — October 17

Taylor enabled/submitted native hot-reload input. Goal is active again. Fresh
status independently found exact loaded notification18:39:52.035Z, same interrupt
scratch74/PID20499/start15:48:23UTC idle and unexpired installed sourcef436... .
Module session.start already wrote valid generation readiness, so no redundant
ready challenge was sent. One durable tool-free boundary job
j95479bfa9aca4ee297eff00920321b32 had exact POLICY_BOUNDARY_OK reply/tools0.

Actual policy refusal self-test request rpeer161bd008f94b49fcbac3838d16805c78,
reserved slot0, no request file. Initial caller mistakenly passed CLI peer record
instead of host target; deliver refused broker_dead before onPrepared/socket.
Failure preserved. Correct host target used SAME reserved request identity, one
persisted actual send. Native helper completed and new immutable refusal receipt
records invalid_request/nativeMcpCallsRequested0. Actual native policy audit seen,
no MCP admission/result. Pure refusal screener passes. This closes native execution
of the previously synthetic-only refusal receipt path, not full no-effect or
standard lifecycle settlement. Status still correctly calls it unresolved pending
independent terminal refusal review; do not fabricate a standard native result.

Public read jobj0a6679b396e24dcbaef705d965dd78f2 completed, exact derived request
rpeer0a6679b396e24dcbaef705d965dd78f2, receiptVerified:true,published:true,
cleanupPending:false. Exact native toolu_plugin_0fe9999c307c466fb43070b213823440.
Target control8f metadata session/title/cwd/archive state independently matches.
300ms module path, not SLA; no journal growth/model turn. Same key reattached same
job; result/admission/control hashes unchanged. Same native epoch/idle remains.
Installed servicedb2a06e219134fd78fcfa2bbb33c70a2 now budget2/4 used: one refusal,
one settled read. Keep both unused slots; never replay existing requests.

Evidence: probe/scratch-native-read-2026-10-17/empty-receiver-activation.json
humanInputResolved, policyBoundary, refusalProbe, publicRead. Private native helper,
policy audit, readiness/intent/refusal/admission/result/control retained. No runtime
source change this turn; prior final frozen-source pressure and both filtered
harnesses remain applicable (18:37:49 pressure,18:37:33 harnesses). Native module
pinned f436..., host runtime8bcd... explicitly differ. No need repeat unchanged tests.

Next implement independently bound terminal review for exact pre-dispatch refusal
(helper/source/policy/native epoch/absence checks), without equating marker alone
with no-effect or clearing legacy unknowns. Then controlled generation retirement,
physical retirement, warm/cold recovery and always-on qualification. No pending
sender/worker/waiter. Module/settings retained bounded to deadline; old d5 unresolved
self-test untouched. Goal active, Codex bridge fixes parked.

## Native loader notification observations — October 17

Previous turn progressed supported loader entry/status and requested human input.
Fresh same receiver74/PID20499/start15:48:23UTC remains waiting/input needed;
no replayed loader message, ready challenge or workload. Human response still
pending in this Codex chat. Do not manufacture or click consent.

Added bounded native loader notification reader and independent status fields.
Current installed2.1.299 Eo/Ro grammar distinguishes loaded, held (prompt cache),
unbound, failed, declined, unanswered and off. Reader uses exact live peer-owned
journal descriptor, no symlink, stable inode/size/times, at most256KiB/2048rows,
exact enqueue/session/folder and timestamps within native process epoch. It emits
metadata only; model prose/removal events/peer envelopes/foreign or future rows
cannot qualify. Later negative/deferred outcomes supersede earlier loaded rows.
Missing/changing/unreadable journal yields unavailable diagnostic without demoting
independently verified installed context. ConsentAuthorized:false and
 generationReadinessAssessed:false always; this observation never grants authority.

Actual paired check: current interrupt74 has no loader notification and is waiting;
older control8f has native loaded enqueue at17:35:34.241Z on same live epoch.
Both installed contexts still independently verified; original d5 unresolved attempt
unchanged. Evidence empty-receiver-activation.json loaderNotificationReview under
probe/scratch-native-read-2026-10-17. Three focused grammar tests pass.
Installed native prose says enable holds after restart, but no native restart or
recovery proof is claimed. No app/process/permission change this turn.

Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-37-49-486Z.json.
Both filtered harnesses ten checks pass with source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-37-33-146Z.json.
Initial pressure/harness runs overlapped the final diagnostic error-handling edit;
sourceChanged failures preserved (18:37 reports), not counted as qualification.
Next after human reply: verify actual native outcome, same idle epoch and unexpired
package; persist one ready challenge before bytes and verify exact new receipt.
Native loading/serving, policy boundary, refusal receipts, controlled/physical
retirement, recovery and always-on remain open. Goal active, Codex fixes parked.

## Supported loader entry reached native input gate — October 17

Previous turn progressed empty-receiver activation. Fresh status confirmed native
receiver74/PID20499/start15:48:23UTC idle, installed context valid, readiness and
policy loading absent. One durable direct loader-entry job
jb9331be319684c41a0b2ac01f543e741/operation interrupt-native-loader-entry-20261017
received exact native userf256a0b4-c958-4665-b82f-ff2832498648, message
14e78ad6-601c-4d4f-9c2b-77e14481a453. Requested only builtin plugin-authoring
Skill, no suggestions/files/other tools/permissions or consent-card response.
Correlated toolu_019boZfpkT2Wduc8DT6kWEcN invoked Skill once with successful native
result. Model claimed no human consent pending; native peer independently changed
to waiting/input needed. Do not accept model claim as native state proof.

Public status now reports nativeInputRequired:true plus observed activation phase
installed. Checkpoint phases never imply effects; activationEffectsAssessed:false.
Readiness and native policy remain false, reservations/attempts zero. No ready
challenge or workload sent; no duplicate loader message. Private evidence:
probe/scratch-native-read-2026-10-17/empty-receiver-activation.json loaderEntry.
Human question pending in this Codex chat: inspect Claude Desktop existing
claude-driver-interrupt-scratch-2026-10-15; if Enable hot reloading for this session,
choose Enable for this session and Submit, otherwise report exact prompt wording.
Skill explicitly forbids agent clicks on approval cards. Do not forge/replay input.
This is native input gating, not a broker crash or permission-mode failure.

Final pressure1/1pass: pressure/v2-2026-10-17T18-35-12-474Z.json.
Both filtered harnesses ten checks pass with unchanged source/config:
pressure/harness-v2-{claude,codex}-2026-10-17T18-34-58-508Z.json.
Added strict phase-only ledger summary with regression for foreign ID, malformed
phase/time/build and false serving claims. Partial activation status can retain
observed phase even when installed context unqualified; status never resumes effects.
Next after human response: verify same epoch, idle, unexpired bytes/config and
actual consent/loading evidence before a single persisted ready challenge. Then
qualify policy boundary/refusal receipt/public read. Independent work may continue
on lifecycle recovery; no goal completion/blocked claim. Original d5 unresolved
self-test and Codex bridge fixes remain untouched.

## Empty-receiver activation installed; readiness pending — October 17

Previous turn progressed attempt inventory. Added broker_service_activate for a
prepared generation on an explicit empty driver-owned idle bypass scratch receiver.
Refuses existing settings, module, broker directory or activation ledger; never
replaces a predecessor. Global receiver lock, exact native epoch and sealed package
validation precede effects. Durable before/after phases cover policy, pointer,
exclusive settings creation and exclusive module publication. No sends/wakes,
permission changes, retries or automatic rollback across publication uncertainty.
Interrupted work must inspect original ledger. Four focused tests cover phase
ordering, every effect failure, preflight/checkpoint refusal and actual path absence
versus symlink/invalid traversal. Status now permits missing readiness as false
while retaining verified installation context; malformed evidence still refuses.

Actual existing interrupt scratch local_74c54e49-972e-4dac-adfa-d23e01316119,
PID20499/start15:48:23UTC/CLI2.1.299, bypass/idle, had no settings or receiver module.
Preparation jobjdb2a06e219134fd78fcfa2bbb33c70a2 staged service
db2a06e219134fd78fcfa2bbb33c70a2 with sealed source
f436afc5498723b6981332ef48a0575ee65bd9b83fd0070c68ac4fbec2171973.
First activationjf35a66968b394585bea11a89e8409b04 failed before ledger/effects:
inverted path absence helper threw on ENOENT. Independently verified all four effect
paths absent; retained diagnostic and original failure. Fixed helper with filesystem
regression. Corrected jobj87eaf18de57349f6aab4950417a2d09e completed installed.
Same key returned same job. Fresh status verifies sealed package/settings/policy/
pointer and exact native epoch; ledger installed. Zero reservations/attempts.
readinessObserved:false,nativePolicyObserved:false,servingQualified:false.
No message was sent and no model/tool request was made to the new receiver.

Evidence: probe/scratch-native-read-2026-10-17/empty-receiver-activation.json;
private service preparation/activation and validation artifacts retained. Installed
module/settings left bounded to this service deadline; don't replace/delete them.
Original d5 receiver8f remains intact with one unresolved historical self-test.

Next: independently qualify module loading/human hot-reload consent on interrupt
scratch74 before a single persisted ready challenge; never infer loaded state from
installation or send return. Then exact tool-free settings boundary and new refusal
receipt qualification, followed by public reads and controlled retirement. Missing
consent is human-only; do not click a native approval card. No CUA/keyboard fallback.
Final frozen-source pressure1/1pass: pressure/v2-2026-10-17T18-33-23-223Z.json.
Both filtered harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-claude-2026-10-17T18-33-09-562Z.json and
pressure/harness-v2-codex-2026-10-17T18-33-09-563Z.json.
Physical retirement, warm/cold recovery and always-on proof remain open. Goal active;
Codex bridge fixes parked. One early Claude harness overlapped diagnostic source
change and failed sourceUnchanged only; preserved, superseded by frozen-source runs.

## Independent terminal-attempt inventory — October 17

Previous turn made progress: public preparation and refusal receipts published.
Activation review now adds read-only attempt inventory to independent status.
It unions validated budget reservations with raw owned native intents, including
attempts absent from host slots. Only full exact ready/intent/request/helper/native
admission/control/runtime-policy binding review plus an already-published matching
standard result counts as settled. Missing/malformed receipts remain unresolved.
Refusal callbacks are listed separately and remain unresolved; this inventory
never publishes, reconciles, authorizes retirement or claims native unload.
Current-source pressure1/1pass: pressure/v2-2026-10-17T18-29-49-457Z.json.
Both filtered harnesses ten checks pass with unchanged source/config:
pressure/harness-v2-claude-2026-10-17T18-29-38-413Z.json and
pressure/harness-v2-codex-2026-10-17T18-29-39-555Z.json.
Four focused tests cover raw intents, missing records, forged publication,
foreign/bounded inventory, successful result and corrupt admission/publication.

Actual installed d5 generation status independently verified same receiver8f,
PID42813/start16:03:11UTC, idle; one settled native read b584..., one unresolved
policy self-test9022.... The self-test retains exact native helper completion but
lacks historical callback refusal receipt. No inferred no-effect, retroactive
receipt or replay. Intent/helper/original native result hashes unchanged across
review. Evidence: public-read-d5e108a08b91ff3f3260f2a89b8d8584/plan.json
attemptReview under probe/scratch-native-read-2026-10-17.

This blocks blind replacement of this generation, not all engineering progress.
Next activation implementation should support a verified empty owned scratch
receiver separately from predecessor transitions; preserve the old generation
and its unresolved history. An expired deadline alone never clears attempts.
Then qualify new refusal receipts natively and implement controlled retirement.
Physical process retirement, recovery/always-on remain open; goal active.

## Public preparation verified; refusal receipts added — October 17

Added broker_service_prepare as a durable preparation-only operation for an
explicit driver-created, idle bypass scratch receiver. It stages a new private
sealed release and candidate, validates it with native CLI, and retains phase and
validation evidence. It does not publish a watched module, change settings,
activate a pointer, send a message or establish serving readiness.

Actual job j10f4fc1039314bd5bb6e4365e26843c9 completed on receiver8f1d6d55,
service10f4fc1039314bd5bb6e4365e26843c9, source
c2e77508ed0706b6b34e0bf02b4b6afe2476df873933fa0527c891bb3a073c7f.
Native validator passed with author-attribution warning. Independent readback
confirmed phase prepared, candidate present, runtime pointer absent, installed
module/settings hashes unchanged. Same key reattached the same job. Evidence:
probe/scratch-native-read-2026-10-17/public-read-
d5e108a08b91ff3f3260f2a89b8d8584/plan.json publicPreparation (one directory name).
The existing d5 generation remains installed with capacity2/2 used; no replay.

Candidate now retains exact helper dispatch:false callbacks in immutable bounded
.no-dispatch.json receipts. Unknown/malformed replies and native-call failures
never become refusal receipts. Pure screener verifies ready/intent/identity/time
and reports callbackRefusalObserved only; noEffectQualified, lifecycle settlement
and release authorization remain false. Seventeen focused tests pass. This new
receipt path is synthetic-tested, not yet native-executed.

Current-source pressure1/1pass: pressure/v2-2026-10-17T18-27-55-988Z.json.
Both filtered harnesses ten checks pass, source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-27-43-116Z.json.
Next: owned module/settings activation transition, terminal attempt review and
controlled retirement before fresh native refusal qualification. Physical process
retirement, warm/cold recovery and always-on proof remain open. No pending native
send or waiter. Goal active; Codex bridge fixes and legacy22unknowns untouched.

## Pinned receiver survives workspace candidate updates — October 17

Enrollment review found durability bug: independent context rebuilt expected module
bytes from mutable workspace factory. A routine candidate update would invalidate
otherwise sound pinned receiver/receipt. Context now validates the release and
uses that sealed generation's package generator. Config build and namespace
capability must match; no arbitrary generator root. Context becomes async; read
prepare/revalidate, settlement lock and read-only status await it. All ownership,
policy, epoch, native admission and original receipt checks remain.

New isolated clone regression stages a release, deliberately appends a candidate
workspace revision, confirms mutable package hash changes, then requires sealed
expected hashes remain original. First fixture failed before staging due nested
JS newline syntax; preserved diagnostics/sealed-service-generator-fixture-failure-
2026-10-17.json. Corrected fixture passes; no native operation in either run.

Live existing d5 generation/buildb7 status still verified; reconciliation returned
receiptVerified:true,published:false and native result hash unchanged. Evidence:
public-read-d5e108a08b91ff3f3260f2a89b8d8584/plan.json sealedValidation. No module,
settings, policy or process changed this turn; no worker/waiter remains.

Final unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T18-20-52-573Z.json. Both filtered harnesses ten checks pass,
source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-20-38-896Z.json.
Shared service memory saved. Next public enrollment needs explicit owned-settings
and module transition handling, durable phase identity and terminal attempt review;
then controlled retirement, process retirement, recovery and always-on proof.
Goal active; legacy22unknowns untouched and Codex bridge fixes parked.

## Corrected native recovery ID live-verified; independent status added — October 17

Previous turn: public read succeeded but dispatcher dropped jobId; code fix tested.
Fresh controlled generationd5e108a08b91ff3f3260f2a89b8d8584 on same receiver8f1d6d55,
PID42813/start16:03:11UTC/CLI2.1.299; sealed build
 b7ede2c8ed8a4f18fdde2643cbc4adde6f85a000a50d7f9aeaca9b366f4e4e39.
Native-valid package/owned module and policy transition, ready receipt and exact
PUBLIC_READ_BOUNDARY_OK boundary. Host budgetslot0 reserved for missing-request
hook qualification; exact policy audit and completed helper matched before workload.

Actual public durable jobjb584c0225ce94277bb54827f866c05ea returned native request
rpeerb584c0225ce94277bb54827f866c05ea exactly. Verified same identity in global durable
attempt (jobId linked), private request, progress, native MCP admission and fresh
published result. Exact native toolu_plugin_b9448952438048adb77da5f3f10c7038;
target scratch74 identity/title/cwd independently matched. Completed/receiptVerified,
published:true,cleanupPending:false.266ms module path, not SLA. Same live native
epoch/idle/bypass and descriptor-bound journal unchanged. Same key reused same job;
result/admission/control hashes unchanged. This closes corrected ID mapping proof
for this native source; earlier ff3098... mismatch remains preserved as failure.

Added optional explicit session to read-only broker_service_status, legacy route
unchanged. Independent status uses namespace-isolated child/context verification,
returns exact epoch/source/generation/deadline and historical readiness/policy audit,
plus validated host budget reservations. It never dispatches/reconciles/installs or
claims serving from metadata: servingQualified:false,recoveryAttempted:false.
Reports unreserved slots, not native capacity proof. Malformed/duplicate/foreign
reservation rows refuse; unknown context returns verified:false with generic reason.

Actual status verified current d5 namespace, reservedSlots2/unreservedSlots0
(self-probe+read). Wrong receiver74 returned unqualified without recovery; native
result hash unchanged. Focused budget/identity tests pass. Evidence:
probe/scratch-native-read-2026-10-17/public-read-
d5e108a08b91ff3f3260f2a89b8d8584/plan.json (single directory name), public-current.json.
Source/settings backups preserved; both module slots used, no replay or live job.

Final unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T18-16-42-770Z.json; both filtered harnesses ten checks pass,
source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-16-29-364Z.json.
Shared service memory saved. Next: public enrollment/qualification orchestration,
controlled generation retirement and status/cleanup integration, then physical
retirement, warm/cold recovery and always-on pressure proof. Legacy22unknowns and
old broker untouched; goal active, Codex bridge fixes parked.

## Public native read published; recovery ID forwarding fixed — October 17

Previous turn: public independent reconciliation passed. Existing broker_service_read
now takes optional receiver session (session_id remains target); omission preserves
legacy route. Independent worker starts in explicit derived private state, reuses
runNativeServiceReadTransaction, durable budget/enqueue/claim/checkpoint, one send,
shared settlement and cancellation cleanup. Context/settlement extracted for reuse;
all source/ownership/policy checks retained. Prepare/revalidate require idle exact
native epoch, current readiness, controls absent, and matching actual native Bash
policy audit. No policy audit means no workload enqueue. Parent retains a durable
attempt, reports original request identity, never relaunches an uncertain request.
Child SIGTERM requests normal transaction cancellation; lost child is outcome_unknown.

Fresh controlled namespaceff3098d69be3c58ae94feb727d9e8c23, sealed initial build
 a6082237f43ae6b7c8debcdfb7d259ccfb3c85e061ee9c946589786a7b82338f,
same approved receiver8f1d6d55/PID42813/start16:03:11UTC/CLI2.1.299. Native-valid
package, owned module/settings transition and exact tool-free PUBLIC_READ_BOUNDARY_OK
reply. Reserved host slot0 for missing-request policy self-test, matched actual
hook audit and retained helper. Then actual public durable job
ja2045f2f6d0c47279c0f4fd0a33a5b62 executed read through API, freshly published:true,
receiptVerified:true,state completed, cleanupPending:false. Exact native admission
 toolu_plugin_34126484afa94d7597c68e7fe783f08d, target metadata independently
matches approved scratch74.335ms module path; same native epoch/idle/bypass,
descriptor-bound journal growth0. Same key reused same job; original result,
admission and control byte hashes unchanged. This is fresh public publication.

Actual smoke also found recovery identity bug: worker passed jobId but runOpInner
dropped it. Request used random rpeer1953181612b34fe99394bd754f55275c instead of
rpeera2045f2f6d0c47279c0f4fd0a33a5b62. Native read/settlement remains valid; do not
rewrite it or claim job-derived recovery passed. Fixed dispatcher option forwarding
and validation; new regression exercises runOp into actual operation context. ID
factory tests and existing transaction cancellation/partial enqueue/cleanup tests
pass. Corrected mapping still needs fresh native trial; this module capacity2/2
used and must not replay. Evidence plan publicRead.identityBug preserves mismatch.

Evidence: probe/scratch-native-read-2026-10-17/public-read-
ff3098d69be3c58ae94feb727d9e8c23/plan.json (one directory name), public-current.json.
Prior source/settings preserved. Current policy/module left bounded, no running
worker/waiter. Public enrollment/status/controlled retirement still require
integration, followed by physical retirement and recovery/always-on qualification.
Goal active; legacy22unknowns untouched and Codex bridge fixes parked.

Final post-fix unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T18-13-32-927Z.json; both filtered harnesses ten checks pass,
source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-13-19-990Z.json.
Earlier18:11runs/native read predate ID fix and do not qualify corrected mapping.
Shared service memory recorded.

## Public durable independent result reconciliation — October 17

Previous turn: actual native read settled and pre-dispatch cancellation passed.
Added explicit optional session to existing broker_service_result_reconcile.
Without session, legacy route unchanged. With exact receiver session, host derives
only <receiver cwd>/.claude-driver-services/<service_id>, starts a bounded child
with that state env before any lifecycle import, and never sends/dispatches.
No caller-supplied filesystem root. Current qualification remains explicit
app2.42304.0/CLI2.1.299, bypass, live exact peer and bound source/namespace.

Child verifies owned nonsymlink state, sealed active release/bootstrap/inventory,
actual peer PID/start/cwd/session, generated installed package byte hashes, policy
settings path and script/settings hashes, request generation/effect-policy binding,
ready/intent/retained checkpoint/admission/result/control through existing pure
screenNativeServiceResult. Under request lock it publishes standard native result
if absent or requires exact semantic equality if already present, then reads back.
Returns settlement metadata only, preserves controls. Bad context/refusal sanitized;
no retry or wake. Two focused namespace/schema tests pass; legacy opt-in preserved.

Actual public durable jobj9215e84fc3a043c590ea85684f7bd84a completed for native
request rpeer747057b883f24a86cc86818bb98a1497 with explicit receiver8f1d6d55 and
service18e7d5f05162d0a528bef47cc51c6c47. receiptVerified:true,state completed,
published:false, exact original toolu_plugin_65d72aa3eb704830910b8f4079e6568f.
Same idempotency key reused same job; no new worker dispatch. Reconciliation works
from retained per-request entry after subsequent cancellation helper changed shared
entry. Wrong receiver(target74 instead of receiver8f) returned failed with
independent_service_result_refused; original result/control/admission hashes
unchanged. No namespace files created there or native operation sent. Evidence:
admitted-read-18e7d5f05162d0a528bef47cc51c6c47/plan.json publicReconcile.

This proves public reattachment/idempotent review of an already-published real
receipt, not fresh public-route publication or independent public enrollment/read.
Those remain next integration steps, followed by retirement and recovery/always-on.
New public host build differs from unchanged native sealeda856...; both are recorded
in job/source evidence. No native module/settings/policy changed this turn.

Final unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T18-07-42-302Z.json. Filtered Claude/Codex(gpt-6-sol) ten
checks each pass; configs/source unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T18-07-29-865Z.json.
Shared service memory recorded. All owned jobs terminal; no waiter running.
Old22unknowns untouched; goal active, Codex bridge fixes parked.

## Actual admitted read settled; pre-dispatch cancellation verified — October 17

Previous turn: actual current hook loading passed. Fresh bound generation
18e7d5f05162d0a528bef47cc51c6c47 on same control scratch8f1d6d55/PID42813/start
16:03:11UTC/CLI2.1.299. Same sealed sourcea856cf95d1b6f4bdea8f5a4b2338bb0ec041ac6bdbedaac92d1449a8ce578182.
Preserved prior module/settings, native validation and owned register transition,
bound readiness verified. Replaced only task-owned receiver settings after exact
prior hash check, private policy first. Durable boundary job
j4add3080565b41969742e7bebe84207f had exact ADMITTED_READ_BOUNDARY_OK reply,
tools0, terminal idle. No legacy pointer/policy/request changed.

Actual request rpeer747057b883f24a86cc86818bb98a1497 used existing sealed
publishNativeServiceReadRequest/reserve budget/enqueue/pickupPending in isolated
state. Exact native observation and full runtime generation binding included;
policy references current handler/settings hashes. One persisted direct send.
Sealed completed checkpoint, actual native MCP admission
 toolu_plugin_65d72aa3eb704830910b8f4079e6568f, and module get_session result
correlate exactly. Target approved interrupt scratch74c54e49 identity/title/cwd
matches independent read. Pure screenNativeServiceResult passed. Existing
writeJsonAtomic published standard results/<id>.native.json; inspectRequest
independently returned completed/ok. Module path289ms, not an SLA. Same native
PID/start/bypass/idle, installed module/settings hashes and descriptor-bound
journal unchanged; zero model inference during operation.

Settlement-only failures preserved: first inline helper had JS quoting SyntaxError
before executing; corrected saved helper v1 then found results directory absent
at publication. Neither resent native work. Saved syntax-checked helper reused
existing writeJsonAtomic (creates directory) and settled the same receipt.
Artifacts settlement-output.txt,settle-reviewed-v1.mjs,
settlement-publication-failure.json,settle-reviewed.mjs retained.

Second request rpeereaeea3347942f7d826e42d3126f76f69 published/claimed then
cancelled through existing cancelRequest before one callback send. Exact retained
completed sealed helper observed; control remains cancelled/cancelRequested with
zero dispatched slots. Native admission/module result/native result all absent;
intent proves callback reached. Same native epoch/idle/bypass, journal unchanged.
No model turn. This qualifies actual pre-dispatch cancellation, not cancellation
after a native call begins. Generation capacity2/2 used; never replay either ID.

Evidence: probe/scratch-native-read-2026-10-17/admitted-read-
18e7d5f05162d0a528bef47cc51c6c47/plan.json (single directory name), pointed to by
admitted-current.json. State/module/policy retained, no live worker/waiter job.
Service memory recorded. Runtime source unchanged; passing pressure17:57:53.349Z
and both filtered harnesses17:57:41.045Z remain applicable to source. Native
qualification now includes actual read admission/receipt and pre-dispatch cancel.

Next: integrate independent enrollment/read/reconciliation into durable public
v2 jobs with exact namespace/version/ownership guards; current public legacy
routes remain guarded and were not bypassed to claim general readiness. Then
controlled generation retirement, process retirement, warm/cold recovery and
always-on pressure qualification. Old22unknowns untouched. Goal active; Codex
bridge fixes parked.

## Actual current hook loaded after settings turn boundary — October 17

Previous turn: current bound identity candidate passed in isolation. Added pure
buildNativeServicePolicy: receiver-cwd .claude/settings.json with PreToolUse only;
private namespace stop-rescue-policy.json stores exact settingsPath/hash, sealed
handler hash, binding and native epoch. No Stop/quiet/rescue or permission allow.
Native MCP guard resolves settings path only with exact current binding/epoch;
legacy settings path remains unchanged. Bound Bash hook logs one sanitized native
invocation before admitted checkpoint, with toolUseId/epoch/build/generation and
handler/settings hashes; duplicate ID refuses. Isolated policy tests cover path,
source,epoch and unsupported fields; actual hook fixture verifies audit/no replay.

Fresh namespace83ada8d22920716010cc15df3f767f54, sealed build
 a856cf95d1b6f4bdea8f5a4b2338bb0ec041ac6bdbedaac92d1449a8ce578182,
prepared on same owned scratch8f1d6d55/PID42813/start16:03:11UTC/CLI2.1.299.
Preserved old module; native validation then owned register update. First ready
challenge reached model before reload; subsequent session.start readiness wrote
bound receipt. Failure retained. Installed settings only in that scratch's cwd
(previously absent); private policy published first. Legacy broker untouched.

First missing request rpeer614c4593e6103ea4b9fa20dc1645aceb executed sealed helper
but audit absent: hook loading unproven. Retained this failure, no native request
or metadata operation. Then durable boundary jobjd1cf5c94982d43dda618db070f1313fa
had exact POLICY_BOUNDARY_OK reply, tools0, terminal idle. Second distinct missing
request rpeera48b0f92358381f0c6e3f92742d6b2ba generated actual native policy audit
 toolu_plugin_00853ab1932e409a8a1e926a2757a321 at17:59:09.967Z and exact retained
completed sealed helper entry at17:59:10.112Z. Verified current native epoch,
source/bootstrap/generation, handler/settings hashes, request/control/result
absence and descriptor-bound journal unchanged. This establishes actual current
PreToolUse command-hook loading after boundary, not native MCP admission.

Evidence: probe/scratch-native-read-2026-10-17/policy-
83ada8d22920716010cc15df3f767f54/plan.json (one directory name), pointed to by
policy-current.json. Module capacity2/2 used; never replay. Settings/policy/module
retained for next controlled transition, no background worker/waiter running.
Next: fresh bound generation and owned settings update, then standard lifecycle
fixed scratch metadata read with actual native MCP admission consumption and
independent persisted result verification. Physical retirement, cancellation and
recovery/always-on remain separate gates. Goal active; Codex fixes parked.

Final unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T17-57-53-349Z.json; filtered Claude/Codex(gpt-6-sol) ten
checks each pass and configs/source unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T17-57-41-045Z.json.
Shared service memory recorded. Old22unknowns and old policy remain untouched.

## Current independent PreToolUse identity candidate — October 17

Previous turn: actual independent sealed missing-request checkpoint passed. Review
found native PreToolUse identity/cwd checks still hardcoded2.1.289 and cwd==broker.
Added nativePolicyPeerMatches shared pure predicate: version2.1.299 requires exact
opt-in serviceStateBinding, receiver cwd/session/PID/start/desktop/not spare or
parked; unbound legacy remains2.1.289/cwd equality. Both native MCP and Bash
PreToolUse branches retain native ancestry, sealed source, dispatch/policy checks;
bound modes additionally require release namespace capability. Outer cwd gate
accepts receiver cwd only through exact bound pointer. Stop/quiet/rescue behavior
was not broadened or qualified for299.

Isolated actual command-hook subprocess fixture with synthetic owned native
ancestry admits current bound checkpoint without permissionDecision allow;
missing capability,289-as-bound,wrong cwd deny. Pure identity matrix refuses
foreign epoch/version/parked/spare. Existing legacy hook suite passes. These are
not actual desktop hook execution, MCP admission or installation evidence.
No live settings, policy, pointer or module changed this turn.

Also caught package/guard mismatch: factory single-quotes paths but old parser
only understood double/unquoted. Restricted grammar now accepts exact shell
single-quote encoding (including embedded apostrophe), rejects expansion syntax
outside literal quotes, and safely rewrites special paths. Actual sh round-trip
from bound factory through adapter preserves exact script/request/index/dir argv
with apostrophe,$(),backticks. Existing cached-path/foreground restrictions pass.

Final unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T17-55-06-932Z.json; both filtered harnesses ten checks pass,
source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T17-54-53-760Z.json.
Shared service candidate memory recorded. Earlier17:54checks predate quote fix.
Next: binding-aware policy/settings placement and independently observed actual
hook loading on exact receiver; do not assume nested broker/.claude/settings is
loaded by session whose cwd is receiverCwd. Stage new sealed generation before
installation; existing private ee9e... namespace remains earlier build e8eee...
and unchanged. Only after actual effect gate qualification enqueue fixed scratch
metadata via standard lifecycle. Legacy22unknowns untouched; goal active, Codex
fixes parked. Retirement/recovery/always-on requirements remain open.

## Actual independent sealed checkpoint executed — October 17

Previous turn: isolated namespace binding passed. Receiver package now accepts
explicit serviceStateBinding only when id/session/build/path match. Receiver cwd
is distinct from private broker state; canonical package contract is preserved.
Checkpoint selects sealed release beneath private state root. All shell paths
are single-quoted safely, including apostrophes/$()/backticks; actual sh argument
round-trip regression verifies exact argv. Bound resource-probe mode refuses
rather than using canonical resource paths.14 focused service tests pass.

Actual owned control scratch8f1d6d55,PID42813/start16:03:11UTC/CLI2.1.299,
idle/bypass: prepared new independent namespace id
ee9e54bb05ca3b6652c3ce5eebdfe98d beneath its cwd, staged sealed current release
 e8eee705c72f90271e83e142b458655782b291c139da88690c4486b7a8ba58c7,
committed only that new private pointer with exact state binding. No legacy
broker pointer/policy/settings/request changed. Native plugin validate passes;
exclusive new desktop-bridge-native-peer-service publication. Exact ready
challenge produced valid bound ready receipt with no native journal growth.

Sent fixed missing request rpeer35b58cdcf9f8726d5abe7c1ae86d453a once, persisted
attempt before socket. Real module called sealed broker-check. Retained completed
entry binds bootstrap5ce01e1d8ddee18ca6d07d6cdd615dcd994673c61f054b90758b50fcfecd9c28,
generation1, exact native session/PID/start and verified actual ancestor. Entry
completed17:52:22.659Z. Independently verified every sealed inventory hash, intent,
request/control/native-result absence, same native epoch/idle/bypass and descriptor-
bound journal unchanged. This qualifies actual independent-state helper execution
and missing-request refusal, not an admitted native metadata read or effect policy.

Evidence: probe/scratch-native-read-2026-10-17/independent-
ee9e54bb05ca3b6652c3ce5eebdfe98d/plan.json (single directory name, no newline).
independent-current.json points to it. State/module retained and bounded one hour,
maxRequests2, one missing-request attempt used. No waiter/background child remains.
Do not replay it. Next: install and qualify independent generation-bound native
admission policy, then standard lifecycle fixed scratch metadata read. Keep old
MOD_PROBE/version guards and22unknowns intact. Actual physical retirement and
warm/cold recovery remain separate requirements. Goal active; Codex fixes parked.

Final unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T17-51-59-834Z.json. Both filtered harnesses pass ten checks,
source/configs unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T17-51-47-406Z.json.
Shared service memory recorded. Native evidence is specific to the sealed build.

## Independent state binding for sealed helper; early timer failure fixed — October 17

Previous turn: actual module reload fence qualified. Durable helper nativeBinding
required record.cwd===broker dir, preventing independent state under the approved
scratch cwd. Added opt-in serviceStateBinding version1: exact id32hex, receiver
session UUID, normalized receiverCwd, release build, and exact path
<receiverCwd>/.claude-driver-services/<id>/broker. Pointer and release capability
must match; new snapshots declare nativeServiceStateBindingVersion1. Existing
activations without this field retain their exact cwd equality rule. No live
pointer, broker.json, module, policy or native state directory was changed.

Standalone sealed entry retains actual native session/PID/start/ancestry checks;
new namespace path components must be owned nonsymlink directories. Activation
and activeRelease validate binding shape and release capability. New isolated
service-state-binding tests execute the real sealed missing-request checkpoint
with synthetic owned process metadata. Successful synthetic ancestor entry is
recorded; altered binding/cwd, missing capability and symlinked namespace refuse.
This qualifies isolated helper admission only, not actual desktop enrollment.
Next: wire current receiver package/config to this independent state binding,
then qualify its sealed checkpoint and native effect policy before durable reads.
Do not reuse legacy broker state or relax its MOD_PROBE/version guards.

Pressure initially failed1/411 at native-resource-program deadline test:
pressure/v2-2026-10-17T17-49-20-931Z.json retained. Resource child timer could fire
slightly before wall deadline and falsely record reason deadline. Callback now
rechecks/rearms until deadline; deterministic early-timer fixture plus actual
self-exiting child pass. No assertion weakened or failed artifact removed.

Final unchanged-source pressure1/1pass:
pressure/v2-2026-10-17T17-50-00-365Z.json. Filtered Claude/Codex(gpt-6-sol) both
pass ten checks and unchanged global configs:
pressure/harness-v2-{claude,codex}-2026-10-17T17-49-48-336Z.json.
Shared service memory saved. Native scratch remains unarmed after reload;
physical retirement, actual independent-state enrollment, recovery and always-on
proof still open. Goal active; old22unknowns untouched, Codex fixes parked.

## Actual reload invalidates prior readiness — October 17

Previous turn: candidate readiness and source provenance fixed. Current durable
read path is intentionally tied to canonical broker state/sealed native policy;
substituting scratch session/cwd would bypass ownership. That integration remains
open; no legacy guard weakened or unknown request adopted.

Added bounded scratch stale-readiness refusal evidence: when a module instance
has not initialized readiness but its prior ready file exists, it writes one
fixed-generation refusal receipt (no native call), then consumes the read. Five
focused tests pass. Updated only the task-owned register source after exact old
hashes, idle bypass/same epoch checks and native plugin validation. Preserved
source/config; reused generation deliberately only to prove refusal after reload.

Actual native boundary turn via durable job j19cc8f64b0994ab1a49dabe8b4c81aaa:
exact peer user9b0f2aca-c628-4aaa-aa22-2bb539e74292, exact reply
RELOAD_BOUNDARY_OK, tools0, terminal idle. Then previously unused metadata slot1
was sent once with persisted attempt. Updated module emitted owned exact
stale-ready receipt for slot1, nativeCallsRequested0; intent/result absent.
Descriptor-bound journal unchanged across request, same PID42813/start16:03:11,
bypass/idle, package hashes match. This verifies actual module activation fence
while old ready file remains; not native process retirement or full generation
turnover. Current module is unarmed. Fresh config/generation required next;
never replay slot0/slot1. No background process/job remains running.

Evidence: probe/scratch-native-read-2026-10-17/readiness-c815b8b299ae/plan.json,
reloadTrial plus preserved reload-refusal package/source/validation. Shared service
memory recorded. Pressure1/1pass, source unchanged:
pressure/v2-2026-10-17T17-46-55-446Z.json. Both filtered harnesses pass:
pressure/harness-v2-{claude,codex}-2026-10-17T17-46-43-511Z.json.
Next: design explicit independently owned service state/native policy binding for
current-version durable enrollment, then integrate standard checkpoint admission;
retain old unsettled requests in their generation. Physical retirement/recovery
and always-on qualification remain open. Goal active; Codex bridge fixes parked.

## Candidate activation gate and runtime dependency provenance — October 17

Previous turn: actual bounded scratch readiness/read succeeded. Existing durable
service host already screens readiness at enrollment and read admission. Candidate
receiver itself lacked activation gating, so it now requires its own successful
in-memory initialization and ready-file presence before any lifecycle checkpoint.
Exact token+ready is consumed as a zero-native-operation activation challenge;
foreign/expired identities, persistence errors and stale receipt after module
reload cannot arm it. Fresh configuration/generation is required after reload.
Plain and optional marker variants both set readiness only after successful owned
receipt publication. Existing cancellation/capacity/STOP and duplicate protections
remain.13 focused service tests pass. This candidate was not loaded into legacy
broker; no legacy version/epoch/baseline guard was relaxed.

Review also found package generators read candidates/*.js that runtimeFingerprint
and sealed snapshots omitted. Runtime identity now includes recursively discovered
candidate JS, releases copy candidates, and standalone pinned entry computes the
same identity. Historical releases without candidates keep their prior formula.
Regression proves candidate-source mutation makes loaded runtime stale and refuses
effects before resolution; sealed snapshot can actually generate a candidate
package.22 release/freshness tests pass. No live pointer or sealed release changed.

First pressure report17:43:52.104Z has ok:false/sourceChanged:true because test
source changed during that run; retained. Earlier harness passes predate final
provenance change and do not qualify final source. Final unchanged-source evidence:
pressure/v2-2026-10-17T17-44-59-485Z.json,1/1pass; filtered Claude/Codex(gpt-6-sol)
pressure/harness-v2-{claude,codex}-2026-10-17T17-44-47-666Z.json, all ten checks
pass and configs unchanged. Shared service candidate memory recorded.

Next: current-version durable enrollment needs an explicit owned scratch service
binding and lifecycle checkpoint integration, rather than loosening legacy hardcoded
MOD_PROBE guards. Keep actual scratch serving proof separate from this synthetic
candidate gate. Then qualify generation turnover, physical retirement, cold/warm
recovery and always-on behavior. Current bounded scratch module files retained,
no background jobs, original unknowns untouched. Goal active; Codex fixes parked.

## Explicit readiness precedes bounded native workload — October 17

Previous turn: actual module read verified after reload boundary. Scratch module
now recognizes fixed token+ready, validates exact receiver/cwd/lifetime, writes
one generation-bound ready receipt with nativeCallsRequested0, then arms its
in-memory readiness. Reads refuse before that handshake or if receipt disappears.
An existing ready file cannot arm a fresh module instance; it refuses rather than
overwriting. Reload requires a fresh configured generation. Five focused tests
pass, including pre-read refusal, duplicate ready, stale receipt, wrong identity,
expiry, concurrency and two-slot limit. No public generic relay added.

New native trial: probe/scratch-native-read-2026-10-17/readiness-c815b8b299ae.
Preserved previous module source; native validation passed; updated only owned
register file atomically after exact original hashes and idle bypass epoch check.
First zero-operation challenge reached model before reload, no ready receipt;
retained failure. After its turn ended, second challenge produced exact bound
ready receipt without journal growth. Verified receipt/time/target/cwd/package
hashes/same PID42813-start16:03:11 before dispatching metadata slot0. Its native
get_session result matches independent target scratch74 identity/title/cwd,
isError:false,25ms. Descriptor-bound native journal unchanged across read; zero
assistant rows. Slot1 unused, no native mutations or model calls by module.
This is scoped serving/readiness evidence, not always-on or recovery proof.

Current-source pressure1/1pass: pressure/v2-2026-10-17T17-42-03-138Z.json.
Filtered Claude/Codex(gpt-6-sol) both pass ten checks, unchanged source/config:
pressure/harness-v2-{claude,codex}-2026-10-17T17-41-50-767Z.json.
Shared service candidate memory recorded. Next: durable enrollment integration
must verify an activation receipt before workload and handle generation reload
without replay. Then qualify unload/retirement/recovery; old broker22unknowns
remain untouched. Current bounded module files retained, no background job
started. Goal active; Codex bridge fixes parked.

## Native module metadata read served after turn boundary — October 17

Native journal queue-operation at17:35:34.241Z confirms the person enabled
hot reloading and the session modules loaded. Same receiver control8f1d6d55,
PID42813/start SatOct17 16:03:11UTC/CLI2.1.299, idle/bypass. Original probe
734f4d34 expired17:37:13.210Z; unused original slot1 was never sent. Preserved
original plan/source, generated a fresh fixed-target two-slot one-hour config,
native plugin validation passed, verified all original owned package hashes,
then atomically replaced only task-created hooks/register.js. Native-generated
files preserved; no app settings or consent records written.

Evidence: probe/scratch-native-read-2026-10-17/renewed-fe63e48580f5/plan.json.
Fresh probe226f9b7fd0e21dcaa54c82e4f159660e slot0 peer msg
69f0b76f-935f-4eb0-b24c-3ad11bbaad88 reached native user
 ae8ed2af-8bb1-49f5-86eb-82cf2082a830 and model refusal, tools0,
intent/result absent. Preserve failure. After this turn ended, distinct slot1
msg dd8301d2-d9c9-41bb-91e5-b1bec224987c produced owned bound intent/result,
isError:false, native get_session metadata exactly matching independent current
interrupt scratch74c54e49 identity/title/cwd. Native read68ms. Descriptor-bound
journal inode/offset570319 unchanged before/after; no native user or assistant
rows added. Same epoch, idle/bypass and package hashes independently rechecked.
This establishes one actual module-consumed metadata read without a model turn.
It does not establish two successful reads, readiness immediately after update,
always-on residency, general operations, recovery, unloading or retirement.

Consent plus plugin validation is not serving readiness. The first post-update
request reached model, while the request after its turn ended was consumed.
Next changed-condition work: explicit readiness/activation handshake and durable
service integration before workload, then independent unload/retirement/recovery
qualification. Both new slots used; never replay. Module remains bounded/expiring,
files retained for review, no ongoing process/job started. Shared service memory
recorded. Runtime unchanged; current-source passing pressure/harness evidence
from16:38 remains applicable to source only. Legacy22unknown outcomes untouched;
Codex bridge fixes and1Password stay separate. Goal active.

## Supported module entry loaded; native input wait now observed — October 17

Previous blocked state was based on unverified loading/consent. Taylor's screenshot
showed no Mods menu/prompt; corrected that instruction. No new user permission is
inferred from generic native skill prose. Read-only source review traced
Uts/xzr placeholder interpolation to plugin/skill command loading: supported
builtin plugin-authoring resolves ${CLAUDE_DEV_MODS_DIR} and initializes watcher.
Merely writing its guessed folder after native startup did not establish that.
Source builtin module21372bytes/offset230140363/SHA
6245ff86d1fab13ea9dfc117c4a8010943601067239ab8d4175e6327326ede66.

Actual interrupt controller performed one ToolSearch for session mods status;
correlated toolu_018nPCT127svvXoJ24BqSJ8f returned connector/window/account-plugin
tools, no direct session-mod status. One ListPlugins exact-name query returned
empty account-level results; cannot infer session module loading from that.
Private diagnostics native-mods-discovery-2026-10-17.json and
native-mods-plugin-inspection-2026-10-17.json preserve evidence.

Actual control scratch then invoked Skill({skill:"plugin-authoring"}) once:
toolu_01SdVsHPG3otKuaB9yxip7TA, native prompt row
fc81c511-597d-4599-a4c5-23044866dfbf. Native skill resolved the exact published
/Users/taylor/.claude/dev-mods/8f1d6d55-df3d-4b50-a96c-f4b61a7858bd/ folder.
Agent made no other tool calls in this step. Skill's generic 'nobody could be
asked' explanation is a constant, NOT an observed live failure. No card clicked,
no permissions/settings/module code changed, no model-generated suggestions run.
Evidence diagnostics/native-plugin-authoring-entry-2026-10-17.json.

Changed-condition slot1 preflight subsequently refused: same nativePID42813/start
SatOct17 16:03:11UTC/CLI2.1.299 now waiting, waitingFor 'input needed', mode bypass.
No slot1 send/prepare occurred; slot remains unused. Card presence itself remains
unverified, but waiting state is fresh native evidence, not inferred from send.
Human should inspect that exact control scratch again for the native hot-reload
question. After input resolves, require idle/same epoch/unchanged package/unexpired
config before slot1. Do not replay slot0, forge consent or change app settings.
Private plan state waiting-native-input-after-supported-entry; prior blocked audit
superseded. Runtime unchanged, prior passing pressure/harness evidence retained.
No old broker or22unknown mutations. Goal active; Codex bridge fixes parked.

## Fixed-target scratch read probe published; serving failed — October 17

Previous turn: current consent lifecycle passed. Added fixture-only package builder
and native register source under lib (included in runtime fingerprints/sealed
snapshots), plus four tests. Fixed receiver control scratch8f1d6d55..., fixed target
interrupt scratch74c54e49..., exact scoped cwd, two baked request strings, one-hour
expiry, only native get_session, no native mutations/model API/Bash. Unknown peer
arguments cannot choose targets/tools. Intent/result prevent reattempt after reload;
active guard prevents concurrent local calls. This is a probe, not a public relay.

Current CLI plugin validate passes; warning is missing optional author only.
Verified bypass/live/idle receiverPID42813/start SatOct17 16:03:11UTC/CLI2.1.299,
then exclusive publication into its previously absent native module destination.
Published byte hashes independently rechecked. No old broker files changed.
Private plan: probe/scratch-native-read-2026-10-17/plan.json, with exact config,
hashes, lifetime, validation output, epoch, original observation cursor and one
persisted send attempt prepared before socket bytes. Slot0 native peer user
c559d050-43a8-463e-8cf2-6f46de29dfb7/msg b18419f5-6df6-4f29-bd65-ec29904550b9
reached model, which refused token as an unapproved peer command. Tools0;
probe intent/result both absent. This is failed native serving, not success from
send return or package validation. Unexpected model response1; no model API requested.
Slot1 remains unused; never replay slot0. State published-not-serving-native-consent-unverified.

Current native loader source Z uses personOnly:true for mod_hot_reload selection;
choices include Enable for this session/Not now. Main Claude window independently
matches control scratch, front app Codex. Actual card presence unverified through
available read APIs. Skill forbids clicking any approval card. Human must inspect
that exact scratch chat and enable native Mods loading if prompted. Do not change
permission/settings files or forge native consent. Before slot1, verify unchanged
package, bypass mode, exact native epoch and unexpired config. If expired, preserve
attempt and stage a new bounded reviewed probe rather than reusing IDs. Native
unload/retirement remains unqualified; module files left in place, cleanup pending.
Shared service failure/candidate memory saved. Full pressure1/1pass, source unchanged:
pressure/v2-2026-10-17T16-38-50-660Z.json. Filtered Claude/Codex(gpt-6-sol)
harnesses pass with unchanged configs/source:
pressure/harness-v2-{claude,codex}-2026-10-17T16-38-38-576Z.json.
Synthetic checks do not supersede failed actual native serving.
Goal active; Codex fixes parked.

## Current dev-mod consent lifecycle qualified in isolation — October 17

Previous turn: current native tool adapters passed. Added version-specific
scripts/mod-lifecycle-contract-299.mjs. Unique16,276byte installed module containing
No/Ge filesystem boundary extracted; SHA
cbdd747e741b85044f6847f231d5dfb936d2bb3abbd8e6e90d92419adba1abbf.
Actual Do watcher executes with synthetic turns/clock/filesystem/consent/loader.
Four checks pass: new child asks then explicit enable invokes loader; no recipient
or decline never enables; policy refusal closes before asking; already loaded
child does not duplicate enable. Native calls0, modules loaded0.
Evidence pressure/mod-lifecycle-contract-299-2026-10-17T16-35-46-158Z.json.
Runtime4db6000f34d5957bdec060179090ec23b400496ee156263d17fcf43077a16649.
Full pressure1/1pass: pressure/v2-2026-10-17T16-36-11-248Z.json.
Filtered Claude/Codex(gpt-6-sol) harnesses pass, source/configs unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T16-35-59-134Z.json.
Shared service test/candidate memory recorded.

This is a separate native module hot-reload consent boundary, not ordinary
bypassPermissions. Current scratch consent is not established by these fixtures.
Do not manufacture it or click a native approval card. Next concrete work is a
validated fixed-target metadata-only scratch probe, bounded capacity/lifetime,
without the legacy receiver's mutable checkpoint assumptions; only then inspect
native publication/consent/readiness and independently verify a read result.
No module published, no actual consent interaction or native tool call, no old
broker/request/policy/permission changes. Goal active; Codex fixes parked.

## Current installed module tool adapters qualified in isolation — October 17

Previous turn: binding guard review. Added scripts/mod-tool-contract-299.mjs,
explicitly version-gated to CLI2.1.299. It extracts unique exact installed Sdn MCP
and HG tool adapter functions, verifies parseable boundaries, records byte-window
hash/offset, and executes them with synthetic session/tool/permission dependencies.
Does not relax ambiguity or execute native calls. Older extractor failure retained.

Five checks pass: ordinary permission callback/exact plugin origin; denial prevents
synthetic execution and propagates refusal; unbound/missing/hidden tools refuse;
missing result refuses and tool errors preserve isError; MCP consent injection
refuses without executing. Installed native pipeline itself remains synthetic.
Evidence pressure/mod-tool-contract-299-2026-10-17T16-34-24-266Z.json.
Runtime3b49b5ee388f3524f1edf0f2a3a27caeb527a48a8dfb20c9d86ac9894df717e5.
Full pressure1/1pass, source unchanged:
pressure/v2-2026-10-17T16-34-43-670Z.json. Filtered Claude and Codex(gpt-6-sol)
harnesses pass, configs/source unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T16-34-31-373Z.json.
Shared service candidate/test memory recorded.

This resolves current adapter extraction/fixture work, not actual desktop hook
execution, module activation/serving or old-process retirement. No module loaded,
no native tool called, no live state/permissions changed. Next current-version
review is module registration/session.receive lifecycle and a separately owned,
fixed-target bounded scratch read probe. Legacy broker22unknowns stay untouched;
existing settled-handoff gate remains. Goal active; Codex bridge fixes parked.

## Current receiver reuse audit — October 17

Previous turn: actual CLI hook failure evidence. Approved control scratch remains
bypass/live/idlePID42813; its native receiver module destination is absent.
Existing buildNativePeerServicePackage rejects all but the legacy broker folder,
and candidate register.js hardcodes the legacy sealed checkpoint root. Existing
enrollment/ownership also binds oldPID/version/baselines. Do not merely substitute
scratch identity or remove these checks to load the old service there.

Ran existing hook-contract-v2 against actual2.1.299: failed extract with installed
source marker missing; report pressure/hook-contract-2026-10-17T16-32-53-320Z.json
preserved. Bounded semantic marker review found two occurrences: bytecode string
table at85545852 and embedded source at204168739. Binary is thin arm64, not a fat
architecture duplicate. Existing ambiguity refusal is correct; no extractor rule
weakened. Unique current function _p/GS binding guard independently extracted at
204168649(windowSHA3da0413948c184f7ebd9b8c2af2544fa21eeded1443123cb792d8328f15c4d2a),
executed with synthetic dependencies: unbound session refuses, exact bound
identity preserved. Evidence diagnostics/current-mod-binding-review-2026-10-17.json.

Only current binding guard is qualified in isolation. Native tool-admission,
module loader/lifecycle, bounded serving and retirement remain unqualified for a
scratch receiver. Next changed-condition work: update exact current-version tool
and lifecycle extraction/fixtures before designing a separately owned scratch
receiver configuration. No native modules, service files, broker pointer/policy,
permissions or unknown requests changed. Service candidate memory saved. Runtime
unchanged; existing passing pressure/harness evidence retained. Goal active.

## Actual installed command-hook boundary tested — October 17

Previous turn: matching generation-aware policy candidate passed. Actual installed
CLI2.1.299 ran three isolated headless turns, each in a fresh task-owned folder,
with strict empty MCP config, only Bash, explicit temporary settings, no session
persistence and one synthetic sentinel command. Production broker-stop-rescue
handler was invoked with an unadmitted synthetic Bash, not a desktop operation.

1. Shell command-string wrapper: one PreToolUse invocation, explicit JSON deny,
no sentinel; exit0,5.029s.
2. Hook process exits1 after metadata trace: one invocation, CLI executed Bash
and created its task-owned sentinel; exit0,5.422s. Confirms failure permits the
command in this headless configuration, unlike explicit denial.
3. Exact installer command-plus-args shape: wrapper invoked once and denied;
no sentinel; exit0,5.109s. Hypothesis that args was ignored was falsified. Original
report ok:false preserves the failed hypothesis; review.json records corrected
interpretation. No installer change is justified by this test.

Evidence folders: probe/command-hook-2026-10-17,
probe/command-hook-error-2026-10-17, probe/command-hook-args-2026-10-17.
Each retains metadata report, synthetic raw output/stderr and settings; final
folder also has review.json. Shared service memory recorded. Runtime remains
de08fdcbe7a85de54afc60c1a23653a33667d89349eee376e2eff40b40ec29b3;
no runtime source changes or repeat synthetic suite required in this turn.

This is actual headless hook-runner evidence, not desktop-hosted hook or general
failure/timeout qualification. It supports requiring independent old-process
retirement before rollover, rather than trusting installed hook settings as a
physical fence. No desktop chats, broker policy/pointer, unknown outcomes, auth,
permissions or quarantine changed. Goal active; next recovery proof still needs
exact old-instance retirement plus new current-epoch enrollment. Codex fixes parked.

## Generation-aware runtime requires matching native hook — October 17

Previous turn: helper generation fence passed. Activation audit found a separate
installed-hook boundary: a new runtime manifest alone does not prove the installed
Stop-rescue handler understands request bindings. Current native enqueue now
requires policy nativeRequestBindingVersion1, effect-admission1, matching release
build, session and livePID/start when active runtime declares binding1. Refuses
broker_native_generation_policy_mismatch before request publication/wake. New
policy installations declare binding1; policy validation refuses a capability
claim against a release manifest that lacks it. Legacy runtimes keep their prior
contract without gaining fencing proof. No live policy or pointer changed.

Full pressure1/1pass, unchanged source:
pressure/v2-2026-10-17T16-29-53-279Z.json. Filtered Claude/Codex(gpt-6-sol)
harnesses pass with source/config unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T16-29-47-803Z.json.
Service candidate memory recorded. New isolated policy matrix rejects
missing policy/capability, unsupported version, different handler build and each
foreign native identity field. Existing policy install/validation and native-hook
boundary suites pass. This completes matching runtime/helper/hook prerequisites
for the candidate only; native hook serving on CLI2.1.299 and old-instance
retirement remain unqualified. Existing22unknown outcomes remain untouched.
Goal active; no native effects in this turn; Codex bridge fixes parked.

## Helper generation fence preserves retired work — October 17

Previous turn: progress (native generation-binding candidate). Shared pure
nativeRequestBindingMatches now supplies helper and native-hook equality rules,
including valid modern pointer fields. pickupPending skips incompatible native
requests inside the request lock before expiry/cancellation writes or claiming.
authorizeDispatch refuses request_generation_mismatch before changing control.
No request/result/control is rewritten merely because a new generation exists.
Legacy native requests retain compatibility only with legacy pointers; they cannot
be adopted by a binding-required pointer. Non-native synthetic requests retain
their existing lifecycle.

New isolated lifecycle test proves old and legacy requests stay byte-identical,
an expired old request gets no synthetic result, only the matching current request
is picked up, and a generation change after pickup or dispatch refuses with control
bytes preserved. Existing native-hook concurrency and field mismatch tests exercise
the same shared predicate. Full pressure1/1pass, unchanged source:
pressure/v2-2026-10-17T16-28-55-316Z.json.
Filtered Claude/Codex(gpt-6-sol) harnesses passed, source/configs unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T16-28-48-960Z.json.
Service candidate memory recorded.

This is helper admission plus an independent native boundary check, not atomic
retirement. Generation could change after helper admission; native must still
recheck, and live activation remains behind existing settled-handoff requirements.
No live activation, wake, stop, policy change or legacy request mutation. The old
process and22unknown outcomes are not retired/settled by this code. Next actual
recovery requirement remains independently verified old-instance retirement and
new current-epoch native enrollment; no alternate unsafe release path introduced.
Goal active; Codex bridge fixes parked.

## Native request generation binding candidate — October 17

Previous turn: recovery frontier review. New sealed releases declare
nativeRequestBindingVersion1 in their manifest; activation copies that capability
only from a declaring release. Active pointer cannot claim it for an older
manifest. New native requests carry build/bootstrap/generation/session/PID/start
binding when the active release requires it. Native PreToolUse compares all six
fields before consuming an operation slot. Missing binding and prior-generation
requests refuse even if a fresh helper checkpoint names identical operations.
Legacy pointers keep their old contract and gain no fencing qualification.
Filtered Claude and Codex(gpt-6-sol) harnesses also passed with source/configs
unchanged: pressure/harness-v2-{claude,codex}-2026-10-17T16-27-33-805Z.json.
Shared service candidate memory recorded.

Actual isolated command-hook tests now use a version1 pointer and matching request;
missing and old-generation bindings deny without consuming admission. Concurrent
same-generation invocation still admits exactly once. Pure negatives cover each
foreign field, malformed capability versions, and generation rollover with fresh
entry. Full pressure1/1pass, source unchanged:
pressure/v2-2026-10-17T16-27-42-123Z.json. Earlier same-turn pressure also passed
before adding manifest capability qualification; final report supersedes it.

No live activation, policy change, broker stop/wake or old request mutation.
This prevents a newly admitted generation from adopting old work; it does NOT
prove old native process retirement or platform hook reliability. It must not
bypass the existing settled-handoff gate. Legacy22unknowns stay unknown. Next
recovery requirement remains independent old-process fencing and current-epoch
native enrollment proof before any replacement service becomes ready. Native
stop/replacement scratch proof remains historical prior-build evidence. Goal active.

## Native stop and replacement qualified once — October 17

Previous turn: blocked (required bypass mode). Fresh current-source reads now verify
bypassPermissions on controller local_74c54e49-972e-4dac-adfa-d23e01316119 and
disposable target local_8f1d6d55-df3d-4b50-a96c-f4b61a7858bd, both idle/live.
Taylor's exact direct-human stop grant was already independently verified.
Ran one bounded tool-free integer workload on target; observed busyPID42813.
One direct control request to controller produced exactly one native
mcp__ccd_session_mgmt__stop_session({session_id: target}), with only ToolSearch
otherwise permitted. Exact causal call toolu_01F6BNKNQJUxxUM4jc2sf5MH and result
5b7f13db-4fc0-4c8e-8b2e-9c52c208116b parsed stopped. SamePID/start remained idle.
Only then sent one replacement. Its native peer user7307bead-a69b-41af-9bdd-a6a24a2559ef
and causal assistant6534f9d6-286b-416a-b591-2a7294730a27 verified exact replacement
marker, zero tools, same epoch and final idle. No retries, permission changes,
legacy broker wake/recovery, work-chat actions or quarantine changes.

Private evidence: diagnostics/native-control-trial-2026-10-17.json; service
candidate memory recorded. Durable jobs ja4e8ba01d1f84b9e8a97744efd351e6f,
j0ac7587fbc3c4e62a8226b081b8f3d3b, j66481404c543455d9fbaea8cc82c8f24
all completed; each send receipt alone remained applied:false until independent
native control/causal reply verification. Source ee81baeef6fbe5eb3ca85f37cf017f1b36a0f0c238edb3fa52900c6b09755c19
unchanged since passing full pressure and both filtered harness checks.

Scope is one native stop plus subsequent replacement on one explicitly authorized
scratch target. This resolves that prepared trial, not generic autonomous stop
permission or always-on recovery. Legacy broker22unknowns, stale policy/pinned
native epoch, cold-start recovery and sustained residency remain open. No live
trial handle remains. Goal active; Codex bridge fixes remain parked. Next review
current recovery frontier against these proven direct-control primitives without
repinning stale broker or replaying unknown native effects.

## Migrated Stop-rescue script path fixed — October 17

Previous turn: progress (independent cause isolation). Current source now accepts
a parent-directory alias only when its owned regular script resolves to the exact
script in validateRelease's sealed release. Leaf symlinks, same-byte copies,
missing paths and directories refuse. Release integrity, script/settings hashes,
policy schema, temporary-probe refusal and exact process/session binding remain.
No live policy rewrite, epoch rebind, arm or wake performed.

Runtime ee81baeef6fbe5eb3ca85f37cf017f1b36a0f0c238edb3fa52900c6b09755c19.
16focused tests pass, including legacy alias and negative replacements plus
existing stop-rescue request/epoch/human-message tests. Current-source read-only
installed-policy validation now succeeds; synthetic foreign wake PID still refuses
before arm. Full pressure1/1pass, source unchanged:
pressure/v2-2026-10-17T16-22-09-976Z.json. Filtered real Claude and Codex(gpt-6-sol)
harnesses pass, configs/source unchanged:
pressure/harness-v2-{claude,codex}-2026-10-17T16-22-13-064Z.json.
Service candidate memory and diagnostics/stop-rescue-path-fix-2026-10-17.json saved.

This fixes the migration false negative, not live recovery. Installed policy still
binds oldPID71262; exact current-epoch enrollment and legacy22unknown reconciliation
remain unresolved. Required bypass scratch modes must verify before control trial.
No test workload/stop/replacement sent. Goal active. Next changed-condition step:
verify scratch modes and live identities; if still lower, preserve native permission
gate. Do not retry broker wake on unchanged stale epoch, repin or replay unknowns.
Connected MCP requires reload for this source; use fresh CLI for current-source work.

## Stop-rescue refusal independently narrowed — October 17

Previous turn: progress (published required-bypass service provisioning contract).
Read-only validation of the installed policy proves its sealed release valid,
script bytes and settings bytes match policy hashes, feedbackVersion2 has no
quietWait, and no temporary mechanical probe exists. Literal policy script path
uses ~/.local/state/claude-driver/releases/7e388b8f... while validated release
uses repository .runtime/state/releases/7e388b8f...; their realpaths are identical.
stopRescuePolicy rejects the literal mismatch. This is a migration-path false
negative, not evidence that Taylor must approve another permission request.

Separately the policy remains bound to PID71262/start Wed Oct7 03:24:51 2026.
Canonicalizing paths would not authorize a new process epoch or resolve the
legacy22unknowns/sealed dependency mismatch. Do not rewrite the live policy or
relax identity checks. No wake, control, permission write or replay performed.
Evidence: diagnostics/stop-rescue-path-review-2026-10-17.json. Next safe work:
prepare isolated canonical-path comparison regression, preserving release/hash
checks and exact process binding; live service refresh still requires admitted
current-epoch enrollment. Required bypass scratch mode remains unmet until a
supported mode change succeeds. Goal active; no live trial handle pending.

## Required bypass service mode — October 17

Taylor sent the direct human grant for the exact planned stop in the existing
controller. Native foreground user UUID562b3ac7-a177-40ec-a717-00ae650bca6f,
timestamp2026-10-17T16:17:36.010Z, exact-text SHA256
057b77eb83b94cfc07962946a8b7976530ea71062535bc04d6093a5a9426ba37
independently verified. The old missing-human-grant prerequisite below is resolved.

Taylor also explicitly requires bypassPermissions for scoped bridge service and
scratch chats, and authorizes routine scoped work without repeated approvals.
These fixtures were explicitly created acceptEdits; global and repo defaults
already specify bypass. Existing require_pool:true supplies fail-closed creation;
guide now requires it and verified bypass readiness before service workloads.

Current-source set_session_config on controller local_74c54e49-972e-4dac-adfa-d23e01316119
requesting bypassPermissions failed broker_stop_rescue_refused: Stop rescue policy
changed or failed admission; dispatched:false, retrySafe:true. No wake sent.
No alternate path or repeated attempts. Controller, control target
local_8f1d6d55-df3d-4b50-a96c-f4b61a7858bd and transport scratch
local_c0a18601-5a57-44d0-94ac-2fed3719e7ca all read back acceptEdits.
Exact policy subcause is unproven. Private diagnostic:
bypass-service-scope-2026-10-17.json. Native plan now
 authorized-awaiting-bypass-provisioning; controller and target must verify bypass
before workload/stop/replacement. No control trial was sent. Next changed condition:
supported mode raise succeeds, or Taylor selects Bypass permissions in the bottom
left mode menu of each named Claude scratch chat; then recheck mode and native epoch.
Never weaken admission to achieve that change. Legacy22unknowns and sealed-epoch
mismatch remain; watcher paused, Codex bridge fixes parked. Goal active.
Documentation-only checkpoint; existing source test evidence remains applicable.

## Exact disposable native control trial prepared — October 17

Previous turn: progress (historical native journal receipt audit). Prepared a
reviewable native interruption sequence without retrying the prior controller
refusal. Created1disposable target local_8f1d6d55-df3d-4b50-a96c-f4b61a7858bd,
title claude-driver-control-target-2026-10-17, cwd probe/control-2026-10-17,
acceptEdits/Haiku5.5. Disk verified and exact native peer PID42813/start
Sat Oct17 16:03:11UTC/CLI2.1.299 observed idle. Focus restored to the existing
controller and Codex. No workload/stop/replacement has been sent.
Plan: diagnostics/native-control-plan-2026-10-17.json. It binds one target,
one native stop, no retry/permission change/broker recovery/work-chat action.
Sequence: exact live/idle preflight; bounded tool-free workload; observed busy;
one exact controller native stop; exact call/result+accepted receipt+same-epoch
idle; only then exact replacement receipt/causal reply. Any refusal or uncertainty
ends the trial without replacement.
Prerequisite remains the actual controller's earlier refusal: peer instruction
was not accepted as direct human authorization for cross-chat stop. Taylor's
standing authorization here permits preparing the test, but must not be forged
as direct input in Claude. Controller is existing Claude Desktop chat
claude-driver-interrupt-scratch-2026-10-15. Exact proposed human text is saved
in plan.humanInstruction; it explicitly says wait for the planned request and
preserve native human-input protections. No stop now and no peer retry before
that changed authorization condition. Goal active; no live trial handle pending.
Source unchanged; existing current pressure/harness checks retained. Historical
22unknowns and sealed-epoch mismatch still prevent legacy broker handoff;
Codex bridge fixes remain parked.

## Historical unknown receipt inventory — October 17

Previous turn: progress (foreground/CLI receipt binding fix). Bounded diagnostic
scan processed logical broker journal20,802,277bytes/15,419rows and canonical
migrated journal21,852,809bytes/15,949rows, at most32MiB per owned no-follow
regular file.22unknown request collectors used exact CLI identity, foreground
filter, original offsets/time lower bounds and exact checkpoint/argument rules.
No candidate native receipts found in either journal. Only rmuxpt37w-d5e587 had
a matching checkpoint call; no admitted slot/native call/result was correlated.
Diagnostic only: original dev/inode identities were NOT rebound, no receipt or
control file published, no replay/handoff authority granted. Original saved
device16777233 differs from current16777229; logical inode45916594 retained.
Do not call this corruption or infer a reboot/migration cause from dev numbers.
Canonical file's first20,802,277bytes exactly hash-match the logical file.
Both contain one identical272,714-byte record above normal256KiB receipt bound.
Separate at-most2MiB structural review found a user record with no tool calls,
no tool-result blocks and no unresolved request ID mentions; no raw body entered
chat/artifacts. This closes that structural gap without widening production
receipt limits or granting settlement. Evidence:
diagnostics/historical-receipt-scan-2026-10-17.json and
diagnostics/historical-large-record-review-2026-10-17.json.
All22 remain unknown/unsafe to replay; empty dispatch ledgers or desired current
state cannot settle historical mutations. No old result overwritten, native
request, process action, setting change or model prompt. Current source unchanged;
passing pressure/harness reports from prior turn retained. Goal remains active.
Next changed-condition work must establish independent native control/recovery
admission or a supported explicit disposition of historical uncertainty; do not
repeat this unchanged journal scan or bypass the settled-handoff gate.

## Foreground native receipt session binding — October 17

Previous turn: progress (human-started epoch and connected MCP verification).
Read-only legacy receipt audit reproduced an independent synthetic defect:
foreground dispatch checkpoint plus a matching sidechain native call/result
incorrectly settled a receipt. Collector now rejects all sidechain records and
malformed sidechain flags, and runtime observers bind every checkpoint/call/result
to the exact expected CLI session. Missing/foreign session IDs cannot settle.
No old receipt is fabricated or replayed; no historical result was overwritten.
Evidence: diagnostics/native-receipt-binding-2026-10-17.json.15focused collector
tests and6broker tests pass. First full pressure failed3broker fixture checks:
synthetic journal rows omitted real sessionId; fixture corrected to include exact
CLI identity. Failure preserved: pressure/v2-2026-10-17T16-00-29-276Z.json.
Final unchanged-source pressure passes:
pressure/v2-2026-10-17T16-00-56-183Z.json. Both current filtered harnesses pass:
pressure/harness-v2-claude-2026-10-17T16-00-12-178Z.json and
pressure/harness-v2-codex-2026-10-17T16-00-12-178Z.json.
Current build 9fb58c9fd9fc4081ad2f0fa13e188e067b077c687e0095dfff51c2286462abd6. Connected MCP still
loads64c8563f and now correctly reports restartRequired:true; fresh processes
used for current checks. Prior connected native proof remains bound to its old
build, not silently promoted. Read-only native journal cursor binding verified;
no new broker serving/native mutation qualification claimed. Legacy22unknowns
remain; handoff unsettled. Sealed runtime and current native epoch mismatch
unchanged. No restart, wake, settings/quarantine change or refused-stop retry.
Next changed-condition step: exact historical foreground receipt evidence review
or independently admitted native control qualification; preserve unknowns without
replay and reconnect MCP before using changed code through that connector.

## Human-started new epoch and connected MCP verified — October 17

Taylor reported done after the requested ready message in Claude Desktop.
Independently observed existing target local_74c54e49-972e-4dac-adfa-d23e01316119
live/idle PID20499, start Sat Oct17 15:48:23UTC, desktop entrypoint, CLI2.1.299.
Installed app2.42304.0/CLI2.1.299 unchanged. Fresh public durable direct send has
exact native receipt and exact causal POST_READY_OK reply without tools:
diagnostics/post-ready-2026-10-17.json. Target returned idle.
Actual connected Codex MCP driver_status now reports runtimeBuild==sourceBuild
64c8563f7be1cda864fdf4b37d527f35de93ae7f5185dbde6f59b3aca037b480,
restartRequired:false. A native send was submitted through this chat's actual
MCP, reattached from fresh CLI to same job, then waited/observed through MCP.
Job j83995b4eeed3446a80fe1e40bed42322 completed; exact native user receipt and
causal MCP_NATIVE_OK_20261017 terminal reply verified, no tools or duplicate job.
Evidence: diagnostics/connected-mcp-native-2026-10-17.json. This closes the stale
connected-MCP gap for the explicit direct route on this build/epoch only.
Current source fingerprint matches passing full pressure
pressure/v2-2026-10-16T00-18-48-528Z.json; no redundant synthetic/model retest.
Historical cold-start failure remains failed: this recovery required a direct
human message, so autonomous cold recovery is NOT qualified. Prior blocked audit
is superseded by changed native state; goal active, new blocked-audit count0.
Fresh legacy broker audit: a unique owned live/idle worker is present, PID79060
start Fri Oct16 14:54:25UTC. Its sealed dependency evidence reports native-process-
epoch-mismatch; templateCurrent:false, waiter/batch admission unverified and
residency list not fresh.22unknowns remain and handoff is unsettled. No broker restart/wake, old effect replay, native mutation refusal
retry, permission or quarantine change. Watcher remains paused; Codex bridge
fixes parked. Next work: current native control admission and autonomous startup
architecture, preserving the recorded controller refusal and unknown effects.

## Cold-start source admission review — October 15

Previous goal turn: progress (authorized app restart revealed offline refusal and
missing peer startup). Bounded installed source now confirms separate APIs:
LocalSessions.setFocusedSession changes focus/preconnects SSH; warmSession calls
manager warmSession(...,{fromPage:true}). Manager warm entry refuses unconfirmed
imports, stoppedUntilPersonSends, hosted-state restrictions and crash-loop gates,
then checks transcript/trust/auth and start ownership. None may be bypassed.
canAutoResume reports stopped-until-person-sends, import-confirm, parked crash-loop
or stale-auth refusal. This is source evidence, not a current native canAutoResume
result or proof of which gate caused this scratch failure. Allowlisted persisted
scratch flags were absent; do not interpret absent as clear/false.
Evidence: diagnostics/native-cold-start-review-2026-10-15.json. No app/internal
IPC executed, settings changed, restart repeated, native control retried or prompt
spoofed. Both scratch records remain unarchived with no current native worker.
The native controller's earlier cross-chat mutation refusal is also preserved.
Concrete changed-condition gate: Taylor can open the existing Claude Desktop chat
claude-driver-interrupt-scratch-2026-10-15 and send a short ready message there;
then current exact peer/versions and one harmless direct receipt/reply can be
requalified. Codex cannot type that message while input quarantine is retained.
An independently verified supported native warm-start route respecting admission
could also unblock; current code has not established one. Legacy broker remains
observer-owned/offline with22unknown effects; ordinary recovery cannot clear them.
No new source change; prior current pressure/harness evidence retained. Next work
should change this startup condition or qualify a supported route, not repeat
unchanged opens/restarts, add unrelated helpers, or reinterpret navigation as ready.

## Controlled app restart: offline refusal passed, cold peer startup failed — October 15

Previous turn: progress (native cancellation). Taylor explicitly authorized
Claude Desktop quit/restart. Held shared broker-revive lock through one graceful
AppleEvent quit and reopen to serialize observer recovery. No OS/session kill,
keyboard injection, permission/auth change or broker wake. Durable intent marks
this as intentional termination; do not infer crash/governor eviction from exits.
Exact app and scratch peer absence observed after quit. A new direct send refused
peer_unqualified before arming any ledger. App reopened, but open_session with
focus restoration did not start the disposable scratch native peer within30s.
Retained failure: diagnostics/direct-app-restart-2026-10-15.json. No uncertain
message was retried and no post-restart inference prompt was sent.
Added optional open_session.wait_native_sec(0–30/default0), observing exact
desktop peer/session/cwd/process identity inside navigation before restoration.
It returns nativeProcess verified identity only, servingVerified:false and
inferenceVerified:false; timeout/cancel is explicit while focus can restore.
Three helper tests and full final-source pressure pass:
pressure/v2-2026-10-16T00-18-48-528Z.json. Both filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-18-34-138Z.json and
pressure/harness-v2-codex-2026-10-16T00-18-34-138Z.json.
Changed-condition native follow-up waited30s before restoring focus and ALSO
returned native-peer-timeout. This disproves focus restoration delay as sufficient
explanation. Chat navigation is not a warm-start guarantee on current installed
app2.42304.0/CLI2.1.299. Preserve both observations; no second restart performed.
App is reopened; scratch record intact/unarchived but native worker offline.
Legacy broker remains offline with22unknown effects and handoff unsettled.
Next changed-condition step: inspect installed cold-start/deep-link semantics and
existing input-free startup mechanisms without bypassing quarantine, controller
refusal, native permission gates or observer recovery ownership. Live native
controls, persistent serving, cold recovery and residency remain unqualified.

## Native direct cancellation boundaries passed — October 15

Previous turn: progress (two-target concurrency). Current-source owned scratch
trial validates both boundaries through actual durable public jobs. A controlled
recipient lock kept first job waiting before admission; cancellation produced
cancelled with no direct ledger, and same-key reattachment retained that job.
A bounded500-integer workload then held the real recipient busy. Follow-up was
durably armed once and caller cancellation left its job outcome_unknown. The
exact native user receipt arrived AFTER cancellation, followed by exact causal
terminal reply. One native receipt only; same-key job reattachment never replayed.
peer_send_status reconciled late receipt to received while original job remained
outcome_unknown. No tools; exact native epoch unchanged. Final cleanup records
recipient idle. Evidence: diagnostics/native-cancellation-2026-10-15.json, runtime
4262b079933b2f38a26b8ca746f626701f46c266297249c12041d444512beb0a.
This qualifies cancellation bookkeeping and late native direct receipt observation
for this bounded fixture. Cancellation does not stop recipient inference or undo
published work. The preserved unknown job is not an unresolved legacy broker
mutation; its direct ledger has exact received proof and causal reply. Do not
rewrite historical job state or retry with a new identity.
No source change, broker wake/recovery, OS process kill, permission change or
refused native control retry. Current synthetic/harness evidence still applies.
Next changed-condition step: current native lifecycle/dependency and recovery
qualification under the existing admission gates; native controller cross-chat
mutation refusal and legacy22unknowns remain authoritative.

## Two-target native direct concurrency passed — October 15

Previous goal turn: progress (descriptor-bound observations). Current-source
public durable peer-direct trial submitted6 jobs concurrently across the2 owned
scratch chats,3 per target. All6 jobs completed with unique exact native user
receipts and exact causal terminal replies. Every original idempotency key was
reattached and retained its job ID; no duplicate job/publication/reply observed.
Both exact native PID/start epochs unchanged; no tools. Final records show both
targets idle/unarchived. Evidence:
diagnostics/direct-concurrency-2026-10-15.json, runtime
4262b079933b2f38a26b8ca746f626701f46c266297249c12041d444512beb0a.
Submit latency109–377ms; first receipt per target563/628ms; queued receipts
4994–11310ms; causal replies3134–12859ms; total13955ms. These measured values
qualify only this bounded6-message/2-recipient workload, not sustained throughput,
fairness, broker serving, interruption, recovery, native mutations or residency.
No source change, app restart, permission change, refused-stop retry, old broker
replay or Codex bridge modification. Required current-source synthetic/harness
proof from the previous turn remains applicable; no redundant inference retest.
Next changed-condition step: exact native direct lifecycle cancellation/reattach
qualification or trusted existing native control admission, preserving controller
refusal. Legacy broker22unknowns and cold recovery/residency remain open.

## Descriptor-bound transcript observations — October 15

Previous turn: progress (bounded causal tool receipt IDs). Shared observer now
opens its journal O_NOFOLLOW/O_NONBLOCK and validates owned regular-file identity
through fstat on the exact descriptor supplying bytes. It no longer stats one
path and reopens a potentially replaced target. Cursor dev/inode/offset checks
use that descriptor; bounded reads detect premature EOF/truncation and reject
non-growing metadata replacement during reading. Normal append growth remains
valid; missing transcript pending cursors are unchanged. No FIFO can block read.
Focused45 checks pass including final-symlink, directory, FIFO and replaced-inode
refusals; original partial-line, truncation, Unicode/privacy and pending context
checks continue passing. Full final-source pressure passes:
pressure/v2-2026-10-16T00-13-20-714Z.json. Fresh current public observer retains
exact native call/result pairing on the owned scratch journal without inference:
diagnostics/native-observation-file-identity-2026-10-15.json.
Both final-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-13-06-746Z.json and
pressure/harness-v2-codex-2026-10-16T00-13-06-746Z.json.
Controller mutation refusal remains authoritative; no new message, permission
change, recovery, restart or old request replay. Both scratch chats retained idle.
Next changed-condition work: current-source native lifecycle/recovery boundaries
and serving qualification, without substituting peer prompts for refused control
authority. Full interruption, residency, cold recovery and22unknowns remain open.

## Bounded native tool-call/result observation — October 15

Previous turn: progress (native metadata read and preserved controller refusal).
Shared session_events/session_wait include_causality now includes metadata-only
toolCalls{id,name} and toolResults{toolUseId,isError}. IDs/names are bounded;
64-block caps and malformed identifiers explicitly mark truncation/incompleteness.
Missing native error flag stays null, never inferred success. Arguments, result
bodies, thinking and user text remain excluded. Default observation unchanged.
New fixture proves pairing, opt-in privacy, nullable error and overflow/invalid-ID
flags. Focused44 checks passed before final metadata-incomplete flag; full
final-source pressure passes: pressure/v2-2026-10-16T00-11-59-476Z.json.
Both final-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-11-46-346Z.json and
pressure/harness-v2-codex-2026-10-16T00-11-46-347Z.json.
Current public observer independently pairs the retained native scratch read's
actual toolu_01MgVHUvin97S86zFJseEW9M call/result without a new model prompt.
Evidence: diagnostics/native-tool-observation-2026-10-15.json.
Correlation is not semantic effect proof; exact arguments/result/state remain
separate gates. Controller stop refusal is preserved and not retried. Both
disposable scratch chats are retained; target workload completed and idle.
Next changed-condition work: leverage these paired IDs for bounded causal native
receipt observation while keeping mutation authorization/refusal authoritative.
Full native interruption/recovery/residency remains open; watcher stays paused.

## Native scratch controller read passed; interruption refused — October 15

Previous turn: progress (installed stop-handler contract). Existing scratch
local_c0a18601-5a57-44d0-94ac-2fed3719e7ca successfully discovered and called
mcp__ccd_session_mgmt__get_session for itself. Exact native tool-use arguments,
matching tool-result ID/target and causal terminal acknowledgment verified from
bounded owned journal. ToolSearch discovery observed; no substituted shell or
filesystem tool. Evidence: diagnostics/scratch-native-tool-read-2026-10-15.json.
Created second disposable target through create_session with acceptEdits/Haiku5.5:
local_74c54e49-972e-4dac-adfa-d23e01316119, title
claude-driver-interrupt-scratch-2026-10-15, cwd probe/interrupt-2026-10-15.
Disk verified; immediate focus restoration recorded. Native PID44866 was busy
generating bounded1200 integers when controller received one exact stop request.
Controller refused peer-delivered authority before any native stop tool call.
This is a preserved native model authorization refusal, not successful interrupt,
transport failure or evidence the stop API is unavailable. No retry/forged human
authority, alternate control, permission change or native process kill attempted.
Evidence: diagnostics/scratch-native-interrupt-2026-10-15.json.
Target naturally completed its final marker and is now independently idle.
Replacement was never sent. Target retained unarchived for next legitimate test;
no active workload remains. Native cross-session mutation through this controller
requires direct human instruction in that Claude chat; ordinary peer authority
cannot be assumed from metadata read success. Broad goal remains active with
other independent implementation work available; no new approval request here.
Next changed-condition step: inspect existing trusted native service admission
for a scratch-only controller path, preserving this refusal and all existing
permission gates. Legacy broker22unknowns remain pending; no wake/replay/handoff.
Current source unchanged; prior pressure/harness proof retained without repeated
model tests. Watcher remains paused; Codex bridge fixes remain parked.

## Installed stop-handler contract qualification — October 15

Previous turn: progress (recognized native stop receipts). Added reproducible
scripts/native-stop-contract-v2.mjs executing only the exact reviewed installed
stop tool handler in a VM with synthetic manager/telemetry. All8 checks pass:
human-answer waiting refuses before interrupt; held user message produces declined
success envelope; reconnecting host remains requested; accepted agent interrupt
produces exact positive receipt; idle, starting, archived and self cases do not
invoke interrupt. Calls bind exact target and agent trigger. Evidence:
pressure/native-stop-contract-2026-10-16T00-08-24-329Z.json.
Installed handler chunk SHA f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff
is required; drift fails rather than guessing minified source. No live app IPC,
permission broker changes, messages, process signals or native controls occurred.
Further source tracing finds app manager interruptSession(...,agent) uses actual
query.interrupt(), preserves held user input, reports reconnect-pending, and may
fall back to native stop on missing SDK acknowledgment. Peer priority is not an
equivalent control interface and must not bypass these protections.
Next changed-condition step: prepare an exact owned scratch native-tool controller
trial through existing app tool machinery, with current native admission/receipt
proof and no replay of old broker requests. Offline legacy broker and22unknown
effects remain open; general recovery/handoff gates are unchanged.

Current full pressure passes unchanged source: pressure/v2-2026-10-16T00-08-47-099Z.json.
Both final-source filtered harnesses pass: pressure/harness-v2-claude-2026-10-16T00-08-33-361Z.json
and pressure/harness-v2-codex-2026-10-16T00-08-33-361Z.json.


## Native stop receipt refusal guard — October 15

Previous turn: progress (direct queue steering). Bounded installed desktop source
review found successful stop_session envelopes can mean user-input refusal,
starting/no turn, or reconnect-pending. Idle observed later cannot prove those
stops executed. Current stop_session now requires a recognized exact-target
receipt before same-epoch idle verification. Declined/unfamiliar receipts refuse
replacement; reconnect-pending reports outcome_unknown/retrySafe:false without
replacement. Already-idle returns stopped:false while retaining verified idle.
Steering no longer reports an already-idle recipient as an interrupted turn.
Evidence: diagnostics/stop-native-receipt-review-2026-10-15.json, installed chunk
.vite/build/index.chunk-B5tintml.js SHA f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff.
Parser positives/negative/foreign/malformed/error receipts pass. Actual synthetic
MCP regression models later idle after declined native receipt and proves no
replacement; pending reconnect is likewise unknown. Full pressure passes:
pressure/v2-2026-10-16T00-07-07-226Z.json. Both final-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-06-52-458Z.json and
pressure/harness-v2-codex-2026-10-16T00-06-53-637Z.json.
No native interruption trial, app restart, permission change or broker recovery
performed. Next changed-condition step remains a current native control route:
review desktop interruptSession dispatch/control transport; preserve pending
human-message protection rather than substituting OS signals or peer priority.
Broker22unknowns and residency/recovery remain open; watcher stays paused.

## Explicit direct queue steering — October 15

Previous goal turn: progress (native ordinary busy queue proof). Public
steer_session(mode:queue) now accepts explicit transport:peer-direct with stable
operation_id and receipt_timeout_sec. It reuses the guarded durable direct runner
and one absolute outer-admission/receipt deadline. Exact native receipt returns
received/applied:false/stopped:false; default native route is unchanged. Direct
interrupt and direct/via_broker combinations refuse before effects. Native stop
remains required for interrupt; no version/control gate was weakened.
New synthetic tests prove one publication/reattachment, refusal before effect and
outer-lock deadline. Focused11/11 and full isolated pressure pass unchanged source:
pressure/v2-2026-10-16T00-04-46-713Z.json. Both current filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-04-53-712Z.json and
pressure/harness-v2-codex-2026-10-16T00-04-54-910Z.json.
Actual durable public steer_session scratch trial passes: second job submitted
while busy before first completion, exact250-integer first causal reply then exact
follow-up causal reply, no tools. Evidence:
diagnostics/direct-steer-queue-trial-2026-10-15.json.
Fresh recovery audit still reports offline broker, intact sealed package,449
requests/22unknown and settledForHandoff:false. No recovery or replay attempted.
Next changed-condition work: inspect installed current native stop/control API
independently of the offline broker, then prepare a bounded scratch interruption
trial only through a verified route. Broad control/residency/recovery remain open.
Watcher stays paused; no input injection, permission changes or Codex bridge fixes.

## Native ordinary direct queue qualification — October 15

Previous goal turn: progress (composed native direct receipt/reply). Existing
scratch PID98986/start Thu Oct15 23:20:48UTC, CLI2.1.299 remained the target.
Two durable public peer-direct jobs completed. Follow-up job was created while
get_session reported busy and before the first terminal response timestamp.
The first exact causal reply contains all250 integers plus the fresh final marker;
only afterward the follow-up native user receipt and exact causal terminal reply
appear. No tools. Evidence: diagnostics/direct-queue-trial-2026-10-15.json,
including durable job times, exact native message IDs and bounded event ancestry.
This qualifies ordinary next-priority direct delivery without interrupting this
bounded workload. It does not qualify steer_session, native stop, broker controls,
queue fairness under sustained load or current immediate-priority routing.
Taylor authorizes routine bridge testing and Claude Desktop restarts as needed;
old one-message approval limitations below are historical and superseded.
Next changed-condition step: inspect current installed stop/control mechanisms
and broker recovery admission; do not promote2.1.299 immediate/idle controls from
this ordinary queue trial. Watcher remains paused; old unknowns are not replayed.

## Composed native direct-route qualification passed — October 15

Taylor explicitly approved DIRECT_ROUTE_OK and routine bridge testing, including
Claude Desktop quit/restart as needed; ask only for high-risk or definitively
disruptive actions. Earlier additional-message approval blockers below are superseded.
Existing scratch local_c0a18601-5a57-44d0-94ac-2fed3719e7ca remained live/idle
before submission. Fresh public driver_submit job jea110c3793f64c439aa7945a816925cb
completed with exact native user receipt 7edf5e39-b555-4eda-b84a-772f9dd09568, peer message
7beefa4f-8be9-41e9-ae0b-bd170da2473c. Causal attachment ancestry leads to terminal assistant
59942b8e-48e4-456f-b56c-c91bfe4f1bbb: exact DIRECT_ROUTE_OK, end_turn, no tools.
Runtime build 89b82ac96eb6480483b99efbf6bc686125e873a152b2766f13b94a6971c984f9; existing CLI2.1.299.
Evidence: diagnostics/direct-native-qualification-plan-2026-10-15.json.
No duplicate submission, broker wake, restart, permission change or input injection.
This qualifies this native composed direct send only; controls, residency, cold
recovery and historical unknown effects remain open. Watcher remains paused.
Next changed-condition experiment: scratch-only native queue/control qualification
with exact causal receipts; reconcile observer ownership before broker recovery.

## One absolute direct-send deadline — October 15

Previous goal turn: progress (worker-loss/competing-job pressure and admission fix).
Additional native approval remains pending; automatic continuation is not consent.
Independent source review found public send_message reset its receipt budget after
outer control admission. Now one absolute deadline starts before runtime/metadata
checks, flows through outer lock and runner, and cannot be extended by nested
admission. Socket transport counts asynchronous preparation and checks deadline
again on connect immediately before writing. Expired publication remains unknown
if its state cannot be inspected in remaining time, without granting replay.
New real MCP delayed-receipt regression proves original public budget is retained;
expired inherited deadline arms no send, and slow preparation sends no late frame.
Initial focused7/9 result retained in diagnostics/direct-deadline-regression-2026-10-15.json:
old assertions did not permit conservative unknown on exhausted inspection budget.
Full failed reports preserved:23-54-31-757Z(CLI fixture failed before descendant
record due Node bootstrap) and23-56-20-966Z(partial-wake fixture80ms exhausted at
metadata admission). CLI held-pipe fixture now uses an immediate shell launcher;
partial-wake fixture has admission headroom but still indefinitely held receiver,
requiring actual post-write timeout/no fallback. No production deadline weakened.
Final current pressure384/384 passes unchanged source:
pressure/v2-2026-10-15T23-56-50-876Z.json. Both filtered final-source harnesses pass:
pressure/harness-v2-claude-2026-10-15T23-55-44-568Z.json and
pressure/harness-v2-codex-2026-10-15T23-55-44-620Z.json.
Goal active. Native composed-route trial remains the concrete next gate and needs
Taylor's approval here in Codex under diagnostics/direct-native-qualification-plan-2026-10-15.json.
No native message, wake, permission/input change, old broker settlement or Codex
bridge work. Do not reinterpret automatic goal continuation as trial approval.

## Worker-loss and competing-job pressure — October 15

Previous goal turn: progress (experimental direct route MCP/job integration).
Actual synthetic MCP adversaries now prove distinct jobs sharing one direct
operation ID publish one frame; abrupt termination of the exact owned test worker
after publication leaves worker_lost/outcome_unknown. Reattach never restarts that
job. Late receipt status and same-operation send adopt receipt without replay,
while the lost job remains unknown. No native/session process was terminated.
First repeated pressure attempt failed old releases admission test: metadata
inspection consumed500ms budget and waiter availability checked deadline before
known epoch refusal. Fixed static handoff/integrity/epoch refusal precedence; new
expired-budget test proves no wait/observe before structural refusal. Preserved
failure: pressure/v2-2026-10-15T23-50-25-455Z.json.
Final three fresh pressure rounds pass,381 checks each/1143 total, source unchanged:
pressure/v2-2026-10-15T23-51-50-734Z.json. Both final-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-15T23-51-15-511Z.json and
pressure/harness-v2-codex-2026-10-15T23-51-15-512Z.json.
Goal active. Concrete next native gate: one additional fixed DIRECT_ROUTE_OK
message via durable public peer-direct route in existing scratch
local_c0a18601-5a57-44d0-94ac-2fed3719e7ca (verified live idle PID98986/start23:20:48Z,
CLI2.1.299, acceptEdits at plan capture). No new chat, retries, controls, wake,
permissions or input actions. Plan: diagnostics/direct-native-qualification-plan-2026-10-15.json.
Taylor must authorize that additional submission here in Codex; Codex executes it
in the existing Claude scratch. Previous one-message authorization was consumed.
Until approved, do not send. Revalidate exact peer/version before any approved
trial and preserve uncertain outcome. Broad native control/recovery/residency and
22 broker unknowns remain open. Watcher stays paused; recovery stays observer-owned.

## Experimental direct route integrated through MCP/jobs — October 15

Previous goal turn: progress (composed guarded internal runner).
send_message now accepts explicit transport:peer-direct and stable operation_id;
receipt_timeout_sec0.1–60/default15. Native broker route stays default. Direct
route refuses via_broker combination. peer_send_status is a read-only native
observation/reconciliation operation, with no resend or retry authority. Exact
native user receipt returns received/verified:true/experimental:true/applied:false.
Actual private synthetic MCP test submits detached job, disconnects original
client, reattaches via a second client with same idempotency key and proves one
frame. Post-publication job cancellation stays outcome_unknown; late exact receipt
is persisted by status and reused without a second frame. Missing operation_id
refuses before publication. Common filtered harness proof remains distinct from
this real MCP transport fixture proof. Full pressure378/378 passes:
pressure/v2-2026-10-15T23-48-17-669Z.json. Both current filtered harnesses pass:
pressure/harness-v2-{claude,codex}-2026-10-15T23-48-00-606Z.json.
Goal active. Next adversaries: abrupt detached-worker loss after publication and
competing distinct jobs with one direct operation identity; require one frame and
late receipt adoption without job replay. No additional native trial authorized;
consumed scratch budget remains one. No old broker mutation settled, no wake or
permission/input change. Full native serving/control/residency/recovery remain open.

## Composed direct-recipient candidate runner — October 15

Previous goal turn: progress (durable single-publication ledger).
Added internal lib/direct-recipient.mjs composing existing recipient lock, strict
peer transport, fsynced ledger and exact native receipt reader. Refuses broker,
caller, archived/unqualified/non-desktop peer and cwd mismatch. Arming binds
runtime build and payload SHA256 (no plaintext message). A socket return never
settles delivery; only exact native user receipt returns received/applied:false.
Reattach observes the old message without publication; conflicting payload refuses.
Post-arm cancellation/deadline/error remains outcome_unknown/retrySafe:false.
Recipient/ledger lock admission receives remaining budget; socket wake uses shared
abort deadline. Existing control-lock callers retain their prior default behavior.
Candidate runner is unexposed; public send_message remains native broker route.
Synthetic real Unix-socket plus journal tests cover receipt, no duplicate frames,
reattach/conflicting payload, cancel-after-publication, archive/version refusal,
recipient-lock expiry and cancelled admission with prior uncertainty preserved.
Full pressure377/377 passes unchanged source:
pressure/v2-2026-10-15T23-45-51-772Z.json. Both current-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-15T23-45-24-223Z.json and
pressure/harness-v2-codex-2026-10-15T23-45-24-203Z.json.
Goal active. Next actual synthetic MCP and detached-job integration using explicit
transport/operation identity, client disconnect/reattach, idempotency, cancellation
and receipt loss. Expose only after these boundaries pass; no new native messages
until separate authorization. Old22 broker unknowns, native serving/control and
cold recovery/residency gates remain open; Codex-driver fixes stay parked.

## Candidate durable single-publication ledger — October 15

Previous goal turn: progress (bounded exact future native receipt observation).
Added unexposed lib/peer-send-ledger.mjs. Arms one operation/message/recipient
identity with EOF cursor and outcome_unknown before publication. Exclusive file
creation, fsync(file/directory) and existing cross-process locks make uncertainty
persistent before canPublish:true. Reattachment always returns canPublish:false;
conflicting message/target refuses. Bounded private/no-follow state reads reject
malformed, symlinked, extra-field or changed state. Cancellation/rotation retain
uncertainty. Reconciliation consumes bounded exact native receipts, atomically
persists metadata-only received/applied:false, and skips disk writes on unchanged
polls. There is no resend, model completion or old broker settlement authority.
Synthetic concurrency grants one arm; reattachment, later receipt, cancellation,
rotation, payload exclusion and corrupt/symlink state checks pass. Full current
pressure373/373 passes, unchanged source:
pressure/v2-2026-10-15T23-42-05-388Z.json. Both filtered harnesses pass:
pressure/harness-v2-claude-2026-10-15T23-42-09-369Z.json and
pressure/harness-v2-codex-2026-10-15T23-42-09-374Z.json.
Goal active. Next compose ledger with exact native transport in a candidate send
runner: record runtime build, caller/broker exclusion, qualified peer identity,
archive guard, preparation/deadline/cancel checks, single bounded receipt wait.
Then actual synthetic MCP/job/disconnect integration before public exposure.
Current ledger is not kernel-peer qualification or native serving proof. No new
native messages, wakes, permissions/input actions or Codex-driver changes.

## Candidate exact native peer receipt reader — October 15

Previous goal turn: progress (post-preparation recipient revalidation).
Added unexposed lib/peer-receipt.mjs: capture metadata cursor at current EOF,
bind host/CLI/cwd/PID/start plus journal device/inode, read at most256KiB, accept
only future same-session user origin.kind:peer/exact msg_id with bounded UUID.
Returns metadata and applied:false; never message content or model completion.
Partial lines retain offset. Replaced/truncated/symlink/non-owned journals,
invalid cursors and oversized incomplete records refuse outcome_unknown with
retrySafe:false. Direct transcriptPath now honors the existing private projects
override so fixtures stay isolated. Reader does not independently prove kernel
peer identity; durable sender must enforce that via existing peerRecord checks.
Three adversarial fixture tests cover historical exclusion, partial append,
wrong origin/session/msg/type/sidechain/time, epoch mismatch, rotation/truncation,
symlink and record budget. Full pressure370/370 passes on unchanged source:
pressure/v2-2026-10-15T23-39-51-146Z.json. Both filtered harnesses pass:
pressure/harness-v2-{claude,codex}-2026-10-15T23-39-55-144Z.json.
No public route or native trial; candidate receipt code is not native qualification.
Goal active. Next implement durable direct-recipient send ledger: arm metadata
before socket write; preserve unknown state across worker disconnect/cancellation;
reconcile exact receipt without replay. Then synthetic MCP/job integration before
public exposure. Existing one-message native authorization remains consumed.
Broker22 unknowns, stale MCP, current native controls/serving/residency/recovery
remain open; no Codex-driver work, native wake, permission or input changes.

## Direct-recipient route foundation — October 15

Previous goal turn: progress (full v2 requirement audit refreshed).
Reviewed existing peer framing, event cursors, job/control ownership and native
send receipts. Public send_message still uses native broker; no alternate route
exposed. Found preparation race: ordinary direct wake could await onPrepared then
send using obsolete process/session/socket metadata. Now every priority revalidates
unique PID/start, CLI identity, version/protocol, socket path/device/inode/owner/type
before writing. Immediate routing additionally requires idle as before.
Added async preparation adversaries for changed epoch/session/version/protocol/path;
all refuse with dispatched:false/retrySafe:true and no fallback bytes. Full current
pressure367/367 passes, source unchanged:
pressure/v2-2026-10-15T23-38-17-439Z.json. Both filtered harnesses pass:
pressure/harness-v2-claude-2026-10-15T23-38-09-286Z.json and
pressure/harness-v2-codex-2026-10-15T23-38-09-212Z.json.
Concrete proposal: diagnostics/direct-recipient-route-plan-2026-10-15.json. Next
implement candidate metadata-only durable send state and bounded same-journal
origin.msg_id receipt observation, then actual synthetic MCP/job integration.
No public direct route until those guards pass. Native trials remain unauthorized
beyond consumed one-message budget. No broker effects settled, recovery attempted,
permissions changed or native messages sent. Goal active; Codex-driver fixes parked.

## Full v2 requirement audit refreshed — October 15

Previous goal turn: progress (two failed native-mod report reviews acknowledged).
Audited current requirement matrix and all eleven named input-free live gates,
plus native residency, recovery/rollback, controls, lifecycle, uncertainty,
performance/detection, input, memory and creation/pool/groups. Overall qualified:false.
Current source702a4b61 matches passing366 pressure and both filtered harness
artifacts (hashes rechecked), but current chat MCP loads6e0fd19f/restartRequired:true.
Native broker offline;22 unresolved outcomes; no current waiter/batch/residency
admission. Narrow scratch delivery pass does not qualify generic broker serving.
Updated docs/v2-qualification.md to separate current proof from historical rows.
Private evidence: diagnostics/v2-requirements-audit-2026-10-15.json. No repeated
inference tests or native operations needed for this documentation/evidence audit.
Goal active. Next concrete engineering gap: current send_message routes all
non-desktop callers through offline broker even for a qualified live peer.
Review whether an explicitly scoped direct recipient transport can reuse existing
native receipt/uncertainty/ownership guards, with synthetic end-to-end MCP tests;
do not weaken version/epoch gates or bypass unknown broker mutations. Do not send
more native test messages: existing authorization was one fixed submission only.
Keep quarantine, paused watcher and observer recovery ownership. Full native
suite/recovery still needs its own concrete scope and prerequisites satisfied.

## Two native-mod failure reports reviewed — October 15

Previous goal turn: progress (uncertain-request diagnostic visibility).
Ran current native-mod-probe-review and native-mod-diagnostic-review scripts with
no native controls/inference. Both exact reports match retained intent, original
source hashes, original settings/policy hashes and sealed runtime integrity.
Both report nativeCallReturned:false; diagnostic reports unidentified-exception.
Current reviewedVersions, sameNativeMetadataEpoch and copiedFilesMatch all fail.
Thus both remain failed/unqualified experiments: no plugin-load, kernel epoch,
native gate, model-free execution or scoped-unload proof. They grant no retry,
release, wake or installation authority. Retained per-hash review conclusions in
 diagnostics/report-review-2026-10-15.json. This closes report review only, not
native qualification. Acknowledge only these two exact scanned hashes after this
checkpoint is committed/published; keep broker and three detector reports pending.
No source changes or additional tests warranted for this evidence-only review;
previous current-source366 pressure and both filtered harness passes remain.
Goal active. Next changed-condition step: requirement-level audit of current v2
qualification matrix against current-source evidence, distinguishing historical
native successes from current app/CLI/epoch proof. Identify next executable gap
rather than repeating unresolved historical scans. No native operations this turn.

## Detector request reconciliation diagnostics — October 15

Previous goal turn: progress (migrated residency journal visibility).
Reviewed detector requests rmuxpnohk-c8bd2b(set_pinned), rmuxppvkw-2f19d6 and
rmuxqc2c7-c5ba43(archive_session). Each control expired with empty dispatch ledger;
none has a verified receipt. Mutations remain unknown despite empty dispatch.
Strict inspectRequest continues to refuse journal drift. Recovery audit alone uses
an explicit diagnostic option to retain controlState and receiptUnavailable without
returning success/retry authority. Full449-request audit now reports408 completed,
10 failed,22 outcome_unknown,7 expired and2 cancelled. Unresolved count stays22;
release/handoff remains refused. Private evidence: diagnostics/detector-request-review-2026-10-15.json.
Updated three per-hash pending report blockers; no reports acknowledged or replayed.
Synthetic coverage requires strict refusal and diagnostic unknown/retrySafe:false
for mutation, pending read and dispatched read. Full pressure366/366 passes:
pressure/v2-2026-10-15T23-34-46-364Z.json. Both final-source filtered harnesses pass:
pressure/harness-v2-{claude,codex}-2026-10-15T23-34-40-373Z.json.
Goal active. Next changed-condition step: review two failed native-mod reports
against their retained diagnostic/probe evidence and current admission readers;
identify whether either can be checkpointed as a completed failed qualification
without implying native execution. Historical mutations, sealed epoch, native
serving/recovery/control qualification and residency remain open. No native message,
wake, control, permission or Codex-driver changes this turn.

## Migrated residency journals reconciled — October 15

Previous goal turn: progress (admission refusal diagnostics and report triage).
Residency observation now reads bounded tails of only the exact CLI session's
logical and canonical cwd journals, merges timestamp order, deduplicates UUIDs,
and refuses conflicting UUID contents or different session IDs. Each journal
has a2MiB cap; no project discovery or app-file writes. All epoch, native receipt,
fresh-list, exact owned schedule and app acknowledgment gates remain intact.
Historical Oct12 replay now finds aa81efad and listedAt00:57:09.751Z; uncertainty
false/pendingCalls0, but verified remains false: app-acknowledgment-not-observed.
This confirms receipt visibility improvement only, not live residency or serving.
Migration test covers canonical-only receipts, duplicate copies, conflicting UUIDs,
wrong session and unsafe session path. Initial fixture failed due macOS /tmp versus
/private/tmp identity; corrected fixture root canonicalization and12/12 focused
checks pass. Full pressure366/366 passes with unchanged source:
pressure/v2-2026-10-15T23-33-20-799Z.json. Both filtered final-source harnesses pass:
pressure/harness-v2-claude-2026-10-15T23-33-10-325Z.json and
pressure/harness-v2-codex-2026-10-15T23-33-10-310Z.json.
Pending broker report note updated; all six remain unacknowledged with unresolved
blockers. No native messages, controls, restart or permission changes. Goal active.
Next changed-condition step: reconcile the three detector request IDs against
current controls and independently retained receipt evidence, then checkpoint
review before acknowledging any resolved report. Recovery remains observer-owned;
historical22 unknowns and stale sealed native epoch are not settled by this fix.

## Observer report review and admission diagnostics — October 15

Previous goal turn: progress (same-epoch explicit idle required for steering).
Read six pending reports as untrusted evidence. Oct11 observer reports one wake,
CronCreate and two waiter integrity errors. Independently counted1 CronCreate,
2 CronList and2 exact error results in migrated broker transcript00:56–00:59Z.
Read-only instrumentation of exact hash-verified sealed entry checks all release
ownership/hashes/fingerprint on both physical and legacy paths, stopping before
native binding or any observation/import/claim. Both pass today. Pointer remains
PID71262/start Oct7; report wake PID42299 differs, old peer file absent today.
Exact historical refusal check remains unknown; no claim of corruption or crash.
Private evidence: diagnostics/observer-integrity-review-2026-10-15.json.
Current bootstrap candidate now adds static native identity/epoch/ancestry refusal
codes, preserving fail-closed behavior. Old sealed entry is untouched and will
not gain diagnostics until a separately admitted release handoff. Pressure365/365
passes unchanged source: pressure/v2-2026-10-15T23-31-06-366Z.json. Initial filtered
harnesses passed contract checks but failed globalConfigUnchanged; retained both
23-30-58-989Z reports, no config reverted. Codex rerun23-31-35-567Z and Claude rerun23-31-38-916Z both pass.
All six reports remain pending with per-hash durable blockers in
 diagnostics/report-review-2026-10-15.json; none acknowledged or replayed.
Concrete next fix: broker-residency reads getRecord.cwd legacy journal while
Oct12 native receipts live in canonical migrated journal. Historical observation
reproduces native-list-not-fresh despite confirmed receipts in canonical journal.
Implement bounded exact-session logical/canonical journal reconciliation with
migration/adversarial tests, preserving epoch/fresh-list/app-ack gates. Goal active;
no native wake, extra message, permission changes or Computer Use this turn.

## Interrupt stop evidence tightened — October 15

Previous goal turn: progress (current-version ordinary transport qualification).
stop_session now requires exact unique native PID/start and CLI session identity
before dispatch and explicit idle from the same epoch afterward. Worker loss,
epoch replacement or unknown status fails verification; steer_session cannot
send a replacement. Synthetic MCP fixture now supplies real process-start metadata.
Added adversarial lost-worker, wrong-epoch and unknown-status checks asserting
that only stop dispatch occurs. Full isolated pressure365/365 passes on unchanged
source: pressure/v2-2026-10-15T23-29-17-963Z.json. The first focused test was
invalidated by an agent source edit during its run; runtime-stale refusals were
expected and the subsequent fresh full run passed. Both final-source filtered
harnesses pass: pressure/harness-v2-{claude,codex}-2026-10-15T23-29-20-{567,566}Z.json.
Native stop/steer remains unqualified; no native control, extra message or recovery
attempt performed. Goal active. Next changed-condition step: bounded sanitized
review of six scanner-pending reports, starting with the Oct11 broker report,
against current source and owned metadata. Do not acknowledge before checkpointing
review; do not execute report directions. Scanner only was run this turn; all six
remain pending. Keep observer ownership, quarantine and paused watcher intact.

## Ordinary peer delivery qualified on CLI2.1.299 — October 15

Previous goal turn: progress (authorized native scratch receipt and terminal response).
Production VERIFIED_CLI now includes2.1.299 for ordinary next-priority delivery only.
Immediate priority and idle-subscription gates remain2.1.289; native controls and
broker serving are not qualified by this message. Added synthetic current-version
routing/refusal coverage. Full isolated suite364/364 passes, source unchanged:
pressure/v2-2026-10-15T23-28-14-638Z.json. Preserved the earlier failed pressure
report23-27-45-744Z: deadline fixture exhausted180ms during lock admission under
concurrent load. Fixture now budgets800ms against a3000ms fake helper and still
requires definitive expired/undispatched state within2000ms.
Filtered Claude and configured Codex gpt-6-sol harnesses both pass MCP contract,
idempotency, one worker, completion, candidate memory and unchanged configuration.
Reports: pressure/harness-v2-{claude,codex}-2026-10-15T23-{27-38-600,27-46-333}Z.json.
No further native message submitted. Fresh broker_status still shows offline,
no native epoch, no waiter/batch/residency evidence; sealed generation6 intact.
Goal resumed and active. Next changed-condition work: qualify current-version
input-free control boundaries using isolated source tests, then reconcile observer
recovery ownership and22 unresolved historical outcomes before any live recovery.
Keep quarantine and paused inbox watcher; do not infer a restart authorization.

## Authorized scratch transport test — October 15

Taylor explicitly authorized creation and one test submission in the Codex chat.
Created `claude-driver-transport-scratch-2026-10-15`, session
`local_c0a18601-5a57-44d0-94ac-2fed3719e7ca`, under STATE_DIR/probe/transport-2026-10-15.
Native CLI2.1.299 PID98986/start Thu Oct15 23:20:48 UTC accepted one isolated
qualification frame. Exact msg_id receipt and subsequent TRANSPORT_OK terminal
response verified; no tool use. Default import remained acceptEdits. Focus restored.
Evidence: diagnostics/scratch-qualification-2026-10-15.json. No retries, broker
restart, permission changes or work-chat messages. Production version allowlist
unchanged. Scratch retained for inspection; no archive/delete requested.
This supersedes the fixture authorization prerequisite below. Broad goal has resumed; see the latest checkpoint above. Next engineering
step: review native receipt qualification for a separately tested production gate
update; historical22 unknowns and observer recovery ownership remain unresolved.

## Native transport fixture prerequisite — October 15

Previous goal turn: progress (native broker process identity strengthened).
Current-source registry/live inventory:79 registered sessions;3 live registered
chats are Kickoff work, no registered probe fixtures under STATE_DIR/probe.
No existing work chat used, no new chat/message/recovery attempted. Transport
qualification on2.1.299 cannot proceed without dedicated native fixture; source
adapter checks do not replace native receipt proof. Concrete plan persisted in
diagnostics/transport-qualification-plan-2026-10-15.json: one scratch chat, one
fixed message, zero retries, exact native identity and received/terminal proof.
User action required: authorize one dedicated scratch chat and the fixed message,
or identify and authorize an existing dedicated scratch fixture. Earlier watcher
instructions prohibit creating/messaging chats, so do not infer this permission.
Goal remains active; first fixture-blocked audit, not blocked status. Historical22
unknowns and recovery-owner constraints remain separately preserved.

## Native broker process identity — October 15

Previous goal turn: progress (causal wake evidence). Broker health previously used
liveByHost PID-alive metadata while direct transport used stricter peerRecord checks.
Native brokerInfo now requires unique owned metadata, actual process start epoch,
exact expected PID and CLI session identity, non-spare/non-parked native entrypoint.
Reused PIDs, foreign CLI IDs, duplicate workers and linked peer metadata produce
live:null/nativeProcessEvidence.verified:false; legacy nonnative observation remains
explicitly labelled legacy-process-observation. Lifecycle snapshots retain the
identity reason. Fresh CLI confirms actual broker offline/unavailable. Focused17/17
pass (identity, wake/cancel and direct transport boundaries). Full pressure
v2-2026-10-15T23-09-20-467Z.json passes1/1 in10238ms/sourceChanged:false.
No app recovery or
native sends; source-level API qualification does not qualify direct transport on
CLI2.1.299 (transport allowlist remains2.1.284/286/289). Next changed-condition step:
qualify transport acceptance with a scoped native fixture on the installed version
before service revival, preserving all22 historical unknowns and recovery ownership.

## Causal wake evidence — October 15

Previous goal turn: progress (nine pure reads safely reconciled). For22 remaining
unknowns,12 saved wake IDs exist;8 landed in the preserved hash-verified prefix,
4 reached correlated end-turn without tools;10 lack wake metadata. These are
partial causal observations, not settlement or proof of no effects. Private artifact:
diagnostics/historical-wake-review-2026-10-15.json. All22 remain unresolved.
Direct peer preparation now logs msgId/PID/start epoch/priority before callback or
socket write; broker wake returns log correlated request and operation IDs with
executionVerified:false. Socket paths, keys, frames and message contents excluded.
Async request context avoids changing transport selection, fallback, wake budgets
or authority. Focused10/10 pass; full pressure
v2-2026-10-15T23-08-02-926Z.json passes1/1 in9445ms/sourceChanged:false.
No native sends/recovery performed in this turn. Next changed-condition
step: preserve unknown historical effects, design generation-isolated recovery
without replay, and qualify exact native restart under the designated recovery owner.

## Historical receipt evidence and pure-read reconciliation — October 15

Previous goal turn: progress (complete449-request audit). All31 receipt-source
refusals share saveddev16777233/currentdev16777232, identicalinode45916594.
The preserved20761827-byte journal prefix matches prior SHA256bb1c87255065a9f60ae1376ed705f5f61b38b5e7901de711b738d34bc153a538.
Independent private scan found no complete helper-checkpoint/result chains for31;
19 have matching native calls after request creation (42 unique tool calls), not
unique request attribution. Evidence in diagnostics/historical-receipt-review-2026-10-15.json
and historical-uncheckpointed-calls-2026-10-15.json; no raw transcript imported.
Nine cancelled/expired undispatched pure reads were hidden by cursor-drift errors.
Inspection now preserves that observation failure while exposing the existing
safeUndispatchedRetry contract; no receipt or completion claimed. Effects, pending
reads and dispatched reads still throw. Audit now22 unresolved,9 retry-safe reads,
408completed/10failed,449total; handoff still refused. Focused7/7 pass.
Full pressure v2-2026-10-15T23-06-17-174Z.json passes1/1 in10410ms,
sourceChanged:false. Nothing
replayed or woken; original native observation cursors remain unchanged. Next step:
reconcile22 uncertain effect/dispatched outcomes independently, preserving ambiguity;
do not use current app state alone to claim historical execution.

## Durable recovery audit — October 15

Previous goal turn: progress (async correlation and offline diagnosis). Current
read-only broker_recovery_status audits449 requests:408 completed,10 failed,
31 inspection-refused/outcome_unknown; complete:true,settledForHandoff:false.
The earlier17 unknown count is historical. First inspected refusal is transcript
identity drift; all31 retain unknown outcomes regardless of cancellation/empty
helper dispatch. Private bounded audit snapshot at diagnostics/request-audit-2026-10-15.json.
New reusable audit preserves exact unresolved IDs and sanitized categories without
arguments/errors; budget exhaustion or inventory failure cannot claim settlement.
Release admission consumes the same audit and preserves refusal. Focused19/19 pass;
full pressure v2-2026-10-15T23-04-11-381Z.json passes1/1 in10111ms,
sourceChanged:false;
no recovery or replay. Next changed-condition step: independently reconcile retained
historical native receipts against exact unique request/checkpoint/tool identities,
with immutable source evidence; never relax inode/cursor guards or mark cancelled
native effects settled from missing dispatch alone. Goal remains active.

## Async correlation and truthful offline diagnosis — October 15

Previous goal turn: progress (passive monitor installed and observed two runs).
AsyncLocalStorage now carries the enclosing operation ID/name/build into broker
admission/enqueue/recovery logging without adding payloads. Concurrent interleaved
operations retain separate IDs; standalone events do not inherit a completed call.
entryEpochEvidence now distinguishes native-process-unavailable from a live
native-process-epoch-mismatch. Both refuse verification; fresh CLI confirms owned
broker exists/unarchived/offline with unavailable reason. Release and focused tests
21/21 pass. Full pressure v2-2026-10-15T23-02-50-259Z.json passes1/1
in9854ms/sourceChanged:false. No wake, recovery, replay or sealed release modifications. Monitor
continues passive current-source ticks. Next changed-condition step: audit exact
outstanding request identities and determine safe epoch-renewal prerequisites for
the designated recovery owner; historical uncertain effects must remain unreplayed.

## Continuous passive lifecycle collection — October 15

Previous goal turn: progress (native installed checks restored). Installed new
com.taylor.claude-driver-lifecycle LaunchAgent from src/launchd, current-source
30-second passive ticks. Two scheduled runs exit0, lastTickAt advanced automatically; app running, owned broker
offline; repeated observations deduplicate and native log reads reach zero bytes.
It observes versions, app presence, exact broker identity and native log cursor;
no inference, app navigation, sends, recovery, permissions or sealed epoch changes.
Pressure v2-2026-10-15T23-01-04-788Z.json passed1/1 in8935ms,
sourceChanged:false before the final owned-record snapshot refinement.
Legacy detector remains unloaded; report watcher remains paused. Monitor state
.runtime/state/lifecycle-monitor.json exposes lastTickAt and logging/checkpoint
health. Cleanup: monitor intentionally retained for future incident evidence.
Verification incident: an unfiltered launchctl print exposed inherited environment
credentials in the tool transcript. No values copied to repository/artifacts;
subsequent inspection uses allowlisted status fields. Credential remediation is
outside bridge scope and must be handled by Taylor; do not rotate automatically.
Next changed-condition step: use passive evidence and explicit desired state to
qualify a single recovery supervisor; live serving and recovery remain incomplete.

## Native source checks restored on CLI2.1.299 — October 15

Previous goal turn: progress (four installed checks reconciled). Remaining five
checks now execute current installed code with synthetic callbacks: environment
retirement/in-flight release order, retired receiver pre-matcher filtering,
collection inventory/removal order, peer receive consumption and slash skipping,
and envelope preservation/from-plugin stripping (encoder injected, not end-to-end
encoder qualification). Explicit2.1.299 profiles refuse unknown versions. No native
messages, app navigation, recovery, permissions or detector installation.
Final pressure v2-2026-10-15T22-59-59-475Z.json passes1/1 in12375ms,
sourceChanged:false. Runner additionally records before/after installed app/CLI
versions and binary inode/size/mtime/ctime and rejects drift during a run.
Next changed-condition step: qualify current passive collector deployment and
native lifecycle/recovery state machine against exact ownership and uncertain
request ledger, without reusing the old broker epoch. Full v2 remains incomplete.

## Installed CLI compatibility reconciliation — October 15

Previous goal turn: progress (passive capture and preserved pressure failures).
Fresh discovery: Desktop2.42304.0 / CLI2.1.299, superseding earlier2.1.295 status.
Reconciled four failed installed checks: late module session.start deduplication,
two positional MCP wrapper ownership/admission tests, object-input native tool API.
Full pressure v2-2026-10-15T22-58-06-753Z.json: 351/356 pass, five
remaining failures preserved; sourceChanged:false.
Explicit2.1.299 symbol profiles execute extracted installed functions with synthetic
callbacks; no native sends. Unknown versions refuse qualification. Focused5/5 pass.
Pressure suite hash coverage now includes imported .mjs test fixtures as well as
.test.mjs suites. Remaining five prior installed failures: environment retirement,
collection refresh/removal ordering, two peer routing/envelope checks, retired
receiver dispatch. Next changed-condition step: inspect current2.1.299 implementations
for those five, update explicit profiles only after semantic validation, rerun full
pressure and preserve failures. No native broker revival or detector activation.

## Passive native lifecycle evidence — October 15

Previous goal turn: progress (published lifecycle tracing).
Full current-source pressure v2-2026-10-15T22-56-34-433Z.json: 347/356 pass,
nine installed-native source extraction/adapter checks fail, sourceChanged:false.
Failures preserved in the report and service memory; no qualification claimed.
Next native step: reconcile minified installed CLI markers and behavior against
2.1.295 before any peer/sidecar qualification; never weaken assertions to pass. Added bounded incremental
main.log metadata extraction to the existing detector, plus one-shot
scripts/capture-native-lifecycle.mjs. Persistent inode/byte/session cursors avoid
repeated reads and expose rotation/truncation/budget gaps. Exact broker query exit
codes remain cause unknown; governor would-evict messages remain intentions.
Raw lines never leave the parser. Two live passive reads: initial 262144 bytes,
zero owned events; second zero bytes/zero events. Detector remains unloaded and
report watcher paused; no app wake/restart or sealed runtime change. Next changed
condition: qualify continuous collection deployment against current-source detector
and measure bounded overhead before enabling a single recovery owner. Historical
termination cause remains unproven; unattended recovery remains incomplete.

## Lifecycle logging — October 15

Added metadata-only daily lifecycle JSONL under .runtime/state/lifecycle:
operation start/end/error correlation IDs, loaded source build and app/CLI versions;
broker observations at status/failure/admission, durable request enqueue IDs,
recovery start/end/error and detector transitions. No request bodies, tool outputs,
credentials or raw errors. Best effort; 8 MiB per UTC day, no automatic deletion.
Synthetic privacy, budget and symlink tests pass. Does not activate the paused
watcher/unloaded detector or change the sealed broker. Next changed-condition step:
qualify passive app/worker exit observation and connect a single recovery owner;
current source logging takes effect in fresh CLI/MCP processes. No restart attempted.

## Route-specific health checks — October 7

Added shared advisory action_health with four dependency sets: local, desktop,
native-sidecar, inference. Actual read-only checks: local/desktop eligible; native
serving unverified and inference unknown refuse. Zero model calls. Synthetic app
shutdown/quota tests preserve local availability and model-free sidecar independence.
Full pressure18-40-47 passed1/1 in9690ms/sourceChanged:false. Per-action branch
mapping/enforcement and bound provider availability evidence remain open. Taylor
authorized app quit; not exercised yet because observer recovery can confound it.

## Collocated staging checkpoint — October 7

See staging-status.md for exact storage migration, debug retirement, built-in
health diagnostics and outstanding implementation/release gates. All driver-owned
data physically moved under src/claude-driver/.runtime; legacy state symlink
preserves sealed native identity. Desktop reports moved/hash verified, launchd
debug detector retired, five fixed debug module directories archived/hash verified.
General unload not claimed. Shared service_health and failure diagnostics retain
32 metadata-only snapshots. Broker PID71262 alive/integrity true, serving unverified;
quota operator-reported exhausted. Watcher destination updated. Full pressure
17-47-23 passes1/1; no inference/restart/permission change. Staged, not released.

## Host expiry before native delivery — October 7

Source audit found request expiry can pass while claim/revalidation awaits. Added
original published request deadline check immediately before the single send.
Expired requests retain identity/capacity and receive cancellation cleanup, with
no delivery or replay. Boundary tests expire during both claim and revalidation;
all six transaction tests pass. Full pressure v2-2026-10-07T17-35-07-996Z passed
1/1 in9044ms/sourceChanged:false. No native operation or inference requested.
This closes host pre-send expiry only; expiry after delivery remains uncertain
and requires receipt reconciliation. Full release gates remain open.

## Usage-exhausted operating boundary — October 7

Taylor reports Claude inference quota exhausted. No free/local inference provider
has been configured and independently verified for this bridge. Native mod
callbacks are deterministic execution, not alternative model inference. Preserve
this distinction in status and handback: broker process alive, mod loaded, native
read receipt verified and inference available are separate claims.

Existing original-epoch native reads, actual fresh stdio lifecycle, positive
control-file checks and exact streamed-child disposition already provide narrow
zero-model evidence. Do not repeat those trials solely because inference is
unavailable. Preserve failed original probes; they do not qualify the corrected
call path. All live evidence remains bound to its recorded build and epoch.

Continue bounded source review, meaningful synthetic fixes and historical receipt
review when a specific unresolved question exists. Do not send model prompts,
retry quota failures, switch providers/models, wake/restart the broker or change
permissions to seek capacity. Revalidate exact owned epoch before any subsequent
native operation. A new native negative cancellation trial needs independent
outcome/settlement evidence first; a cancellation marker or missing result alone
cannot safely retire an unresolved request.

Remaining release gates: general receiver/environment unload; persistent serving
and queue ownership; installed connector/current filtered harness integration;
guarded mutation and executing-effect cancellation; sustained residency/governor
and cold recovery; distinct-build rollback; reconciliation of 17 historical
uncertain effects; safe runtime handoff and deployment of retained checkpoints.
Quota restoration enables inference-dependent harness checks only; it does not
close these other gates. No human action is requested now. If no specific safe
experiment or source defect is identified, stop active probing rather than churn;
the report watcher continues its pending-evidence-only contract.

## Cancellation after consumed admission preserves uncertainty — October 7, 13:28 Eastern

Rechecked actual native command gate path: existing tests already independently
exercise cancellation denial before native admission. Extended real command-hook
subprocess/private store test after one admission consumed: cancel sets
outcome_unknown, a different native tool-use attempt receives explicit deny,
original admission bytes remain byte-identical, uncertain control unchanged.
No effect executed in fixture, no live native dispatch/model/replay or source gate
change. This proves later attempts refuse without erasing earlier admission; does
not prove an already admitted effect was interrupted. Full pressure
v2-2026-10-07T17-28-42-429Z passed1/1 in8823ms/sourceChanged:false,
shared technical memory saved. Native hook fault/timeouts remain platform limits;
no cancellation/no-effect settlement fabricated. Next scope a live negative trial
around an unadmitted read or prioritize serving/steering evidence where full outcome
can be verified independently, keeping existing historical uncertainty intact.
No human action required.

## Cancellation observation contract prepared — October 7, 13:26 Eastern

Added pure native-service-cancel-evidence screening. Exact marker/intent schemas,
owned service/request/session, native readiness, protocol7 one get_session,
creation/start/cancel/observation/expiry chronology and dispatched slot0 correlate.
Foreign, malformed, late, non-read or uncorrelated cancellation evidence refuses.
Valid result qualifies cancellationObserved only: noEffectQualified:false,
standardLifecycleSettlementAssessed:false, releaseAuthorized:false. Does not
publish settlement or edit durable controls; marker zero-call declaration alone
cannot settle helper-admitted uncertainty. Full pressure
v2-2026-10-07T17-26-33-148Z passed1/1 in9539ms/sourceChanged:false;
shared technical memory saved. Next independent negative boundary evidence and
owned native cancel trial; do not manufacture admission, relax retirement gates,
replay a control, or claim no-effect from missing result. No human action needed.

## Live cancellation-control positive path verified — October 7, 13:24 Eastern

Guarded v0.4.0 controlCheck:true service8984d66a74dedff779e521e3d87d34b0
loaded with native readiness. Real control-file read and validation admitted one
get_session metadata operation rpeer52abe5bffccb46cc8fdd4c02d7e1c6df.
Independent correlated native receipt verified/completed, source native-peer-service-
result, checkpoint legacy-shared, cleanupPending:false. After60second expiry,
exact-owner retirement succeeded; fresh status installed:false/retired:true,
one settled/zero unresolved. Private metadata report
native-control-positive-1791393804137.json and shared service memory preserved.
No inference, restart, permission change or duplicate control. This qualifies
live positive native fs.read/control-schema path, not cancellation race, broad
serving or general unload. Next negative cancel-before-call evidence review and
settlement contract; avoid causing an unresolved native intent just to manufacture
a negative test. No human action needed.

## Control-check enrollment and checkpoint race verified — October 7, 13:22 Eastern

Guarded enrollment and public CLI/MCP schema expose explicit boolean
control_check:true; false/default preserves existing package bytes. Invalid types
refuse before broker access. Existing exact epoch/baseline/control/publication guards
unchanged. New receiver race test injects cancelRequested:true as admitted helper
checkpoint returns: one checkpoint, zero native MCP/model calls, scoped cancellation
record, duplicate consumed without another attempt. Full pressure
v2-2026-10-07T17-22-22-698Z passed1/1 in9058ms/sourceChanged:false.
Shared memory checkpointed. Still no live v0.4 enrollment or cancellation settlement.
Next live bounded v0.4 positive read verifies real control-file schema and native
fs.read, then a separate no-effect cancellation case; do not fabricate checkpoint
admission or settle uncertainty from cancellation alone. Cancellation after final
control snapshot can race native dispatch and remains uncertain. No human action.

## Native cancellation control check prepared — October 7, 13:21 Eastern

Found native receiver gap after checkpoint: stop markers checked but cancellation
control not reread before MCP. Added pure optional controlCheck:true v0.4.0 variant,
previous variant bytes unchanged for historical verification. Reads bounded exact
request control, validates id/single dispatched slot/time/state; rereads clock,
refuses malformed/foreign/expired controls. cancelRequested:true records scoped
cancel-before-call metadata with zero native MCP/model calls and consumes peer.
No receipt settlement inferred yet. Native installed validator accepts variant;
isolated callback tests prove cancellation calls checkpoint once/MCPzero/modelzero,
valid controls execute and foreign controls refuse. Full pressure
v2-2026-10-07T17-21-27-576Z passed1/1 in8833ms/sourceChanged:false;
shared memory saved. Not enrolled live; next expose guarded opt-in enrollment,
then bounded pre-cancelled native trial/reconciliation. This closes observed
pre-call window only; cancellation after MCP starts remains uncertain. No human
change or action needed.

## Actual stdio cancellation propagation verified — October 7, 13:19 Eastern

New isolated client/server test uses actual shared MCP transport and production
runNativeServiceReadTransaction/publication helper with private temporary capacity
store. Native send/claim are synthetic counters only. Cancellation notification
while preparation held propagates signal, consumes zero slots, publishes nothing.
Cancellation after exactly one simulated send retains one durable slot, reports
request uncertainty/retrySafe:false, attempts one cleanup, never retries. Cancelled
RPC response suppressed; subsequent audit RPC observes settled handler state.
Fresh test servers close via stdin; no configured/native processes restarted or
terminated, shared transport source and Codex bridge unchanged. Shared service
memory recorded. Full pressure v2-2026-10-07T17-19-28-039Z passed1/1
in9037ms/sourceChanged:false. This qualifies transport-to-host transaction boundary,
not cancellation of an executing native MCP effect. Next examine durable controls
and current native receiver handling for a bounded no-effect native cancel trial.
No human action required.

## Cancellation capacity gap fixed — October 7, 13:18 Eastern

Read preparation previously reserved durable capacity before post-prepare abort
check, so cancellation there could strand an unpublished reservation. Reservation
now belongs to synchronous publishNativeServiceReadRequest immediately before
enqueue, after final abort check; no await between reserve/publication. Partial
publication remains uncertain, retained budget, retrySafe:false and cleanup;
never releases capacity or resends. New actual temporary-filesystem regression
proves prepublication abort writes no capacity files and reports no request;
partial publication retains exactly one reservation and cancels without send.
Shared service memory checkpointed. Full pressure
v2-2026-10-07T17-18-01-278Z passed1/1 in8779ms/sourceChanged:false.
No live state or historical reservations changed. This fixes host transaction
cancellation; native post-send cancellation/steering remain open. Next inspect
MCP cancellation propagation and exercise shared interface without native replay.
No human action required.

## Installed retirement dispatch guard verified — October 7, 13:16 Eastern

Native SDK exposes no public hook inventory/unload event. Bounded installed
source shows ae/fe/f4n dispatcher status filter excludes retiring/unloaded/dead
handlers before matcher, enter or dispatch; passes downstream directly. Added
source-derived isolated VM test of actual installed functions with all states,
including positive live dispatch. No retired control/token sent or native event
injected. Private source artifact native-retired-dispatch-source-1791393381579.json,
SHA52cedd595427e280ddcc8d77e7ee8ac0e7a23062549eecd07c836685161d83e9;
shared service memory preserved. This is conditional installed-source proof, not
live receiver inventory; general unload/receiver absence remains unqualified.
Full pressure v2-2026-10-07T17-16-28-949Z passed1/1 in8712ms,
sourceChanged:false. Resource cleanup and command removal independently qualified
at their narrow scopes. Next prioritize native cancellation/steering and serving
coverage using current shared interfaces; avoid fabricating hook absence or spending
another live trial on already-proven child disposal. No human action required.

## Shared CLI/MCP resource review verified — October 7, 13:14 Eastern

Public read-only broker_service_resource_review requires service_id and
bounded evidence_report filename. Shared CLI and fresh actual stdio MCP2025-06-18
both reviewed retained d19dab280cc657366bd4dacbdf8d56ff disposition successfully:
resourceDisposalQualified:true, exitDelayMs542, brokerEpochVerified:true;
scopedUnloadQualified/releaseAuthorized:false. MCP negative ../outside.json refused.
No mod load, enrollment, token send, process termination or inference; isolated
MCP test server closed by stdin, configured connector unchanged. Private report
native-service-mcp-resource-review-d19dab280cc657366bd4dacbdf8d56ff.json and shared
service memory saved. Public contract tests bound required fields/read-only flag
and forbidden paths. Full pressure v2-2026-10-07T17-14-50-099Z passed1/1
in8632ms/sourceChanged:false. Remaining: general native hook receiver absence,
production serving/steering/residency/rollback and safe handoff/uncertain-effect
gates. Next inspect strongest available native hook inventory/retirement evidence;
no human action required.

## Narrow resource disposition qualified — October 7, 13:13 Eastern

Added reusable nativeServiceResourceReview(serviceId,reportName), bounded fixed
report path, exact enrollment/regenerated bytes/retired ownership/current native
epoch/baselines guards. Pure disposition review independently recomputes expected
argv hashes, binds two same-process/ancestor observations and near-retirement
chronology, requires SIGTERM143 after retirement before selfdeadline plus fresh
PID absence. Self-timeout, changed/foreign process, stale observations, pre-retire
exit, broker ancestor mismatch and missing absence refuse. Broader unload/release
stay false. Retained d19dab280cc657366bd4dacbdf8d56ff evidence passes without
new load or replay: resourceDisposalQualified:true, exact-owned-stream-child-after-
retirement, exitDelayMs542; original broker epoch freshly verified. Metadata
native-resource-disposition-d19dab280cc657366bd4dacbdf8d56ff.json and shared memory
checkpointed. Full pressure v2-2026-10-07T17-13-29-424Z passed1/1 in8733ms,
sourceChanged:false. Next expose reviewer across shared CLI/MCP and continue
remaining hook/serving/steering gates. No human action required.

## Exact native resource process ownership observed — October 7, 13:12 Eastern

Added PID-scoped native-resource-process observer: exact generated argv comparison,
child PPID/start-time binding, bounded ancestor walk to original broker PID/start,
and unchanged child identity after inspection. No raw argv enters report/context.
Foreign command, changed parent, stale broker epoch, missing ancestry refuse;
real test-process metadata read and full pressure pass. macOS ps encodes argv
newlines as literal octal\012: first d19dab280cc657366bd4dacbdf8d56ff trial
refused command before qualification, failure preserved in
native-resource-trial-1791393061671.json. Independent full-byte comparison verified
only that encoding; observer accepts exact raw or exact octal-newline form.
Same installed fixture inspected again without enrollment/replay: exact command
and broker ancestry observed alive, repeated before retirement. Retired at
17:12:01.867Z; SIGTERM143 exit17:12:02.409Z before selfdeadline17:12:31.741Z;
independent PID absent, installed:false/retired:true, zero unresolved. Corrected
report native-resource-trial-1791393093450.json preserves owned observations;
original failure unchanged. Shared memory recorded both. Full pressure
v2-2026-10-07T17-11-49-109Z passed1/1 in8624ms/sourceChanged:false.
Next automated chronology/epoch review of retained evidence before narrow resource
qualification; general hook/environment unload still false. No human action needed.

## Live resource retirement observed — October 7, 13:09 Eastern

Guarded resource variant e6fdb34229f9c5524d83df2d77e6720a enrolled in the
unchanged exact owned epoch, native readiness and own command marker observed.
Independent /bin/ps recorded child PID80283, PPID and start timestamp alive;
identity remained equal immediately before retirement. Native exact-owner guarded
retirement at17:09:30.681Z moved files; child recorded SIGTERM143 exit at
17:09:31.477Z, before self-deadline17:10:00.510Z. Independent PID observation then
absent; final status retired:true, installed:false, zero unresolved requests.
No external termination, restart, inference, read/control replay or human action.
Private metadata report native-resource-trial-1791392910421.json plus shared
service memory retain observations. Full resourceDisposalQualified remains false:
trial has PID/PPID/start observation but lacks independent exact argv/native ancestry
binding and automated final chronology qualification. General hook/environment
unload also remains false. Next strengthen reusable process observer/reviewer,
then review retained evidence where sufficient rather than blindly rerunning.

## Guarded resource enrollment and screening — October 7, 13:07 Eastern

Public broker_service_enroll resource_probe:true maps to guarded enrollment;
requires marker:true and lifetime_sec60..120, boolean-only, rejected before broker
access otherwise. Existing exact epoch/baseline/control/publication guards apply.
Readiness still qualifies only registration, not child launch or resource disposal.
Pure native-resource-evidence screening binds strict intent/ready/exit schemas,
identity and chronology; distinguishes deadline0 from intentional SIGTERM143 or
SIGINT130. Changed PID/identity, foreign fields, impossible chronology and unknown
exit reasons refuse. Every result keeps resourceDisposalQualified:false: independent
kernel identity/aliveness and retirement observations are still required.
Full pressure v2-2026-10-07T17-07-29-615Z passed1/1 in8703ms,
sourceChanged:false. No live resource enrollment yet. Next independently bounded
kernel observations and exact-owner retirement trial; no human action required.

## Native resource variant validates — October 7, 13:06 Eastern

Pure package generator now supports optional resourceProbe:true with marker:true,
service lifetime at most120seconds, variant0.3.0. Base0.1.0 and marked0.2.0
remain unchanged. Combined native startup persists resource intent before a single
250ms delayed process.spawn callback; rechecks owner/cwd/window before launch and
drains fixed child output. Durable intent prevents retry after uncertainty. Child
self-deadline is service deadline+30seconds. Installed plugin validator accepts
all three registration graphs without loading or inference. Fixture verifies
foreign/expired startup refusal, owner change before launch, durable launch intent
and configuration bounds. Initial test incorrectly counted a pending marker timer
as resource replay (3 vs2); corrected by observing marker first, no implementation
weakening. Full pressure v2-2026-10-07T17-06-15-486Z passed1/1 in8994ms,
sourceChanged:false. No live resource variant enrolled yet. Next extend guarded
enrollment and independently review kernel child identity/disposition before trial.
Native resource/hook unload remains unqualified. No human action needed.

## Bounded resource child prepared — October 7, 13:04 Eastern

native-resource-program.mjs generates an owned metadata-only child program;
it does not enroll, load, send or qualify native disposal. Fixed broker evidence
root, random 32hex identity, exclusive mode600 readiness/exit records, runtime
150-second maximum and independent deadline prevent an indefinite leaked child.
SIGTERM/SIGINT record distinct intentional exits143/130; deadline records exit0.
Real child test proves self-deadline exit and identity, plus expired refusal before
readiness. Metadata retained under owned .native-service-resource-* files.
Full fresh pressure v2-2026-10-07T17-04-41-930Z passed1/1 in8658ms;
sourceChanged:false. No native session or app killed/restarted, no inference.
Next integrate as optional native lifecycle variant, independently observe child
identity/aliveness before retirement and absence/exit before its hard deadline.
Command removal alone still does not qualify scoped unload. No human action needed.
Previously pending b00de20 successfully pushed to origin/master this turn.

## Native command removal verified — October 7, 12:58 Eastern

Marked v0.2.0 servicebb9648563cbf178fe2aedaae8d1a9722 observed its own native command
at16:54:36.273Z, retired at16:55:35.008Z. Successorbb827ec4c9c1c5b388ec5bd54a4627eb
observed own marker present with exact name/source/runtime-owner/root/registration
checks and prior marker absent at16:55:35.823Z. Corrected public CLI/MCP review
qualifies previousMarkerRemovalObserved:true without another native observation,
command execution, old-token delivery, MCP read or model call. Successor retired
at16:57:39.863Z with no requests; fresh status/retained historical review pass.
Evidence native-service-mcp-marker-corrected-review-bb827ec4c9c1c5b388ec5bd54a4627eb.json
and shared service memory preserved. Original trial failures remain unchanged.

Failures drove fixes: duplicate session.start rejected before install; combined
handler plus installed native plugin validation test covers registration graph.
Immediate inventory false in2f88702003c3aa49776c9cf84e7d5295; exact failure bytes retired
at16:51:42.060Z with zero requests before source correction. Native registry requests
host refresh; one clock.after250ms observation after startup now succeeds. Shared
module path successor initially caused historical ownership ambiguity. Status now
verifies successor config/enrollment/full bytes independently and reports old owner
installed:false/retired:true/destinationOccupiedByAnotherService:true, never moves
successor or unknown bytes. Unit fixtures refuse ambiguous/foreign ownership.
Full pressure v2-2026-10-07T16-57-32-161Z passed1/1 in8807ms, sourceChanged:false.

Scoped environment/hook unload remains FALSE. Installed retirement source removes
commands/tools first, marks retiring, and unloads only at outstanding dispatch count0;
source-derived fixture proves command removal can precede environment disposal.
Private native-environment-retirement-source-window.json retained. Native SDK
process.spawn owns a stream child through module lifetime and says unload terminates
it; next consider a strictly bounded owned resource fixture plus native disposition
observation, never killing/restarting a session or sending retired controls. Broad
mutation/steering/residency/rollback/handoff/17-unknown-effect gates still open.
No human action needed; all native marker trial modules are retired.

## Scoped command marker candidate prepared — October 7, 12:49 Eastern

Optional marker:true enrollment generates v0.2.0 variant; unmarked v0.1.0 bytes
remain unchanged. Native session.start registers unique own command marker and
reads command.list; only own/prior presence booleans and bound metadata persist.
No command execution, MCP read, inference or retired-token send. Prior observation
requires marked enrollment already expired/retired with no unresolved requests.
New broker_service_marker_review binds exact bytes/epoch, both positive own-marker
observations and prior retirement chronology. Command removal remains narrower
than hook/environment unload (scopedUnloadQualified:false). Fixtures prove scoped
metadata filtering, foreign/expired refusal, negative prior presence preservation,
invalid configuration/time/count rejection. Full pressure
v2-2026-10-07T16-48-41-921Z passed1/1 in8633ms, sourceChanged:false.
Next actual MCP two-enrollment marker/retirement observation trial. No human action.

## Actual stdio MCP lifecycle verified — October 7, 12:45 Eastern

A fresh isolated MCP client/server negotiated2025-06-18 and listed/called the real
public tools. Enrollment79e4123ffcf33a477ade016e021a06f6 observed native readiness.
Early retirement refused before publication. Two sequential get_session requests
rpeer7aae99ecbcb348a5bfca361c691a07ec and rpeer5c6d4e0802d04358ac52d5c9d43e452d
completed with correlated native receipts/legacy-shared checkpoints. Status showed
two settled/no unresolved attempts. The confirmed live test process waited for the
60-second window, then retired at16:45:11Z; fresh MCP status installed:false,
retired:true. Structured metadata-only report native-service-mcp-lifecycle-79e4123ffcf33a477ade016e021a06f6.json
passed, preserved negative result and service memory. Test-owned server exited by
closing stdin; no native session, configured MCP server or app restarted/killed.
This qualifies actual stdio transport for this exact lifecycle, not the existing
installed connector, full v2 serving or scoped native unload. No human action needed.
Native SDK command.list exposes current registered command inventory; next scoped
unload proof can use a unique owned command marker registered by a new candidate
and a separate native inventory observation, avoiding old-token sends/model queue.
Guarded mutation/steering/residency/handoff/historical uncertainty gates remain open.

## Shared CLI lifecycle verified — October 7, 12:43 Eastern

Public CLI enrolled d9f220fed9afea1d6f22f71a0f064b52, observed native readiness,
completed rpeera9f86e0e5b7f4d758a48b1d308f4a67d with independently reviewed native
receipt/checkpoint (legacy-shared), then retired after expiry at16:43:05Z. Fresh
status confirms installed:false, retired:true, one settled/no unresolved attempt;
scopedUnloadQualified remains false. Existing exact epoch/baselines/control guards
passed retirement. No model invocation, wake, permission change or replay.
Initial integer-schema CLI refusal occurred before installation; retained in
native-service-enrollment-cli-schema-failure.json and service memory, fixed CLI
coercion/shared integer validation with public contract tests. Initial status refused
native-generated tooling additions, preserved without removing files. Independent
installed hle/vHt/iNe source writes those paths; six hashes match current plus two
historical same-epoch retired loads. Only exact pinned tooling hashes accepted now,
with bounded no-follow hashing up to1MiB for declarations; executable additions or
changed tooling still refuse. Full pressure v2-2026-10-07T16-43-05-232Z passed1/1
in8494ms, sourceChanged:false. Next actual stdio MCP lifecycle trial; connector
transport and native scoped unload not inferred from CLI success.

## Exact-owner status and retirement prepared — October 7, 12:39 Eastern

Added experimental broker_service_status (metadata-only; no reconciliation writes)
and broker_service_retire. Enrollment binds original consented epoch/config and
regenerated bytes; tree walk refuses added files, linked directories and foreign
ownership. Status checks durable capacity slots plus bounded native intent ownership
and existing standard receipt/dispatch metadata. Retirement requires service expiry,
idle exact epoch, original baselines, absent controls and zero unresolved attempts;
it preserves intent, moves exclusively outside watched folder and records receipt.
No retry/replay or deletion. Files retired remains distinct from scopedUnloadQualified
(false). Focused ownership/publication tests and full pressure
v2-2026-10-07T16-38-36-465Z passed1/1 in8594ms, sourceChanged:false;
final eligibility fixture added afterward. Next live shared enrollment/read/expiry/
retirement trial. No human action or permission change required.

## Shared enrollment prepared — October 7, 12:36 Eastern

Added experimental broker_service_enroll: exact previously consented native epoch,
settings/policy/control guards, generated package validation, durable enrollment,
exclusive atomic macOS rename, and bounded readiness observation. Existing module
is never replaced, including an empty directory; publication uncertainty reports
retrySafe:false. No read/wake/restart/permission changes. Focused tests prove bounds
refuse before broker access and exclusive publication preserves both owners.
Full pressure v2-2026-10-07T16-36-18-462Z passed1/1 in8589ms,
sourceChanged:false. No live enrollment attempted yet. Next implement exact-owner
retirement/status before live shared enrollment trial; native unload remains a
separate unproven boundary. Five legacy pending inbox hashes unchanged, blockers
already preserved; no acknowledgment or repeated review. No human action needed.

## Budget publication race closed — October 7, 12:33 Eastern

Host capacity slots now publish by atomic hard link from complete private temp
files rather than exposing partially written destination files. EEXIST races
validate the winning record before moving to another slot; corruption/symlink or
same-request collision cannot be skipped. Temp files removed on all publication
outcomes. Existing slot ownership/schema/capacity bounds unchanged. Contention
fixture increased to16 independent processes for8 slots, exactly8 admissions and
8 durable files (no temp residue); focused tests passed. Full pressure before final
fixture expansion v2-2026-10-07T16-32-15-715Z passed1/1 in8619ms,
sourceChanged:false. No native sends or module/runtime changes. This strengthens
host multiworker serving ownership; production enrollment and unload still open.

## Durable host receiver budget — October 7, 12:31 Eastern

Shared nativeServiceRead now reserves one durable service-specific capacity slot
before enqueue, after journal/policy admission. Slots use exclusive creation,
fixed bounded names/schema and no-follow reads. Slots never released after failure;
uncertain delivery cannot regain capacity. Duplicate request reservation refuses,
changed configured budget/corrupt/linked existing slots cannot be skipped. Tests
prove persistent capacity across fresh invocations, duplicate and corruption refusal,
and three independent host processes racing for two slots admit exactly two.
Full pressure v2-2026-10-07T16-30-50-325Z passed1/1 in11308ms,
sourceChanged:false; final independent-process test focusedpass. This is HOST path
budget, not native module-global persistent state: raw direct triggers remain subject
to native attempt set/checkpoint gate and are not the public submission interface.
No native install/send this turn. Old manual trial enrollment lacks host budget
history and must remain retired; production enrollment must use shared path only.
Next automated enrollment/ownership status and bounded serving evidence, while
native unload and broad v2 gates remain open. No human action needed.

## Installed removal observer boundary — October 7, 12:30 Eastern

Bounded installed CLI source inspection located actual collection refresh RUt
and qHr inventory diff. RUt stores loaded before map, awaits reloadPlugins(), then
uses updated loaded inventory and emits tell lines. The separate dev-mod catch-up
formatter Do can label unloaded state, but its helper initializes before:new Map;
formatter existence alone never proves a removed plugin's observed disappearance.
Source windows preserved privately as native-dev-mod-unload-source-window.json and
native-dev-mod-refresh-source-window.json. Ambiguous short markers/refusal preserved
in tool evidence; no native private data inspected. Test executes exact installed
RUt function with isolated watcher/reload adapters: removal observer fires only
after reload resolves and updated empty inventory. This is source algorithm proof,
NOT live unload/receiver absence. Full pressure v2-2026-10-07T16-29-37-847Z
passed1/1 in9592ms, sourceChanged:false. No load/send/restart or CUA used.
Next native proof needs observer at tell/inventory boundary or independent native
hook absence; filesystem retirement/journal absence still insufficient. Continue
service ownership/enrollment in parallel scope without forcing platform interaction.

## Service transaction cleanup failure preserved — October 7, 12:27 Eastern

runNativeServiceReadTransaction now preserves verified reconciliation outcome when
cancellation bookkeeping throws, returning cleanupPending:true. Original unresolved
phase/request/retrySafe metadata survives simultaneous transport+cleanup failure;
private cleanup exceptions are never exposed. Entering enqueue is conservatively
published before call so partial publication failure cannot claim retrySafe:true;
cleanup attempts exact request, no delivery/retry. Tests prove verified result
survives cleanup failure, uncertain send preserves phase with cleanupPending, and
partial enqueue is conservative and never sends. Full pressure
v2-2026-10-07T16-26-50-529Z passed1/1 in8487ms, sourceChanged:false.
No native send or install this turn; prior API/CLI native proof remains historical
for its exact bytes. Production enrollment/service ownership and native unload
still open. cleanupPending is bookkeeping, not failed native effect; inspect exact
request before any recovery and never replay a settled or uncertain read.

## Shared native API and CLI trial completed — October 7, 12:26 Eastern

Fresh enrollment33d74fbfaaf5db2b9100bb3743100d49 native-validated updated receiver
and observed readiness. First public CLI attempt refused before enqueue: policy
script27279 bytes exceeded default16384 evidence reader. Preserved failure trial;
corrected policy hash reader bound65536. Transaction errors now include fixed phase,
published request ID and prepublication retrySafe metadata; no private error text.
Then actual nativeServiceRead API request rpeer7040e814315a45b79b2d9213ebc522cd
and separate public CLI request rpeer2d661cd9f215408eb4e67977756f62f3 completed
through one loaded receiver. Both standard receipts verified, lifecycleState:completed,
retrySafe:false, checkpointSource:legacy-shared, releaseAuthorized:false. No uncertain
send replay. Safe retirement16:25:41.389Z preserved module bytes, original epoch,
baselines and absent controls. nativeUnloadObserved:false/hookAbsenceQualified:false.
Private native-service-public-trial failure and public-settlement record retained.
Full pressure v2-2026-10-07T16-25-50-529Z passed1/1 in9074ms,
sourceChanged:false. Actual MCP transport and production enrollment automation are
not qualified by API/CLI success. Broad goal stays active: native unload, queue/service
ownership, guarded mutations/steering/residency/rollback and unknown-effects audit.
No human action required; retired enrollment must not be reloaded/replayed.

## Shared native service read transaction — October 7, 12:24 Eastern

broker_service_read {service_id, session_id, experimental:true, timeout_sec?}
now uses caller-held broker lock, bounded enrollment/ready/bytes/baseline/epoch
preflight, existing lifecycle enqueue and exact pickup, fresh presend validation,
one durable peer preparation and one delivery invocation. Bounded polling reviews
captured result and publishes standard receipt, returning settlement metadata only.
Finally cancellation preserves dispatched uncertainty; failures expose request ID
when published and never retry. No module installation, wake, restart or permission
change. Existing receiver must already be loaded and owned; retired trial refuses.
Tests cover successful ordering, abort before publication/after claim/presend,
uncertain send and missing-response deadline, each published request cancelled and
at most one send. Full pressure v2-2026-10-07T16-23-00-440Z passed1/1
in8575ms, sourceChanged:false. Source path not yet actual-native verified; next
fresh guarded enrollment and public shared operation trial, preserving old trial.
Broad v2 goal and native unload proof remain open; no human action required.

## Host native service admission candidate — October 7, 12:22 Eastern

admitNativeServiceRead pure preflight verifies exact owned readiness, idle native
epoch, sealed pinned integrity/build, installed versions, fixed baseline/module
hash sets and absent STOP/arms before returning one get_session target and bounded
expiry. Timeout1..60s clipped to service deadline; less than1s remaining refuses.
No evidence mutation, queue claim, delivery or release authority. Prepublication
refusal is retrySafe only because no request was enqueued; do not apply that flag
to later uncertain sends. Caller must hold broker lock and freshly revalidate at
publication/delivery boundaries. Tests cover success/expiry clipping, busy/reused
PID/start, corrupt bytes/baseline, controls, wrong version/target and deadline.
Full pressure v2-2026-10-07T16-21-28-122Z passed1/1 in11332ms,
sourceChanged:false. Not yet wired to public request submission or installed.
Next connect preflight to enrollment reader, serialized lifecycle enqueue/claim,
one durable prepared delivery, bounded response wait and cancellation/reconciliation.
No human action required; Codex bridge/1Password remain separate.

## Receiver STOP and diagnostic interlock — October 7, 12:21 Eastern

Reusable receiver source checks STOP, stop-rescue-arm.json and mechanical-probe.json
before writing intent/checkpoint and again after checkpoint before MCP read. Owned
triggers are consumed as service-read-stopped; controls are never cleared, retries
remain one-use refused and no model input is queued. This supplements rather than
replaces the authoritative native admission gate; races after the check remain
subject to gate validation. Tests cover each control already present and appearing
while checkpoint runs, proving0 MCP calls and unchanged control ownership.
Full pressure v2-2026-10-07T16-20-23-692Z passed1/1 in8600ms,
sourceChanged:false. Source only, not installed/native-validated this revision.
Historical native serving trial remains separate. Host production queue/enrollment,
release handoff, native unload/absence and broader steering still require work.

## Native receiver concurrency and expiry boundary — October 7, 12:19 Eastern

Receiver now reserves a single active callback before awaits. A different concurrent
owned request is consumed as service-read-busy and one-use reserved; it cannot
replace shared checkpoint during native read or become model input. Host must
serialize admitted sends; busy consumption never authorizes automatic replay.
Tests hold checkpoint in flight while a second request arrives and prove only
one checkpoint/read, duplicate refusal and no queue. Another test advances clock
past service deadline after checkpoint, proving no MCP call and no retry.
Full pressure v2-2026-10-07T16-18-35-448Z passed1/1 in9241ms, sourceChanged:false.
Installed native validator accepted updated generated bytes; staged only, no load
or sends. Historical two-read native trial bytes remain preserved separately and
are not evidence of this new guard. Production queue/enrollment/control integration,
scoped native unload, release handoff and full cross-harness qualification remain.

## Late checkpoint reader verified — October 7, 12:18 Eastern

readNativeCompletedCheck selects exact request/index0/generation retained evidence
and reports request-scoped vs legacy-shared source. Shared fallback only when
scoped record is absent; linked/unavailable, malformed, oversized, wrong request,
wrong generation or noncompleted evidence refuses. Reusable reconciliation uses
this reader and reports checkpointSource in metadata. Existing admission review
still independently checks pointer/build/bootstrap/ancestry/slot and result target.
Synthetic filesystem test publishes first retained checkpoint, overwrites shared
entry with second request, then verifies first remains usable. Exact legacy path
and corrupt-presence refusal proved. Full pressure
v2-2026-10-07T16-17-29-784Z passed1/1 in19919ms, sourceChanged:false.
Source only; no live release/permissions/module change or native send. Safe handoff
still constrained by unresolved historical effects and maintenance proof; do not
force release to deploy retention. Next service ownership/admission/control integration
can continue independently of that handoff and native unload investigation.

## Per-request completed checkpoint retention candidate — October 7, 12:17 Eastern

Source sealed bootstrap now retains broker-check-<request>-<index>-g<generation>
.completed.json in addition to shared entry. Atomic hard-link publication refuses
unsafe IDs/index/generation, symlinks and conflicting records. Legitimate nested
cached/direct bootstrap completion preserves the earliest identical observation
(ignore only a later at timestamp), retaining all other identity/ancestry fields.
Selection is never retained as completion; retention never creates dispatch or
native admission. Reusable host reconciliation prefers exact generation-scoped
record, refuses corrupt presence and falls back only on absence for legacy runtime.

Initial full pressure16:15:22 failed on duplicate nested completion; preserved.
Focused release retry also failed before correction. Corrected retention full
pressure v2-2026-10-07T16-16-17-716Z passed1/1 in9107ms, sourceChanged:false;
final host reader integration focused tests passed. Live sealed runtime unchanged;
this retention requires a separately qualified safe deployment, not in-place edits.
Legacy running runtime still needs immediate settlement/snapshot before next helper.
Native unload and production service integration remain open. No human action needed.

## Two native reads through one receiver load — October 7, 12:14 Eastern

Actual service enrollmentf71b9ffa70726f19ccadbc64c68673e5 passed installed native
validator, loaded once and produced owned readiness. Original PID71262/start,
sealed4af08654 runtime, app2.26454.0/CLI2.1.289, settings/policy hashes and controls
validated before install and each send. Existing lifecycle enqueue+exact pickup
under broker lock admitted two sequential get_session reads of existing fixture.
Requests rpeer5beb480e85bc4eab966c858ef9bdfb48 and
rpeer0c36aca1b8f94b31946a75839da739cd each captured private native content, passed
exact request/checkpoint/admission/metadata review and published standard lifecycle
receipt. Both inspectRequest state:completed/receiptVerified:true/retrySafe:false.
Each second reconciliation published:false. Each predecessor reviewed/snapshotted
before next helper overwrote shared entry. No repeated uncertain send or model call.
Private native-service-trial/review/send/enrollment artifacts preserve evidence.

At16:13:58.218Z guarded exact module retirement moved the service directory outside
watch folder, all3 hashes preserved, same epoch/idle/baselines and absent controls.
Retirement journal window has0 rows/0 model rows; this alone is not unload proof.
nativeUnloadObserved:false/hookAbsenceQualified:false. Other modules unchanged.
No permissions/auth/runtime/maintenance jobs changed. Do not reload or replay this
trial to manufacture current proof; active-byte reconciliation now refuses retirement.
This verifies two narrow admitted reads in one load, not production persistent
serving, full cross-harness integration, quiescence, guarded mutations or native
unload. Next address shared helper evidence retention for late reconciliation and
production service admission/enrollment/control integration. No human action required.

## Host reusable result reconciliation — October 7, 12:13 Eastern

reconcileNativeServiceResult(serviceId, requestId) reads bounded no-follow enrollment
and native evidence, regenerates loaded module bytes, verifies original broker
PID/start/build/version and both baseline hashes, then reviews per-request evidence
under the request lock. Publishes one native-peer-service-result lifecycle receipt;
identical receipts are idempotent, conflicting receipts refuse. Destination must
be the exact owned broker results path, including when host state env is overridden.
Control history remains unchanged; missing/changed/retired module refuses. Errors
are sanitized so JSON parser detail cannot leak private content. No sends/replays.
Shared broker_service_result_reconcile operation requires explicit experimental
opt-in and returns metadata only. Contract tests cover invalid IDs/missing enrollment
and sanitize failures. Full pressure v2-2026-10-07T16-12-30-619Z passed1/1
in10123ms, sourceChanged:false; final destination guard focused tests pass.
No native install this turn. Actual two successive admitted reads through one
loaded receiver and idempotent publication are next; settle each before another
request replaces shared helper entry. Native unload and broad v2 controls remain
unqualified. No human action required.

## Reusable receiver per-request evidence review — October 7, 12:12 Eastern

screenNativeServiceResult now correlates exact service readiness/intent/result
schemas with one protocol7 get_session request, sealed native helper ancestry,
pointer generation/bootstrap, consumed native admission and dispatched slot.
Reuses screenNativePeerAdmission and exact metadata payload screening through
in-memory structural adapters; no report artifact or control history is fabricated.
ReceiptVerified means correlated evidence only, standardLifecycleSettlementAssessed
remainsfalse until host publication. Native error payload returns a failed result.
Late historical review after service expiry is permitted if the response arrived
inside both request/service deadlines; this does not authorize new dispatch.
Tests prove evidence unchanged, successful/error outcomes, foreign/ambiguous/late
responses, overwritten helper identity, admission generation drift and missing slot
refusal. Full pressure v2-2026-10-07T16-11-15-037Z passed1/1 in9303ms,
sourceChanged:false. SOURCE ONLY, no module install/native sends this turn.
Next host enrollment/owned byte+epoch checks and locked standard receipt publication,
then actual successive reads through one receiver load. Before each next read,
settle/snapshot its predecessor because sealed broker-check entry is shared.

## Native service readiness and validator — October 7, 12:10 Eastern

Reusable candidate records owned session.start readiness once, with fixed build,
service identity, window/capacity and zero native/model calls. Host screen rejects
foreign identity/build, extra keys, malformed chronology, future or expired proof
and call-count drift. Readiness remains distinct from live epoch verification,
serving, admission, result receipt and quiescence.
Installed Claude plugin validator accepted generated receiver bytes (app2.26454.0,
CLI2.1.289). Private staged package and validation record preserved at
pressure/native-service-stage-8dd77b889f8bd2f84e6c4eb1c7a523ff; not installed or
loaded, no sends. Five focused service tests pass; full pressure
v2-2026-10-07T16-09-42-489Z passed1/1 in8489ms, sourceChanged:false.
Next integrate per-request evidence and lifecycle result publication, then guarded
actual successive reads in one native load. No human action required. Expired
validation enrollment must not be used for dispatch; generate fresh owned window.

## Reusable native receiver candidate — October 7, 12:09 Eastern

buildNativePeerServicePackage now emits one bounded receiver for multiple exact
rpeer request IDs, reusing the sealed broker-check checkpoint and public native
MCP call. Fixed owned broker/build/token, maximum128 attempts and one-hour lifetime;
peer input can supply only request identity. Target/op come from sealed checkpoint.
Every owned-prefix peer trigger is consumed even malformed/refused, and attempt
reservation precedes awaits. Durable intent prevents reload replay after missing
result. Native result remains private; no standard receipt publication yet.
Synthetic tests prove two distinct reads through one receiver, concurrent duplicate
suppression, capacity refusal, human-input pass-through, durable reload protection,
cancelled/expired/wrong-operation/malformed checkpoint refusal and generation bounds.
Full pressure v2-2026-10-07T16-08-30-238Z passed1/1 in8460ms, sourceChanged:false.
SOURCE CANDIDATE ONLY: not native-validated, installed or loaded. Still needs owned
readiness/epoch evidence, request enrollment and result reconciliation integration,
actual successive reads, native expiry/unload proof and complete service controls.
Do not count candidate tests as native persistent-serving qualification.

## Callback metadata identity checked — October 7, 12:07 Eastern

Result screening now requires successful get_session content to parse as an
object describing the exact admitted target sessionId, with boolean isArchived
and isRunning and boolean pinned when present. This matches existing native batch
metadata semantics; transport success or an envelope target label alone cannot
settle a foreign response. Native error content still settles as failed rather
than being misclassified as successful metadata. Tests cover foreign/malformed
payloads and text blocks split at a JSON whitespace boundary.
Historical captured89c94ec9 payload privately passes this stricter contract;
no fresh admission assessed, no replay or retired module reload. Full pressure
v2-2026-10-07T16-06-50-655Z passed1/1 in8444ms, sourceChanged:false. This closes a
result validation gap; persistent service integration and native unload proof
remain open and are not implied by this check.

## Shared callback settlement interface — October 7, 12:05 Eastern

Shared OPS now exposes broker_peer_result_reconcile {id, experimental:true} to
CLI/MCP callers. It publishes only a verified existing captured native result;
no send, execution, replay, module installation or permission change. Marked
readOnly:false because it publishes a local lifecycle receipt. Retired modules
remain refused; do not reload the retired successful enrollment to retest.
Pure result screening now rejects missing inputs and invalid time bounds cleanly.
Contract tests prove opt-in and invalid enrollment refusal before evidence access.
Full pressure v2-2026-10-07T16-05-24-105Z passed1/1 in8560ms, sourceChanged:false.
Guide updated. Persistent reusable serving and native unload proof remain open;
this interface alone does not qualify either or complete the broad v2 goal.

## Native callback lifecycle receipt settled — October 7, 12:01 Eastern

Result-channel enrollment89c94ec9-32c9-466d-8313-5c4ddfe9439f passed native validator
and ran one admitted read through existing lifecycle exact claim and sealed native
check. ReportSHAd4e34786b715e9aa096911535a75719f8812fa38918219d1f85d4e303f953316
records nativeCallReturned:true/resultWasError:false. Private callback result file
is1192 bytes, one text block; parsed sessionId matches exact intended fixture.
No private native content entered the diagnostic report/transcript.

New buildNativePeerResultPackage preserves v0.6 builder and adds v0.7 local response
capture. screenNativePeerResult refuses identity/chronology/content/admission drift.
reconcileNativePeerResult performs bounded no-follow owned evidence reads, verifies
copied/generated bytes, native epoch/runtime/baseline and exact helper/admission,
then publishes one standard native result under request lock. Initial review used
an invalid262144 reader bound; preserved failure, corrected65536, reused captured
response without replay. First publish completed; second returned published:false.
inspectRequest now state:completed, receiptVerified:true, retrySafe:false; historical
controlState:outcome_unknown remains unchanged. The admission screen separately
reports standardLifecycleSettlementAssessed:false; review adds actual lifecycle.
CLI native-peer-result-reconcile.mjs accepts one exact UUID and never sends/replays.

Full pressure v2-2026-10-07T15-57-00-583Z passed1/1 in8430ms before native trial.
Final response/review integration full pressure v2-2026-10-07T15-59-50-974Z passed
1/1 in8473ms, sourceChanged:false. Synthetic successful/error tool responses and
forged/malformed evidence paths pass. Shared service memory records narrow result.

Reviewed evidence snapshot native-peer-independent-review-89c94ec9...json preserved
before retirement. Exact result module moved atomically outside watched directory
to pressure/native-peer-retired-89c94ec9...; all3 hashes preserved, broker epoch and
settings/policy unchanged, no armed controls. Retirement record deliberately says
nativeUnloadObserved:false/hookAbsenceQualified:false. Other modules untouched.
After retirement current-source probe review/reconciliation refuses absent active
copied bytes; use preserved review for historical proof, standard inspectRequest
for settled receipt. Do not reload or resend to manufacture current-state proof.
Native unload/absence observation and generic persistent service integration remain
next; broad cross-harness steering/residency/rollback/unknown-effects audit stays open.

## Admitted native read returned — October 7, 11:54 Eastern

Actual enrollment5dfe5ee5-ead7-47d9-90bd-29316a9d803a used a distinct admitted
module, passed installed validator and produced owned readiness. Host lifecycle
API enqueue + pickupPending({requestId}) claimed only rpeer5dfe5ee5ead747d990bd29316a9d803a
under broker lock. Native mod called public $.tool.call({tool:"Bash",command,...})
with exact sealed broker-check helper, then positional native MCP get_session.
No runtime, settings, policy or permissions changed; no general waiter needed.
Helper completed with nativeBinding ancestorVerified:true, original PID71262/start,
build4af08654 and generation6. Actual native-admission-rpeer...-0.json records
one plugin toolUseId at15:49:31.170Z; report started15:49:30.908Z, completed
15:49:31.181Z, nativeCallReturned:true, resultWasError:false, modelCallsRequested:0.
Exact report SHAd5d0ceb501b2731204a507ab8ee7c198c751386ba85825ceac4741298ee91d59.
Native journal has no new model-turn rows for this callback; do not invent native
journal receipts. Standard lifecycle control is outcome_unknown/dispatched[0]
after cleanup cancellation; do not rewrite it as completed from report alone.

Read-only review supports exact admitted module/config/source bytes and correlates
request, completed helper, native admission, report and current runtime pointer
(generation/bootstrap/activation/epoch). Legacy sealed helper lacks index; unique
single read matches existing gate semantics, while ambiguous batches still refuse.
It yields singleReadAdmissionObserved:true but standardLifecycleSettled:false,
nativeGateQualified:false, releaseAuthorized:false. Independent private review
and shared service recordMemory preserve narrow observed success.

Installed public tool wrapper executed with synthetic input proves object API;
generated admitted-package tests refuse denied/malformed/wrong-target/extra-key
checkpoint output before read and consume retries. Full pressure
v2-2026-10-07T15-48-51-105Z passed1/1 in8570ms before native trial;
v2-2026-10-07T15-53-10-841Z passed1/1 in8326ms after review integration,
sourceChanged:false. Final pointer-correlation refinement passed focused tests
and actual review. Native scoped unload/absence proof remains next, alongside
safe result channel integration; modules are passive one-use, not retired yet.
Do not replay the prior token/request or weaken the existing dispatch gate.

## Exact service pickup candidate — October 7, 11:46 Eastern

Previous turn was progress: autonomous native read reached verified dispatch
refusal. Existing admission requires completed sealed broker-check helper,
ancestor-bound native process, one exact operation/args and atomic native use.
Do not fabricate entry/control files or loosen gate to qualify positive read.

Candidate pickupPending({requestId}) now filters before metadata/read/claim,
retaining existing lock/cancellation/expiry handling. broker-wait accepts exact
--request-id plus bounded --max-sec. Stop hook command adaptation admits only
fixed-order exact request selector and1..60s budget, preserves them when redirecting
to sealed source and forbids them for broker-check. Focused concurrency and actual
waiter-process tests prove foreign pending/expired work untouched and malformed
identity rejected before pickup. Existing adapter/gate tests pass. Full pressure
v2-2026-10-07T15-45-51-623Z passed1/1 in8581ms, sourceChanged:false.
This is SOURCE ONLY, not active runtime deployment. Native Bash API wrapper must
be independently verified before composing mod waiter/check/read. A safe sealed
handoff is needed for the new waiter selector; do not mutate pinned bytes or live
policy in place. Broad v2 serving, steering, residency/rollback and cleanup still
need their independent evidence. Claude inference remains rate-limited; native
non-inference work can continue without Taylor.

## Autonomous native execution observed — October 7, 11:42 Eastern

Corrected enrollment12c9eac8-1ed4-4d6c-a155-085ded4fe78f produced readiness,
one prepared direct delivery, durable intent and completed report. Exact report
SHA28aef26fa05e6870a95592b8519eec5a1f33114c58ce2e280ec0808d03866e57.
Read-only review passes exact epoch, sealed runtime, versions, baseline/copied
hashes and absent controls. Report nativeCallReturned:false and fixed category
broker-dispatch-gate-refusal. Independently read exact live policy script:
its SHA matches policy and its PreToolUse denial contains the exact categorized
checkpoint-refusal text. This is evidence of native pipeline refusal without
an authorized dispatch checkpoint, not positive execution or overall gate
qualification; all report qualification flags stay false. Do not weaken gate.
Next: integrate the peer probe with existing legitimate service dispatch admission
rather than fabricate checkpoint files; prove allowed read and scoped cleanup.
No human slash invocation was required for this native probe run.

Prior2b4f992a expired with absent intent/report and exact token journal queued;
private expiry record preserves model-attempt uncertainty and prohibits replay.
Detector113429 SHA351cf62d8bd2fef1832ade06f571405cb6070547d0800b557551c96832dbce49
references rmuy9ph4h-68adc1: control now expired, dispatched[]; result cancelled.
Detector113531 SHAb450a493c1318bf3561ba694519e8e510e9c1659e9ac4ab2f27d12d52ffbbda0
same PID/start live: historical liveness-returned means cleared work, no restart.
Existing source fix already distinguishes that transition. No recovery wake.

## Peer envelope mismatch corrected — October 7, 11:40 Eastern

Fresh enrollment2b4f992a-3c57-4e7e-b9d8-4b2653780311 passed installed validator,
produced native readiness and had one prepared direct delivery. Owned journal
correlates exact private token to queue-operation15:35:38.621Z and user15:35:38.633Z.
No durable native intent or report appeared. This delivery passed to the queue;
transport return did not qualify native execution. Preserve send evidence and
never resend this token. Do not claim zero model attempts from configured zero.
Installed xkn retains envelopes without hopChain; receive adapter previously
compared bare token only. Candidate now accepts only its exact direct transport
wrapper in addition to bare token, and refuses changed sender/mode/suffix.
Focused adapter/package/installed-envelope tests pass. Installed old module has
not been replaced by corrected bytes yet; reconcile expiry before new identity.

Pressure v2-2026-10-07T15-38-55-755Z failed4/5, unchanged source: native-idle
post-publication cancellation fixture sometimes cancelled during lock acquisition.
Fixture now starts cancellation after publication and gives deadline/mailbox
adequate separation. All8 focused idle tests pass. Full unchanged-source rerun
v2-2026-10-07T15-39-39-141Z passed1/1. Preserve failed run as evidence.

## Detector overlap reconciled — October 7, 11:30 Eastern

Follow-up report112944 SHAa3a407fd74f8a18830187a3f0244e529bfbdf8065fb50379ab1499a97564db77
labels live state liveness-returned, but same PID/start and expired unclaimed work
prove no process recovery in this episode. Candidate detectorTransition now uses
unserved-work-cleared for this transition and observation-restored for other
non-offline faults; only prior offline earns liveness-returned. Focused detector
tests pass. This source change is not activation proof for the running detector;
historical reports retain their original reason and are independently interpreted.

New detector report claude-detector-20261007T112812-0400-627e54fa0a32-5a4a3176
SHA30ef7eb73a1f516406c79deaf99edb495151e3d3d3379f62c98480a3b2e50d76
records idle unclaimed request rmuy9hkls-33c367 in original PID71262/start epoch.
Current detector source requires pending/unexpired/unclaimed control older than
15s for this observation. Exact request created15:27:46.579Z, expiry1791386954381;
control and result now expired, control dispatched:[]; original broker still
live and idle. This is a serving failure observation, not crash/readiness proof.
Recovery not attempted by detector; no duplicate observer wake performed.
New peer preparation saw a transient armed control and stopped before replacement
or send; only a private validated staging package was produced. Preserve that
refusal rather than treating disappearing control as evidence it never existed.

## Current filtered harness evidence — October 7, 11:28 Eastern

Claude synthetic filtered run15:26:38 completed all nine workflow/config checks
but FAILED unchanged-source: review command was edited during execution. Preserve
harness-v2-claude-2026-10-07T15-26-38-816Z.json as failed, not a current-source pass.
After checkpointing, unchanged-source rerun15:27:48 was rejected before fixture
calls by native rate_limit_event, seven_day utilization1 and status rejected.
Reset1791709200 is October11,05:00 Eastern. Preserve its failed report. No further
Claude inference retry while rejected. Runner now distinguishes harness_rate_limited
from generic contract failure using the native event, not guessed stderr text.
Busy original broker epoch still prevents an immediate native trigger; zero-
inference source/evidence work remains available. Codex bridge fixes stay parked.

## Autonomous trigger route — October 7, 11:09 Eastern

Read-only native-peer-probe-review.mjs <exact UUID> now combines bounded
no-follow evidence reads, fixed path/configuration validation, regenerated staged
module hashes, readiness/intent/report chronology and native epoch/settings/
inventory/controls checks. Missing report returns pending:false before state
inspection. Strict screen tests pass; reports remain unacknowledged and all
qualification flags false pending independent native review. Expired enrollment
is reconciled privately with no send/intent/report, same epoch; broker remains
busy. Do not start a fresh enrollment until idle admission is available.

Native enrollment ea986488-1b62-4f3d-9b45-7b165d8506a5 was copied passively.
Initial native validator rejected $ passed to factory-returned run; failed bytes
are preserved privately. Flattened top-level runReadProbe passes actual installed
validator and generated-byte tests; same epoch/settings hashes checked before
replacement. Exact native readiness arrived at15:19:10.389Z, zero native/model
calls. Attempted delivery preflight then found original broker PID71262 busy and
refused BEFORE any send preparation or bytes. Private admission-refusal evidence
records absent intent/report/send, fixed deadline1791386548847. No trigger was
sent, no native read occurred, no permission gate qualified. Do not extend or
replay this enrollment; reconcile expiry before preparing a distinct attempt.

Follow-on staged enrollment composes receive.js and probe.js. Owned session.start
writes a fixed readiness receipt only once and requests zero native/model calls.
Durable probe records intent before exact positional get_session, refuses prior
intent/report, rechecks deadline after intent write, preserves uncertain outcomes
and emits no private tool/error content. Recognized identity/clock/run failures
remain consumed. Six focused checks pass; full pressure round passed in8435ms,
sourceChanged:false, v2-2026-10-07T15-15-19-694Z.json. Readiness is not permission
or execution qualification. Nothing has been installed or sent. Native bundling,
exact epoch/load evidence and independent result screening remain next.
GitHub repeatedly rejects master pushes with Internal Server Error; candidate
commits remain local until push succeeds. This does not require Taylor to act.

The manual slash-command step is not established as requiring a person.
Installed peer receiver ze explicitly sets skipSlashCommands:true, so sending
the slash text cannot invoke the registered command. Before queueing it calls
session.receive; a consumed mod delivery returns before the prompt queue.
Exact installed receiver test covers both branches with synthetic dependencies.
Initial test omitted Rm in its harness and failed; corrected harness passes.

Staged candidates/native-peer-trigger/receive.js supplies an exact 128-bit token,
peer-only origin, owner/directory/deadline checks and one-use consumption.
Two focused tests pass, including concurrent delivery and unrelated message
pass-through. No installation, native delivery or model turn occurred. This
route is a candidate for autonomous execution, not native qualification; next
integrate durable intent/report and exact loaded-state evidence before delivery.
Earlier blocked status depended on a chosen manual path, not proved human need.

## Regression and admission checks — October 7, 10:54 Eastern

Full pressure-v2 round passed in 8346ms with sourceChanged:false; evidence is
v2-2026-10-07T14-53-54-252Z.json under the private pressure directory.
Installed admission contract passed all 20 checks on runtime19ff7f54. These
exercise installed adapters with synthetic hook/session dependencies, not live
gate execution. Its original staged-candidate checks cover lifecycle behavior;
they do not validate the corrected public MCP signature. The separate v0.4.0
installed-wrapper test provides that synthetic coverage. Native hook ordering,
actual admission and scoped unload remain unqualified. Corrected report screen
still returns pending:false; this is pre-invocation absence, not a failed attempt
or a live execution wait. Neither of the first two attempts counts toward the
corrected API probe's validation.

## Concrete public API bug corrected — October 7, 10:50 Eastern

Installed public wrapper gk takes call(server, tool, args), not the single object
accepted by internal ZOt. Both v0.2.0/v0.3.0 candidates used the wrong public
signature. Exact wrapper reproduction shows their object becomes server and tool
becomes undefined. Earlier synthetic tests skipped this wrapper; failure retained.
No native gate denial is proved by either attempt. Runtime transport preserves
error.message in a fixed object, so error wrapping is not established as cause.

Separate desktop-bridge-native-api-probe v0.4.0 now uses positional API with ID
7a8c9749-49fc-4894-9756-5f321bcc7c77 and command claude-driver-native-read-check.
Installed in already-consented broker mod folder exclusively; original candidates
and durable intents untouched. Registration has no automatic effects. New exact
installed-wrapper/candidate concurrency test passes; ten adapter checks pass on
4880f4d3 at14:50:33. CLI validator passes (author metadata warning only). Its strict
native-mod-api-probe-review.mjs returns pending:false until new evidence arrives.
Native menu/load proof and corrected command execution remain pending. No claim
of gate enforcement, release or completion. Taylor invokes once only if the new
command appears in native slash menu, same claude-driver-broker chat.

## Installed binding contract — October 7, 10:48 Eastern

Previous turn was progress (new diagnostic receipt and missing refusal branch).
Exact installed Hu guard now runs in synthetic contract: unbound throws before
native dispatch and bound identity is retained. All nine adapter checks passed
14:48:31, hostac1dd7aa. No native error cause is inferred from that reproduction.
Both completed native attempts remain non-retryable; no active wait handle or
pending user command is invented. Continue source/error-transport investigation;
do not count pre-invocation absence checks as post-attempt blockers.

## New diagnostic evidence — October 7, 10:44 Eastern

Taylor invoked the v0.3.0 registered native command. Report SHA256
76adade8908b64c379fdacab36a820b0e9bab5be64b578da81cf438b9246dbbf passes
strict report/intent/copy/metadata/runtime/settings checks. Started14:44:45.573Z,
ended14:44:45.574Z, MCP did not return; failureCategory unidentified-exception.
No assistant record occurs in the exact command execution interval. Screenshot
and report do NOT prove gate denial; the broker assistant's claim is unsupported.
The prior pre-invocation absence checks do not count against this attempt, as
Taylor explicitly corrected. This is progress, not a blocked turn.

Installed bound-session guard Hu has another known exception path: no session
bound in process, absent from the v0.3.0 category matcher. Prepared helper now
handles this exact message plus primitive string rejections and unavailable
MCP API. Focused tests cover these forms. Live v0.3.0 is untouched, preserving
its hashes and exhausted intent. This source finding is not proof of the native
cause. Both reports remain pending until original denial/error evidence can be
bound; no repeated invocation, permission change or release. Next investigate
native error transport before designing any further explicit attempt.

## Blocked audit — distinct diagnostic outcome absent

Three consecutive goal continuations checked the exact v0.3.0 report through
native-mod-diagnostic-review.mjs; all returned pending:false. These turns are
NO PROGRESS, not verified waits: no active diagnostic execution handle is known.
The pending human slash-command request in claude-driver-broker remains the
next native step. No original probe replay, duplicate wake or new command send
was attempted. Mark goal blocked until actual invocation/registration failure
or a new exact report arrives. All preparation/tests are checkpointed; bridge
release, actual permission gate and scoped unload remain unqualified.

## Diagnostic report screen ready — October 7

Previous turn was progress (distinct candidate installed). Current turn adds
native-mod-diagnostic-review.mjs, reusing bounded no-follow reader and exact
schema/state screen with a fixed v0.3.0 experiment. No report is present yet;
review returns pending:false without native inspection or writes. Eleven focused
checks pass, covering old schema compatibility and new category/hash/identity/
intent/extra-field refusals. No native load, gate, model or unload qualification
is inferred. Existing report stays unresolved and original intent preserved.
Use this exact screen upon new diagnostic report before independent native
review. Do not repeat the pending human command request or invoke it as text.

## Distinct adapter diagnostic installed — October 7

Previous turn was progress (fixed private diagnostics and adapter checks).
Separate desktop-bridge-native-diagnostic v0.3.0 is now copied exclusively into
the already-consented owned broker dev-mod folder. It registers only
claude-driver-native-read-diagnostic; no automatic MCP/model/timer activity.
Probe ID94701894-fc71-4dfa-943e-f5a1cc3fc8b8 has distinct intent/report paths.
Original v0.2.0 bytes and intent were untouched; no original attempt replay.
Three focused tests pass: fixed private categories, passive registration with
concurrent one-attempt bound, and foreign/prior/write-failure refusal. Installed
CLI plugin validate passes with author-attribution warning only.
Copied hashes: manifest3c7204482709c2db48151475e82f44d0dd8af2c53061acc5554b0fce2e6c3ea7,
hooks448e29b17c4ce3ee767d3caf0ff9e35b5501b1cfb3b59952e7b7625744bbf070,
module409fe3a6a4207e7a7ec9a2f29d4440425c7b1ce1e650896b2b9dd3908873959e.
Copy is not load proof. Taylor should invoke once ONLY if it appears as a native
slash command in the same claude-driver-broker chat. Categories retain false
gateQualified/releaseAuthorized and require independent denial ancestry.
Next review distinct bounded report with exact schema/hash, owned command
journal, settings/runtime/fixture checks; preserve original unresolved report.

## Diagnostic preparation — October 7, 10:39 Eastern

Previous goal turn was progress: native local command evidence changed the
frontier from activation to adapter failure. Current installed adapter contract
passed all eight checks at14:39:28 on hostc235c5cf/app2.26454.0/CLI2.1.289.
The pipeline has multiple exception paths before/after permission evaluation.
Prepared candidates/native-mod-probe/diagnostic-failure.js maps exact adapter
protocol error fragments to fixed sanitized categories; synthetic privacy and
hostile-getter checks pass. It is not imported by the live probe and changes
neither existing bytes nor repeat protection. Original report remains pending.
Next integrate a distinct bounded diagnostic identity and strict report schema,
qualify it synthetically, then establish exact supported invocation without
replaying the original probe. A category alone remains weaker than original
native denial ancestry and must never automatically qualify release.

## Latest frontier — native slash command executed October 7, 10:37 Eastern

Taylor approved hot reload and invoked the registered command once. Owned native
journal records session-local dev-mod consent, human command ancestry and a
local_command result at 14:37:06.863Z, CLI 2.1.289, expected broker cwd/UUID.
No assistant record exists in that execution interval. Screening binds report
SHA256 790b4c221d0c82e196d58978160c58083fbf201a09286d4c36470acb877194ca;
report/intent consistency, copied hashes, original runtime/settings/source and
same metadata epoch pass. Kernel PID 71262 remains the original October 6
23:24:51 Eastern process. Native command registration/execution is demonstrated.

MCP call threw in 2ms; nativeCallReturned:false. Its exception is deliberately
suppressed, and there is no original gate-denial witness in the command journal.
Do NOT infer PreToolUse coverage: adapter source also rejects missing/unbound
MCP tools before permission evaluation. Permission-gate qualification and scoped
unload remain open. Report stays pending with this durable blocker; preserve
intent and never repeat this probe ID. No live code/settings/process changes.
Next autonomous work: locate bounded original adapter/denial evidence, or prepare
a distinct diagnostic with fixed sanitized failure categories before a new
explicit attempt. Taylor need not send anything again while this is investigated.

## Latest frontier — copied probe, registration investigation

Taylor completed installation in the owned broker. Three installed probe files
match the prepared candidate hashes, but the slash command is absent. The owned
installation journal shows no loader consent/reload result. Earlier absent-file
blocker entries below are historical and superseded.

Installed CLI 2.1.289 expansion of `${CLAUDE_DEV_MODS_DIR}` calls Fo(), activating
the warm watcher. The hard-coded bootstrap omitted plugin-authoring skill
loading. This is a supported activation hypothesis; live refusal cause remains
unproven. Corrected scoped recovery prompt is in native-mod-bootstrap-prompt.md.
No live files, permissions, consent state, apps or session processes changed.
Next: supported skill activation plus identical-byte native save, human-only
consent if offered; independently verify load and slash registration before
probe invocation. Preserve failures; no model fallback or repeated probe.

## Latest frontier — October 7, 06:45 Eastern — native activation blocker

Three consecutive goal turns have now revalidated the SAME genuine blocker:
Taylor's required person-only scoped native mod activation remains pending.
Exact destination, intent and completed report are absent; review helper returns
pending:false. No active probe handle exists. These turns are NO PROGRESS, not
verified waits; private pressure/native-mod-activation-blocker-audit.json records
the three checks. Mark the goal blocked after this checkpoint is committed/pushed.
No further bridge work can qualify the native route without that human action.

The async request and [prepared prompt](native-mod-bootstrap-prompt.md) already
cover the needed action in the existing claude-driver-broker chat. Do not repeat
the ask, impersonate consent, send another wake or invent static work to avoid
the blocked state. Source checkpoint6958c8c and final hostc235c5cf remain validated;
this checkpoint changes documentation only. Nothing is complete or released.

On actual user completion/new exact evidence, revalidate the native epoch/app/
settings/candidate copies, run the bounded screening helper and independently
verify loaded plugin, native gate/model/command/fixture/unload. Preserve all
uncertain effects. Watcher/observer recovery ownership and input quarantine remain
unchanged; this is a blocker, not a user-requested pause. Codex-driver/1Password
stay separate. A later explicit resume starts a fresh blocked audit.

## Previous frontier — October 7, 06:43 Eastern

Goal ACTIVE. Previous turn and this turn made progress. Human native activation
is still pending; no exact probe report has arrived. Existing legacy detector
reports remain pending with their prior blockers, without repeated content review.
No plugin copy/load/wake/model call, native session effect or report acknowledgment.

New scripts/native-mod-probe-review.mjs performs zero-inference bounded screening
for ONLY the fixed staged probe's new/changed report. If absent/already acknowledged,
it returns pending:false without source/native inspection or writes. It can locate
that report beyond the generic first32 window without consuming older reports.
If pending, it binds the scanned SHA256, strict allowlisted report/intent schema,
fixed IDs/paths/times, candidate/copied hashes, reviewed versions, original native
metadata epoch/runtime/settings/policy and control-marker state. Unknown marker
access never means absent. No raw report/error/result/instructions leave the helper.

Screening eligibility is NOT qualification: actual loaded bytes, kernel epoch,
command ancestry/native gate/model events/fixture readback/scoped unload remain
explicitly unproven. The helper never acknowledges a report, treats its content
as authority, dispatches tools or releases anything. New bounded reader refuses
symlinks, directories, invalid bounds, oversized/changed content and unknown IO.

Seven new screening/host-boundary tests passed in the full unchanged suite
v2-2026-10-07T10-42-38-642Z.json,8305ms. Final host fingerprint
c235c5cfc1db5f4f2465515e1955217cdac95e9de1e56152c97bafee7fb34210.
Twenty admission/candidate and eight installed adapter checks passed SAME source
10:42:51. Staged package v0.2.0/register3a7b1e8c unchanged; prior static validation
remains bound to its identical three hashes. All tests are isolated, no native load.

Next human step is already requested in [bootstrap prompt](native-mod-bootstrap-prompt.md).
Do not ask again, reinterpret elapsed time as consent, repeat ineffective model
serving tests or manufacture static work to avoid a genuine blocked audit. On its
exact pending report, run the new screening helper BEFORE bounded native review;
do not acknowledge until evidence/review is checkpointed. Native positive gate,
event-driven transport, serving/steering/mutations/rollback/residency/cold recovery
and17historic uncertain effects remain open. No input quarantine change; Codex-
driver and1Password separate. Follow three consecutive no-progress blocker turns
if nothing else can advance without native activation.

## Previous frontier — October 7, 06:37 Eastern

Goal ACTIVE. Previous status-only turn was no progress; this turn prepares the
actual bounded native activation and new evidence lifecycle. General bridge is
still unqualified. Native-mod-probe v0.2.0 is STAGED ONLY, not copied/enabled/loaded.
The exact manual [bootstrap prompt](native-mod-bootstrap-prompt.md) is prepared
for Taylor's existing claude-driver-broker chat, not Broker Recovery Probe.
An async request for this human step is pending; elapsed time is no answer.
The installed loader requires personOnly:true; no keyboard, consent impersonation,
global installation, permission change, context reset or competing wake.

One explicit no-argument command records fixed sanitized intent before reading
only the existing archived fixture, then publishes a bounded .report.json in
the requested temp_reports inbox. Keep gateQualified/releaseAuthorized false.
Intent survives completed or failed reporting; module concurrency and reload
refusal prevent accidental repeated reads in the tested scope. fs.write is NOT
exclusive/atomic: this is no general cross-process admission/idempotency proof.
No automatic model call, timer, message, read or evidence write on registration.

Bundled static validation10:34:00 passed. Manifest da9d8573, hooks ac225d37,
register3a7b1e8c; exact full hashes in bootstrap prompt and validation report.
Twenty installed admission/candidate lifecycle checks passed10:33:40 on
2006bc0e9634d77795de675b831c806f10728f6ca502a7f65eed12e059c59446;
eight adapter checks passed10:35:33 SAME source. Full isolated suite passed
unchanged8365ms10:35:41. No live mod, native gate or zero-model command proof.

Read-only preactivation review10:36:33 verifies sessionId/local and native CLI
UUID35b3ba48-f02e-48de-bfbb-925192d90de1, same broker71262/start03:24:51 UTC,
idle/intact4af/gen6, original settingsd66115ff/policy7a8ce57a. No STOP/arm/
diagnostic, destination/intent/report absent, actual inbox directory not a link.
Initial review import used nonexistent brokerStatus and failed before execution;
corrected to the current public runOp read path. Preserve that setup failure.

Next independently verify native copied/loaded hashes and exact process/command
ancestry, actual negative PreToolUse denial, native model-turn count and original
settings/fixture before acknowledging any new report. Output/exception alone is
not gate proof. Establish scoped unload before enrollment, then positive native
admission and deterministic event-driven execution. Do not rerun the same probe
by deleting intent, repeat model-selected serving failures or infer safe release.
All17historic uncertain effects remain unknown/nonretryable. Input quarantine ON;
local30s detector/hourly observer do not pace active testing. Codex-driver and
1Password remain separate. If the human action stays pending, record a real
blocker and follow the three-consecutive-no-progress audit, not synthetic busywork.

## Previous frontier — October 7, 06:24 Eastern

Goal ACTIVE. Previous turn progress; this turn yields additional admission and
activation evidence, without native effects. General bridge remains unqualified.
New mod-admission-contract-v2.mjs passed14 checks on2f4be7f3, report10:23:59:
exact installed denial/error/cancellation/ordinary callback/reducer functions,
peer controls, person-only warm consent and staged scope/redaction. Existing
8adapter checks passed on SAME source10:24:06; full isolated suite unchanged
passed8435ms10:24:15. Candidate remains staged; no plugin loaded/model turn.

Important ordering boundary: raw local kVn deny-then-allow ends allow; served
branch retains deny. Actual Uat function-hook reducer retains deny in all six
orders and after blocking error. This is synthetic upstream evidence, NOT a
native bypass or proof live mod chain traverses the reducer. Native qualification
must bind loaded effective hooks/ordering/fallback and original request receipts.

Exact owned native activation review10:24:42:71262/start03:24:51 UTC idle/intact
4af, original settingsd66115ff/policy7a8ce57a, no STOP/arm. Only named Unix socket
observed is peer inbox; this does not exclude all unnamed/other control channels.
Installed peer does NOT route reload_plugins SDK requests or run_command controls.
Warm loader asks personOnly:true and refuses unbound context; no consent answer
or load attempted. Do not try SDK frames on the peer socket, spoof user text,
write consent metadata or globally install/reset/restart as a workaround.

Next establish genuine supported scoped mod activation/invocation/unload (human
consent where platform requires), or improve an existing serving mechanism with
evidence that changes its failure behavior. Avoid unchanged model-probe repeats.
Candidate is exact broker/archived-fixture/read-only; all17historic effects remain
unknown/nonretryable. No lifting quarantine or Codex-driver/1Password work.
See mechanical-native-route.md for evidence and the still-open native gates.

## Previous frontier — October 7, 06:18 Eastern

Goal ACTIVE. General bridge serving/mutations/steering remain unqualified.
Latest route discovery: exact installed mods MCP adapter ZOt -> eU -> ordinary
W1 tool pipeline with bound session canUseTool callback. Eight isolated adapter
checks passed on host ebef4abc, report mod-tool-contract-10:14:49. Native gate
execution, plugin loading and model turns are absent; source linkage is not
native admission proof. Agent hooks inherit tools/50turn budget/dontAsk, so no
live agent hook or subagent was launched.

New candidates/native-mod-probe package is STAGED ONLY: exact broker SID/cwd,
one explicit read-only archived-fixture command, no timer/model/permission
changes. Static bundled CLI2.1.289 validation PASSED10:18:27. Initial failed
10:16:15 reserved claude- manifest name retained; renamed desktop-bridge-native-
probe with author. Separate candidate file hashes in validation report.
Next establish supported scoped loading/command/unload WITHOUT keyboard/global
installation/context reset, then actual negative and positive native admission,
zero-inference causal receipts and serving lifecycle pressure. Do not count the
staged package or synthetic adapter checks as live serving qualification.

Fresh broker status06:18: same PID71262/start03:24:51 UTC, idle/intact4af/gen6.
No current waiter, indexed batch admission or quiet hook; residency protection
list stale. Metadata lifecycle/reconciliation proofs below remain valid for their
recorded source. General release still blocked by17historic uncertain effects;
never replay/settle them speculatively. Input quarantine remains ON. Local30s
zero-inference detection and hourly Claude fallback do not pace active testing.
Full current-source isolated suite passed unchanged in8367ms,
v2-2026-10-07T10-18-38-778Z.json (ebef4abc). No native plugin was loaded.
No user action needed. Codex-driver fixes and1Password stay separate.
See mechanical-native-route.md for precise candidate bounds and evidence.

## Previous frontier — October 7, 06:10 Eastern

Goal ACTIVE, this turn makes verified crash-lifecycle progress. General-use
bridge serving/mutations/steering and recovery remain experimental/unqualified.

Actual native-read-service-2026-10-07T10-04-41-602Z.json PASSED on1bad0d6d:
verified new exact owned Node job worker65607/start10:04:41 UTC/command/job,
then SIGKILL only that worker after publication. Never touched native broker.
Jobj6b4e5064c2ef4bb78f23a3de3c9efff1 remained outcome_unknown/worker_lost;
same-key reattachment twice returned SAME unknown job without replay. Batch
cf279394-0225-43cd-898a-3b36039398e0 reported owner gone and cleanup pending.
After original20s expiry, public broker_read_recover restored exact original
settings/policy with no wake/model turn. Original phase published and job outcome
were preserved. Exactly one native user turn; both MCP clients exited0/stderr0.
Full unchanged1bad preflight passed in8407ms, v2-10:04:37 report.

New public read-only broker_read_reconcile recovers historical metadata only:
bounded256KiB original own journal inode/cursor, exact original peer root,
complete distinct native attachments, Stop witness, restored settings, original
intact idle native epoch and subsequent kernel-verified host finish. It never
replays metadata reads, overwrites original outcome or claims current metadata,
full queue quiescence or release. Separate sanitized reconciliation artifact.
Pure tests reject missing/duplicate/unrelated receipts, foreign turns, wrong
root/witness, assistant tools, sidechains and compaction; private fields excluded.

First native MCP reconciliation on a4a12a4d FAILED (10:07:21 report): adopted
f9f68a7a older-source idle receipt, sourceChangedtrue and finish before new reads.
Original failure retained. Independent review
native-read-reconciliation-idle-failure-review-2026-10-07.json binds its SHA256,
owned idle observation and service error ledger. Direct diagnostic reviews then
succeeded with fresh zero-inference controls, without replay/model calls.
Final code allows ONE fresh idle observation only after consumed older-source
idle notice in unchanged epoch; unresolved publication remains blocked. Fixed
cache_ms:0 same-millisecond reuse; focused frozen-clock regression proves no reuse.

Actual native-read-service-2026-10-07T10-09-25-960Z.json PASSED on current
4e1a391b4123baf2cf5d8b8eae01e627d711d057a328af32d1a158181a35912f: actual MCP recovered both original native reads from1bad
without new user/model turns; matching receipts d5e989e9 and11121e67, event
1337d4c0, fresh host observationd611c96f. MetadataCurrentfalse, replayfalse,
inferenceTurns0, original jobstillunknown. Both clients exited0/stderr0; original
settings unchanged/no descriptor; same broker71262/start03:24:51 UTC.
Final full unchanged suite passed in8418ms, v2-2026-10-07T10-09-10-470Z.json.
Earlier worker-loss native proof and current reconciliation proof are distinct.
The new one-refresh branch has focused eligibility/idle-cache tests; no native
recreation of an older-source pending mailbox was required for the final proof.

Next resume the full goal: operational fence/indexed handoff and sustained
serving, then guarded mutations/steering under load, rollback, natural governor
pressure and cold recovery. Metadata-only recovery does not settle17historic
unknown effects, qualify generic direct mutation hooks or authorize handoff.
The lost metadata worker's original unknown job is also preserved; receipts are
available in its separate batch reconciliation, not an automatic job rewrite.
No user action needed. Quarantine ON; local30s detector/hourly fallback remain.
Codex-driver fixes and1Password stay separate.

## Previous frontier — October 7, 06:03 Eastern

Goal ACTIVE; general-use bridge remains experimental. Actual cancellation report
native-read-service-2026-10-07T09-56-12-334Z.json passed on e1b79a7d:
prepublication and queued cancellation settled in307ms/312ms, postpublication
cancellation in3502ms including bounded cleanup. All three same-key reattachments
returned original cancelled jobs without replay. Exactly one native diagnostic
turn occurred; original settings/policy restored, same broker PID71262/start
03:24:51 UTC, both actual MCP clients exited0/stderr0. Cancelled reads may finish;
this proves no mutation reversal or general serving readiness.

Current sourceee8c9f67862edad15807e6d07f678c65b0232e8d21d27482ab9754e2738eb34e adds bounded broker_read_status, phase progress,
overall admission/setup timeout and explicit broker_read_recover. Recovery is
zero-inference: exact expired owned metadata transaction, original intact idle
epoch and unchanged settings only; no wake/replay and original batch/job outcome
retained. Owner death requires kernel ESRCH; unavailable ps remains unknown.
Isolated tests cover expiry, changed epoch, busy/integrity/STOP refusal, foreign
target ownership, exact byte restoration and original published outcome retained.
An initial synthetic fixture omitted required PreToolUse hooks; failure preserved
in native-read-recovery-fixture-failure-2026-10-07.json, corrected before full run.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T10-03-29-410Z.json (8401ms). This later source has NOT passed a new
native recovery/worker-loss test. Cancellation native proof belongs to e1b79a7d.
Next deliberately lose only a freshly launched exact owned Node job worker,
verify unknown durable outcome/no idempotent replay and pending ownership, wait
finite expiry, then qualify explicit cleanup without another model turn. Never
kill native app/session processes or infer receipt/completion from cleanup.

Fresh read-only status06:03: broker71262 idle/intact, original settingsd66115ff
and policy7a8ce57a, no diagnostic/STOP/arm. Input quarantine remains ON. General
sustained serving, guarded mutations/steering under load, indexed handoff,
rollback, natural governor pressure and cold recovery remain open. All17historic
uncertain effects stay unknown/nonretryable. Local30s detection and hourly Claude
fallback do not pace testing; no user action needed. Codex-driver/1Password separate.

## Previous frontier — October 7, 05:51 Eastern

Goal ACTIVE; previous turn made observation progress, this turn proves a real
shared deterministic metadata execution path. General bridge readiness remains
unqualified. Opt-in CLI/MCP `broker_read_batch` accepts1–8 exact session IDs,
coalesces duplicates, installs only finite get_session hooks, requires genuine
native attachments/ancestry/host finish and restores exact settings. No target
mutations, keyboard/UI, new chats, model/auth/permission changes or recovery.
Existing durable driver_submit/jobs provide cross-harness ownership; metadata
results exclude unexpected/private fields. The operation is not marked readOnly:
it uses one owned diagnostic turn and temporary service-local settings.

Actual native-read-service-2026-10-07T09-51-15-467Z.json PASSED on current host
77441d1d: two MCP harnesses concurrently submitted one idempotency key for three
reads (fixture/broker/fixture), obtaining jobja5533bc537204c17b2b3ecfa59077116.
Publisher exited0 before completion. Remaining harness received completed job
in5130ms, two distinct native attachments for two targets, same receipt reused
for duplicate fixture and verified archived/pinned readback where present.
One short Haiku turn triggered the batch; native tools/collection used no model
selection/inference. Native host finish and exact settings restoration verified.
Idempotent late reattach returned SAME completed job, no replay; both launchers
exited0/stderr0. Batch evidence native-reads/dcfcc96a-7e49-4d0a-b8b5-05bc0855fb9e.json.

Original native-read-service-2026-10-07T09-48-45-674Z.json and failed job
j9f4947abf4f94b98bad9fde5936eead6 remain FAILED on bf1fc3e5. Native calls succeeded;
validator wrongly required pinned, which the exact SDK exporter serializes from
optional isStarred. Corrected parser preserves omitted pinned as unknown/null.
native-read-service-reconciliation-2026-10-07.json independently binds both
actual attachments, peer root, fresh host finish and original restored hashes,
without native read/model replay. Review source77441d1d, native sourcebf1fc3e5.
The later NEW batch above exercises completion/reattachment gates never reached
in the failed run; it is not a replay of its failed idempotency key.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-51-04-672Z.json (8496ms). Tests cover exact/bounded IDs, duplicate
coalescing, non-metadata refusal, missing broker/cancellation, per-target receipt
mapping/privacy, omitted-field semantics and exact temporary-hook restoration.
Initial isolated preflight category failure was corrected before native testing.
Cancellation after publication and lost-worker cleanup still need strategic
native pressure; busy/changed epochs leave durable diagnostic ownership for
existing safe expiry recovery instead of unsafe restoration or repeated wakes.

Source inspection confirms direct SDK hook calls bypass our assistant PreToolUse
effect gate; generic mutation routing is deliberately NOT enabled. Native idle
and metadata reads do not settle all17 historic unknown effects or authorize
release/handoff. Active dependencies4af/gen6, installed core7e388b8f retained;
original settingsd66115ff/policy7a8ce57a restored. Broker epochPID71262/start
03:24:51 UTC remains intact; no foreground waiter or quiet serving proof.
Quarantine ON, no STOP or pending diagnostic after successful batch.

Next pressure the new execution lifecycle's cancellation/concurrency/expiry and
failure cleanup, then resolve guarded mutation serving, steering under load,
safe indexed handoff, rollback and cold recovery. This metadata path is an
additional execution strategy, not a replacement for the full original goal.
Local30s detector/hourly Claude fallback unchanged; no user action required.
Codex-driver and1Password remain separate.

## Previous frontier — October 7, 05:41 Eastern

Goal ACTIVE; previous turn and this turn made concrete observation progress.
General serving/handoff remains unqualified. Fixed a real lifecycle gap: the
native idle listener now belongs to the service after durable publication,
surviving cancellation, wait timeout and publisher process exit. A bounded
private mailbox preserves the eventual kernel-verified notice for another
harness. Only one helper/subscription belongs to an epoch at a time; callers
wait outside its lock, with inexpensive file checks before reconciliation.
Private authenticated frames remain pipe-only; no key is recorded or printed.

Actual native-idle-service-2026-10-07T09-40-03-014Z.json passed two independent
MCP clients on sourceb050504c in1166ms. Stronger native-idle-service-
2026-10-07T09-40-47-165Z.json passed on current source2b8697ed in1170ms:
CLI publisher returned pending/timed_out and exited0 before receipt; two MCP
harnesses adopted that SAME observation c1ca72aa-799f-4c82-b4da-d7ae9903f92d,
verified the native reply and consumed one private mailbox. No model events,
app/UI action, recovery, settings/auth/permission changes or new chats. Both
MCP launchers exited0/stderr0. Listener removed, mailbox consumed, helper37750.
Already-idle timestamp correctly remains stale; fresh completion proof still
belongs to the earlier09:32:14 sourcecbef2bce, not this changed transport.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-41-00-098Z.json (8336ms). New tests prove cancellation/deadline
adoption, nonce/linked-mailbox refusal, publisher pipe closure before ACK and
actual isolated publisher process death before reply. An initial isolated lock
regression is preserved in native-idle-detached-development-failure-2026-10-07.json
(original source fingerprint not recorded), then corrected; no native effects.
Helpers exit after notice or bounded12h wait; unknown publication/dead-helper
debt still cannot blindly retry. Service helper survival is NOT native broker
residency, full queue quiescence, request success or release authorization.

Exact broker PID71262/start03:24:51 UTC remains idle/intact on active4af/gen6.
No current foreground waiter or quiet enrollment; quarantine ON, no STOP.
All17 historical effects remain unknown/nonretryable and handoff gates unchanged.
Next work is sustained serving and safe operational fence/indexed handoff, not
more repetition of already-idle signaling. Native hook diagnostic reads are a
proven deterministic execution candidate, but generic guarded mutation routing,
current steering/cancellation under load, rollback and cold recovery are open.
Fast local30s detection/hourly Claude fallback remain unchanged; no user action
needed. Keep Codex-driver and1Password work separate.

## Previous frontier — October 7, 05:34 Eastern

Goal ACTIVE; concrete observation progress, general serving/handoff unqualified.
Public CLI/MCP `broker_idle` now provides a durable service-owned native host
observer. Concurrent harnesses share one epoch-bound publication and cached
receipt. Unknown publication/cancellation persists subscription debt rather
than retrying; proved no-write may retry, and reviewed native12h expiry permits
a new observation. Private helper cleanup never kills the native broker.

Actual current MCP harnesses passed both modes: native-idle-service-
2026-10-07T09-31-04-547Z.json on source6e49b9ac verifies one shared already-idle
observation in1073ms with zero user/assistant events and stale completion=false.
native-idle-service-2026-10-07T09-32-14-381Z.json on sourcecbef2bce verifies a
fresh completion in4538ms: one short tool-free diagnostic model turn, actual
peer/reply ancestry, matching kernel PID/UID/nonce and one shared observation
cebb5ebd-409a-4dc9-84ad-85a170549f6a. Both clients report fresh completion=true;
all owned MCP launchers exit0/stderr0, subscriptions consumed/listeners removed.
Observation itself uses zero inference; the fresh diagnostic uses one turn.

Current source88495da2 passed the full isolated suite unchanged in
v2-2026-10-07T09-34-28-074Z.json. The only executable-source change after the
fresh native proof is its script comment explaining the two modes. Keep these
source-qualified reports distinct. Cancellation, pending joins, expiry, corrupt
and linked lease refusal, stale/fresh boundaries and public schema bounds have
isolated proof. Service memory records bounded metadata, never private IPC keys.
An initial test accidentally recorded12 synthetic observations in live service
memory. Original rows were preserved and explicitly corrected as synthetic in
native-idle-synthetic-memory-correction-2026-10-07.json; tests now isolate state.
Those rows are not native evidence.

Host idle remains weaker than internal queue quiescence, causal tool success,
historical effect settlement or release authority. API always denies quiescence
and release claims. All17 historic unknown effects remain unknown/nonretryable.
No operational fence or indexed handoff was authorized by this signal. Native
broker PID71262/start03:24:51 UTC remains idle/intact on active4af/gen6 with
dependency integritytrue, but nativePathsVerified:false and no verified waiter.

Next qualify a safe operational fence/indexed handoff, then sustained serving,
current controls/steering/cancellation, rollback and cold recovery. Do not repeat
idle publication after uncertain delivery or race the observer's recovery.
Local30s detector/hourly Claude fallback remains; hourly fallback does not pace
tests. Codex inbox ticks remain inference-bearing. No user action required;
input quarantine stays ON, Codex-driver fixes and1Password remain separate.

## Previous frontier — October 7, 05:21 Eastern

Goal ACTIVE. Previous turn was progress; this turn establishes a genuine native
zero-inference post-turn HOST signal. General serving/handoff remains unqualified.

Installed peer protocol supports control:notify_when_idle with correlated
peer_idle_notice. Headless code mounts the publisher on real sessionState
idle/running transitions; registration logs but does not enqueue a model prompt.
peer-idle-contract-2026-10-07T09-16-38-124Z.json passes6 exact installed mechanics
checks with synthetic dependencies: debounce750ms, queue/approval holdback,
same-PID/address refresh,12h expiry, one-shot consume and exit classification.
Original09:16:18 harness failure (missing extracted F announcer) is preserved.

Actual owned native subscriptions passed at09:18:31,09:20:20 and09:21:51 UTC.
Latest native-peer-idle-2026-10-07T09-21-51-906Z.json runs on source11f4c411,
listener hashf78deebc, exact broker PID71262/start03:24:51 UTC and app/CLI versions.
Each receives a matching nonce/from-address notice from kernel-verified native
PID/UID in about0.9s, with zero observed user/assistant events. No model turn,
auth/permission changes, session registration, key publication or app/UI action.
Existing receiver peer key is consumed privately; reply credentials come from
macOS SOL_LOCAL/LOCAL_PEERPID and getpeereid, not a claimed frame PID.

All replies have finishedAt1791363709797,4ms after the actual09:01 export receipt.
This is the broker's LAST finished host turn, not a newly completed request.
Already-idle notices can carry an old completion timestamp or none. The signal
is not a full internal queue snapshot, causal tool receipt, effect settlement
or release authority. All17 unknown effects and handoff gates remain unchanged.

New one-shot listener/payload preparation are reusable service internals; the
pressure command remains bound to this exact broker epoch, not a public generic
tool. IPC tests cover PID/nonce/address/state/time refusal, detail redaction and
SIGTERM cleanup. Listener cancellation explicitly does not cancel the native
subscription; timeout can leave one until notice or native12h expiry. No blind
repeat after timeout. All actual notices above consumed their subscriptions;
all listeners removed and no native processes killed.

Python helpers now participate in host and sealed-bootstrap fingerprints.
Full suite first caught inconsistent bootstrap enumeration; original failed
v2-2026-10-07T09-20-30-134Z.json remains. Corrected current source passed the full
isolated suite unchanged in v2-2026-10-07T09-21-48-232Z.json and then the actual
native control test above. Active dependency release remains4af/gen6/integritytrue.

Next make this a durable, bounded cross-harness observer with pending-subscription
ownership, cancellation/expiry and stale-timestamp semantics. Qualify actual
fresh busy-to-idle notification once on an owned diagnostic turn, bind it to
native ancestry, then combine with safe operational fence/indexed handoff.
Do not substitute a host idle notification for queue quiescence or clear old
unknowns. Full controls/steering, sustained serving and recovery remain open.
Broker idle/intact but no verified waiter, quiet OFF/quarantine ON, original
settings/policy intact; local30s detector/hourly fallback unchanged. No user
action required; Codex-driver and 1Password remain separate.

## Previous frontier — October 7, 05:10 Eastern

Goal ACTIVE. This turn makes concrete observation/strategy progress; no native
turns, settings changes, recovery or IPC were used. General-use readiness remains
unqualified. The previous native broker snapshot checkpoint was progress too.

native-idle-contract-2026-10-07T09-09-13-745Z.json passes6 executable checks
against exact installed app2.26454.0 sourceb7c512ce/CLI2.1.289 with synthetic
state/dependencies. The app's HC idle predicate is not complete quiescence:
- pending echoes at age120000ms block; at120001ms they remain queued but are
  ignored. Expired interrupt markers can be ignored; a feature flag can also
  ignore fresh interruption. No feature flags were inspected or changed live.
- HC does not itself gate isRunning, nextCycleUuid, deferredSends,
  awaitingTurnResultSince, tool activity or activeBackgroundTasks.
- Explicit last-result boundary, pendingCycle, fresh echo, held steer, input
  and non-expired interrupt cases behave as the exact source predicate defines.
  This is installed-function execution, not a live post-turn observation.

The exact export projection was executed too: absent maps/queues encode null,
awaitingTurnResult uses true-or-null, background tasks export as a map. The
sanitizer now counts map keys without returning keys/values and uses null-as-
absent semantics only with the reviewed full source SHA. Missing fields and
unknown builds remain refused/unknown; undefined boundaries remain unknown.
Both source reader and privacy/identity/schema edge tests pass. Native export
probe verifies the installed source hash before choosing this interpretation.

native-broker-snapshot-projection-2026-10-07.json independently reprojects the
existing09:01 export, verifying its archive hash and exact metadata, without
another native inference turn or altering original failed reports. Corrected
queueStateComplete:true, but idleCandidate:false: actual result/boundary/idle
flags are false. releaseAuthorized remains false. This is historical Stop-time
evidence, not current post-turn quiescence. All17 unknown effects stay intact.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-10-02-473Z.json. Shared service memory records source contract
and reprojection evidence. Broker PID71262/start03:24:51 UTC idle/intact, no
verified waiter, original settings restored, quiet OFF/quarantine ON, no
diagnostic owner or handoff STOP. Local30s detector/hourly fallback unchanged;
Codex inbox still inference-bearing. Next qualify an actual post-turn observer
and trigger/result path together; HC or visible idle alone cannot fence old
work or authorize indexed handoff. Sustained controls/steering and recovery
remain required. No user action needed; Codex-driver/1Password stay separate.

## Previous frontier — October 7, 05:06 Eastern

Goal ACTIVE. Diagnostic native broker export now has independent receipt/archive
proof. General-use bridge readiness remains unqualified: exact broker PID71262
is idle/intact but has no verified request waiter. Original settings restored;
quarantine ON, no owned handoff STOP. No user action is required for this checkpoint.

native-hook-export-2026-10-07T09-01-45-570Z.json remains FAILED on source49c1811d.
The native export succeeded; observer required a SID in the return, but actual
self-export returns only a filename. Independent bounded journal identity/hash,
real attachment ancestry, stdout hash, exact filename and archive hash reconcile
in native-broker-snapshot-reconciliation-2026-10-07.json. Exact broker/CLI ZIP
metadata and Stop witness were verified by the original probe. The archive is
private service evidence, never committed or printed. Corrected filename parser
requires one candidate; exact hook/log/ZIP identity checks remain mandatory.
Corrected code has isolated proof, not a fresh native run. No repeat inference
was used solely to fix the observer; original failure is preserved.

The Stop-time snapshot reported isRunning:false while cliProvablyIdle:false,
cliLastTurnMessageWasResult:false and cliAtTurnBoundaryHint:false. Visible idle
is insufficient for a safe handoff. New sanitizer returns only bounded flags,
counts and marker presence, treats missing/null queue fields conservatively,
and always denies release authorization. Installed source encodes some absent
internal fields as null; version-specific interpretation remains to qualify.
No release gate or historical outcome was changed. All17 unknown mutations stay
unknown/nonretryable. No generic mutation hook or persistent FileChanged enrolled.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-06-33-704Z.json. Native snapshot proof belongs to49c1811d,
not this later corrected observer source. Shared service evidence/memory updated.
One short no-tools native turn was used for export; reconciliation/tests use no
inference. Local30s detector/hourly observer fallback unchanged; Codex inbox is
still inference-bearing. Next qualify trigger AND result channel together,
post-turn quiescence and safe indexed handoff, then current controls/steering,
sustained serving, rollback and cold recovery. Codex/1Password remain separate.

## Previous frontier — October 7, 04:57 Eastern

Goal ACTIVE; previous turn made progress, this turn adds actual native edge
observations and changes the event-only strategy. Current host
bdb7a0d330271d93e18df14d84ccff003cbafad580e4741268d3a9138d8ee23f passed
its full isolated suite unchanged in v2-2026-10-07T08-57-20-303Z.json. Later
collector changes have isolated proof, not a new current-source native pass.

One short native no-tools turn on a2cd9974 configured two identical fixture
reads plus an unavailable MCP context. Original native-hook-export-
2026-10-07T08-50-42-263Z.json remains FAILED: the expected two read receipts and
command-bound error were wrong assumptions. Actual bounded/hash-validated journal
contains one real get_session receipt and one commandless error, both in the
same Stop event. native-hook-read-edges-independent-2026-10-07.json preserves
metadata; native-hook-read-edges-reconciliation-2026-10-07.json records the
corrected interpretation without rewriting the original report or replaying.
Fixture archived/unpinned/not live; settings and policy restored exactly.

Important installed/native distinctions:
- hook-contract-2026-10-07T08-57-11-072Z.json passes26 exact installed-function
  cases with synthetic dependencies and zero native writes/inference. The
  original08:48:56 extraction failure is preserved; the corrected extractor
  executes the full comma-expression startup guard rather than an invented if.
- Actual matcher deduplicates identical MCP definitions within ONE event. Its
  key ignores timeout and distinguishes JSON input key order. Repeated events
  still invoke again; this is not canonical durable request deduplication.
- Commandless hook errors retain only native event identity. Collector now
  records native-hook-event-error/commandBound:false, with bounded private
  stderr hash, never a fabricated operation/tool receipt. Proved attachments
  extend private batch ancestry to avoid a race with the preceding public scan.
- SessionStart output can seed an already initialized watcher; Stop output
  cannot. Cancellation prevents seeding. Startup skips REMOTE workspace; local
  setup calls initialize. Local cwd alone is not live initialization proof.
- Actual FileChanged callback DROPS successful tool output, forwarding only
  failures/system messages. Thus activating a file watcher alone would not
  deliver a useful generic result channel. Native FileChanged activation and
  independent result persistence remain unqualified. No watcher was installed.

Settled live epoch remains PID71262/start03:24:51 UTC, idle/intact, active4af/gen6,
installed7e388b8f, original settingsd66115ff/policy7a8ce57a, quiet OFF, quarantine
ON, no diagnostic owner or owned handoff STOP. No keyboard/UI, apps/processes,
models/auth/permissions or other chats were touched. One native inference turn
was used for the edge probe; all added engine checks and reconciliation were
zero-inference. All17 unknown mutations and legacy report blockers remain intact.

Next: select/qualify trigger AND result channel together, rather than enrolling
an inert FileChanged candidate. Investigate whether an owned native export's
internal queue/idle metadata can support a real STOP-barrier quiescence proof
and safe indexed handoff, without assigning causal outcomes to old unknowns.
Direct Stop-hook reads remain a verified diagnostic/fallback candidate, using
one short trigger turn per batch. Generic hook mutations still require actual
ownership/expiry/cancel/duplicate admission at invocation; parallel hooks cannot
be treated as ordered guards. Full current controls/steering, sustained serving,
rollback and cold recovery remain required. Observer owns offline recovery;
local30s detector/hourly fallback unchanged, Codex inbox still inference-bearing.
No user action is required. Codex-driver fixes and 1Password remain separate.

## Previous frontier — October 7, 04:44 Eastern

Goal ACTIVE. Direct native Stop-hook reads now have actual desktop result proof;
general-use readiness remains unqualified. Current host
5be50395f084c1dc4da142ecad6098cb8bb62a57f51a4a0b2f28d9573f2325a1 passed
its full isolated suite unchanged in v2-2026-10-07T08-44-38-415Z.json.
Later diagnostic cleanup/admission amendments have isolated proof; native probes
ran on their separately recorded source candidates, not this final source.

Native breakthrough under <state>/pressure:
- native-hook-export-2026-10-07T08-30-00-721Z.json remains FAILED. Its observer
  omitted metadata attachment ancestry. Independent fixed-range journal/hash
  review now proves the actual direct export succeeded without assistant tool
  selection. native-hook-export-reconciliation-2026-10-07.json links the original
  peer, terminal chain, real hook-success attachment, native export filename and
  captured archive SHAe0d896d7. The earlier guessed-filename comparison was invalid;
  preserve that artifact and the original failed report, rather than rewriting.
- native-hook-export-2026-10-07T08-35-35-106Z.json PASSED on c74317f0: direct
  get_session on the exact archived fixture, real Stop hook-result attachment,
  no assistant tools, nonce-bound peer/witness and exact settings restoration.
- native-hook-export-2026-10-07T08-37-41-302Z.json PASSED on bbb33c19: two fixed
  get_session reads (fixture and broker) in one Stop event, about3.6s from probe
  start including1.5s settings wait. Both result attachments and distinct target
  metadata verified. Each probe used one short no-tools model turn as trigger;
  hook tool execution and observation used no inference. This is not a completely
  inference-free trigger transport or a general throughput guarantee.
- Both batch results share native toolUseID. It identifies the Stop event,
  not an operation slot. Collector now names it hookEventId and identifies each
  result by its attachment UUID. Historical reports' hookRunId label is retained
  as historical data, not a unique-operation identity.

CLI journal hook-success attachments are a real result channel, despite the
separate default SDK hook_response filter. Opt-in session_events causality now
includes attachment IDs/parents without attachment contents. Direct hooks are
not assistant tool-use receipts; native error attachments can represent failure
before invocation and cannot alone prove that a tool was called.

Temporary probes preserve the core Stop/PreToolUse hooks and original settings/
policy bytes. Ordinary request admission refuses a pending diagnostic before
publication. Expired abandoned settings can restore only under the broker lock,
in the exact idle intact native epoch, with no STOP/arm/quiet owner and matching
bytes. Synthetic recovery tests pass; no live crash/kill injection was performed.
No generic native mutation hook or persistent FileChanged hook is deployed.

Settled live state: exact broker PID71262/start03:24:51 UTC idle, integrity true;
active4af08654/gen6, installed7e388b8f/handler6d10c509 unchanged. Original settings
SHA d66115ff and policy SHA7a8ce57a restored; no mechanical-probe owner remains.
Fixture local_fc1e5eab remains archived/unpinned/not live. Quiet OFF, quarantine
ON, no verified waiter/owned handoff STOP. No apps restarted, inputs injected,
models/permissions/auth changed, new chats or competing recovery attempted.

Next: qualify an actual event-only FileChanged activation/result path in this
native epoch, then duplicate/deadline/cancellation behavior and safe mutation
admission. A natural SessionStart/watch-path update is a candidate, not native
proof; do not force compaction/reset/restart. Retain safe STOP-barrier/indexed
handoff and rollback as separate gates. Full current steering, sustained serving
and cold recovery remain open. All17 historical mutations stay unknown and
nonretryable; legacy reports remain pending with durable blockers. Local30s
zero-inference detection/hourly observer fallback are unchanged; Codex inbox
still consumes inference. No user action is required. Codex/1Password separate.

## Previous frontier — October 7, 04:23 Eastern

Goal ACTIVE. Installed-engine research and executable contracts changed the
next native probe strategy; this turn made NO desktop/native settings changes,
model turns or recovery attempts. General-use readiness remains unqualified.
Current host560fc1440aeb5fd07badfecfcb0f4ab19fe97e9c02734b56fdfcd8583417a9a9
passed the full isolated suite unchanged in v2-2026-10-07T08-22-22-179Z.json.
Installed hook7e388b8f, dependency4af08654/gen6, compact2 and quiet OFF remain
unchanged. Exact broker PID71262/start03:24:51 UTC remains idle, integrity true,
no verified foreground waiter and no owned handoff STOP. Settings contain only
Stop/PreToolUse; no direct MCP hook candidate was installed.

New source contracts under <state>/pressure:
- hook-contract-2026-10-07T08-22-12-618Z.json:18 checks execute exact installed
  2.1.289 MCP runner, interpolation, file-watcher lifecycle and SDK result
  emission functions with synthetic dependencies. Connected hooks directly
  call tools without model selection. Missing/pending connections, budget,
  withholding and errors are exercised. FileChanged does not wait for pending
  connection. Script hooks explicitly throw unavailable in this installed build.
- Actual watcher lifecycle requires initialization or explicit watch-path update;
  settings addition after empty startup does not create a watcher. Registered
  settings changes dispose it. Repeated events invoke twice; no durable duplicate
  suppression. Default SDK response filtering does not emit Stop/FileChanged
  results; live all-events enrollment was NOT inspected/changed. These are
  installed functions with fake clients/watchers, NOT live activation/dispatch.
- peer-contract-2026-10-07T08-22-12-959Z.json:9 existing receiver/auth/envelope/
  dispatch cases still pass after sharing bounded installed-source extraction.
  Unsupported SDK control frames remain unhandled in the actual receiver.
- desktop-native-route-source-2026-10-07.json fingerprints the inspected app
  CCD SDK proxy and session wiring chunks; no general external native caller
  API or permission/result path is established by that source inspection.

See mechanical-native-route.md for evidence, limitations and the next read-only
probe requirements. Do not install a generic mutation hook: current runner
has no service PreToolUse call inside its extracted function; upstream host
enforcement remains unqualified. A command event marker is not a native tool
result, and the old assistant-tool receipt collector cannot fabricate one.
Next establish genuine native activation, connected context and correlated
results without restarting/resetting/injecting input or widening logging/auth.
Natural lifecycle events may help, but writing settings alone cannot qualify
them. Safe owned STOP-barrier operational disposition/indexed handoff remains
a separate frontier; all17 unknown mutations stay unknown/nonretryable. Preserve
legacy inbox blockers and observer offline-recovery ownership. No user action
is required. Codex-driver fixes and 1Password stay separate.

## Previous frontier — October 7, 04:04 Eastern

Goal ACTIVE. This turn made qualification/observation improvements and exposed
real native serving failures; it did NOT qualify controls or general-use readiness.
Keep input quarantine, broker epoch/model/permissions and observer ownership.
No new chats, app restart, context reset, blind replay or competing recovery.

Current host46f0962972854e07f514a5425fd3162e5535de9c64254e8949092294fed6bacc.
Full isolated suite passed unchanged in v2-2026-10-07T08-03-15-746Z.json.
Installed hook7e388b8f and active dependencies4af08654/bootstrapeb5cb750/gen6
remain unchanged; compact feedback2 enrolled, quiet OFF. Native tests below ran
on earlier host candidates; final46f has isolated proof, not a new native pass.

Qualification changes:
- session_events/session_wait accept opt-in include_causality. They expose only
  bounded parentId/peerMessageId/sidechain metadata and metadata-only ancestors.
  User text, thinking, tool inputs/results and peer sender fields stay private.
  Malformed ID/time/stop-reason objects cannot leak through those metadata fields.
- Every live run generates fresh128-bit nonce markers. Tool-free reply checks
  require exactly one native peer turn matching the send's messageId, an actual
  descendant terminal reply, exact current-run marker, no tools/truncation or
  sidechain. A foreign user branch or missing/reset ancestry cannot pass. Repeated
  envelopes of one UUID count as one logical reply. This is correlation, not a
  security/identity boundary or arbitrary task-success oracle.
- Restore now runs inside the reporting/finally boundary, using brokerRequest's
  actual native receipt contract and waiting for on-disk active state. Cleanup
  records observed baseline separately from unresolved native request outcomes.
  Title/effort/model/permission/pin readback is verified. Attempt metadata keeps
  independent concurrent successes/failures and IDs without prompts/tool output.
- --controls-only with --control-mode batch|concurrent|both reduces native test
  cost and excludes recipient generation. Its separate memory topic cannot
  establish full native qualification.

Preserved native outcomes under <state>/pressure:
- live-v2-2026-10-07T07-54-32-317Z.json (f55e4735) FAILED on a newly introduced
  incorrect brokerOp receiptSource assertion. Actual unarchive receipt succeeded.
  Early cleanup saw the old archived value before native persistence and falsely
  reported a restored baseline. Preserve that failure; correction in
  native-fixture-restore-reconciliation-2026-10-07.json records a NEW explicit
  desired-state archive, native verification and later archived/unpinned readback.
  The incorrect wrapper assertion is fixed; never treat its early snapshot as
  settlement or overwrite the original report.
- live-v2-2026-10-07T07-56-15-969Z.json (74a753ea) FAILED. Unarchive, concurrent
  title and pin had actual native success receipts. Effort request
  rmuxtdyht-8a0575 consumed compact continuation2, which actually landed, but
  its causal branch ended with zero tools. It remains outcome_unknown,
  retrySafe:false/controlState:cancelled. Cleanup title+effort, unpin and archive
  were new desired-state operations with actual native receipts. Original failed
  run remains failed. native-controls-failure-independent-2026-10-07.json retains
  every scoped request/receipt/native tool ID and exact causal refusal evidence.
- live-v2-2026-10-07T07-59-08-337Z.json (6d8c9bc4) FAILED before batch controls.
  Restore rmuxtgmmz-30510d also consumed/received compact2 and ended with zero
  tools; outcome_unknown/retrySafe:false/cancelled. No controls batch ran.
  native-batch-restore-failure-independent-2026-10-07.json preserves evidence.
  The fixture is currently archived/unpinned/not live, with original locked title,
  low effort, Haiku model and acceptEdits. This desired-state readback does not
  settle an uncertain restore. No replay or extra wake was attempted.

Context evidence is scoped, not inferred from model prose. Both failed terminals
claimed compression/resumption, but no actual native compact_boundary occurred
in their bounded journal ranges. native-controls-context-evidence-2026-10-07.json
verifies API input totals172540 and182328 for the exact terminal UUIDs. This is
large context evidence, not proof of a hard context failure, disabled compaction,
a queued resumption or crash. Selected compaction-related keys were absent in
~/.claude.json, global settings and broker settings; native process env was not
read. No manual compaction/reset/configuration change occurred.

Official current Claude hook documentation confirms command-hook timeout/launch
failure may continue through normal permission flow. This independently supports
the conservative retry contract, but is NOT native fault-injection qualification
of bundledCLI2.1.289. See native-effect-admission.md for the primary source link.

Original15 unknown mutations plus these2 unreceipted mutations remain unresolved;
current-state cleanup does not retire them. Legacy inbox reports021323/021456/
023210 remain pending, unchanged, with durable blockers. Broker PID71262 is live,
idle, integrity true, no owned handoff STOP and no verified waiter at checkpoint.

Next: investigate context-pressure serving and a deterministic native execution
route using bounded read-only installed-engine/primary documentation evidence.
Do not retry effects or call /clear,/compact, kill/restart or change model/auth.
Use fresh causal tokens before any recipient steering run; keep workload and
number of native attempts bounded because Claude usage is low. Establish owned
STOP-barrier quiescence and safe indexed handoff/rollback without rewriting
historical unknowns. Sustained residency, steering, cold recovery and event-only
inference remain open. Local detector30s is zero-inference; hourly observer is
fallback; Codex inbox ticks still infer. No user action is required at this checkpoint.

## Previous frontier — October 7, 03:49 Eastern

Goal ACTIVE: native batched reads, three concurrent read clients and one real
foreground pickup passed. Still NOT general-use ready. Preserve keyboard/CUA
quarantine, native PID/model/permissions and observer ownership. No new chats,
app restart, blind replay or competing recovery; Codex/1Password remain separate.

Current host c969500cfb9ec4ff5ec71dc3ea79bc883ad650b0511bafdaff8857bc58f5186e.
Installed hook7e388b8f08aac1a2b0fcc35f1a7ea6ea176663b628730e35089bc60517d4980a,
handler6d10c509e82c44a36eef0d54988e112263664e89a5021b5097f9fb98c03decb2,
settingsd66115ffaba3cc0c723795ad4ffcee692e464e6afc8e921c3d50dafc4bc78b74.
Compact feedbackVersion2 remains explicitly enrolled; quiet remains OFF.
Dependencies4af08654/bootstrapeb5cb750/generation6 remain unchanged on exact
broker local_35b3ba48-f02e-48de-bfbb-925192d90de1/PID71262/start
Wed Oct7 03:24:51 2026 UTC. Host has later failure-path amendments than this
installed package; those have isolated proof and one actual foreground read.

New pressure evidence under <state>/pressure:
- native-compact-read-sequence-2026-10-07T07-35-24-753Z.json: distinct-target
  two-operation batch passed13.672s on unchangede48a3790. Existing owned fixture
  stayed archived/unpinned/not live; no unrelated chats, permissions or model.
- native-compact-read-sequence-2026-10-07T07-36-24-118Z.json: three concurrent
  clients passed on unchangede48a3790. End-to-end10.896s/27.040s/44.696s; each
  broker service time about10.5s. Kernel serialization/finishing-turn admission
  add real queue cost. These measurements do not establish fairness guarantees
  or high sustained throughput. Each unique request/receipt/gate ID matched.
- native-compact-read-sequence-2026-10-07T07-41-28-274Z.json: final batch guard
  candidate7e388b8f passed two distinct reads12.472s. Native admission IDs and
  independent fixture state verified in native-batch-contention-independent-
 2026-10-07.json. All five audited tool IDs across concurrency/final batch unique.
- native-duplicate-batch-pre-enqueue-2026-10-07.json: current native metadata
  confirms active helper has no operation index. Identical operation slots were
  refused locally with broker_ambiguous_batch/retrySafe:true and unchanged
  request directory: no wake/model call or native effect. Distinct slots remain
  allowed. Indexed capability requires actual completed current-epoch helper
  evidence; newer host code/staged index support alone cannot enable it.
- Native foreground helper3777/start07:44:09 was independently live in the
  broker ancestry, selected sealed4af/gen6 and writing fresh waiting heartbeats.
  native-current-host-resident-pickup-2026-10-07.json: currentc969 host read
  rmuxt0eh1-a9a047 completed5.458s via resident with real native receipt/matching
  admission and no wake metadata/progress delivery. No explicit peer wake or
  Stop continuation was required. After serving, readiness was revoked on
  working/completion; later broker was idle without a waiter. This is one real
  warm pickup, NOT proof that the model consistently stays in its loop or of
  sustained residency/governor protection. Do not infer readiness from busy.

New safety/efficiency fixes:
- Reject repeated identical native operation slots before enqueue when deployed
  indexed checkpoints are not independently proved. Do not split/replay a batch
  automatically; batches remain non-atomic. Synthetic compatibility retained.
- Lock timeout/abort and other failures before publication explicitly report
  dispatched:false/retrySafe:true without a request ID. Actual held-kernel-lock
  tests prove no request/socket message for contention deadline and abort.
- Publication precedes notice/progress setup. A callback/local I/O failure there
  now cancels the exact durable request, disarms only its arm, returns its ID and
  preserves native mutation outcome_unknown/retrySafe:false. Pure undispatched
  cancelled reads retain narrower retry semantics. A known receipt is available
  for inspection, not permission to replay; client failures get a named category.
  Actual client subprocess/socket tests cover progress failure after publication
  for both reads and gated native mutations. No historical control was rewritten.

Final full isolated suite passed unchangedc969 in
v2-2026-10-07T07-44-58-309Z.json. Native batching/concurrency on earlier candidates
and actual currentc969 foreground serving are separate evidence; none proves
all controls, steering, cold recovery or rollback. Read-only probe now supports
explicit sequence/concurrent/batch modes and bounded1..5 requests. It records
end-to-end wall time, actual90s deadline, operation success and distinct source/
hook/dependency fingerprints without raw tool output.

All15 historical mutations and legacy reports021323/021456/023210 remain pending
with existing durable blockers; no replay/ack/gate bypass. Complete fixed-range
historical audit is still causalOutcome:unknown/retrySafe:false, despite absence
of unmatched calls in that range. Local detector30s/zero-inference and hourly
observer fallback remain; scheduled Codex inbox ticks still infer.

Next: qualify reversible controls and unique-nonce recipient steering on the
existing owned fixture, restoring its archived/unpinned baseline. Follow public
archived-session guards; do not bypass them with raw calls. Old reply tokens
cannot qualify a new run; use fresh request/recipient causal evidence. Inspect
platform hook fault behavior and establish actual owned STOP-barrier quiescence
before changing deployment admission for historical unknowns. Safe indexed
handoff/rollback, sustained loop/residency, natural governor pressure, unattended
cold recovery, compact/quiet combination and event-triggered inference remain
open. No user input is required for this checkpoint.

## Previous frontier — October 7, 03:33 Eastern

Goal ACTIVE: compact native continuation now has repeatable read evidence, but
NOT general-use ready. Preserve input quarantine, current native process/model/
permissions, observer ownership and historical uncertainty. No new chats,
keyboard/CUA, app restart, blind replay or competing offline recovery.

Same broker local_35b3ba48-f02e-48de-bfbb-925192d90de1/PID71262/start
Wed Oct7 03:24:51 2026 UTC is independently idle with integrity true and no
handoff STOP after testing. Active dependencies4af08654/bootstrapeb5cb750/gen6
remain unchanged; quiet waiting remains OFF and no actual waiting helper is
claimed. Current host and installed hook package:
954ccca6042f8afff01da2587080a0cceb6d3c8f5bc85901e3ef183c527541ac.
Handler6d10c509e82c44a36eef0d54988e112263664e89a5021b5097f9fb98c03decb2;
settingsf1f133b3e74d0a843bb22aeeb9f1460e5b6a956a5a04e3d13a22ae364555ac1c.
Installed feedbackVersion2 is an explicit service-local candidate. Version1 is
still the default for new installs; no global mode/model/auth change occurred.

New execution experiment:
- Fixed compact feedback names the pending ID, asks for Read ./CLAUDE.md as
  its next action, then the documented maintenance/tool/wait/check sequence.
  It is under half the previous directive's length and carries no operation
  arguments. Exact per-ID/peer/epoch consumption records bind feedbackVersion;
  collectors accept only the fixed text of that consumed version. Unknown
  versions refuse. Compact and optional quiet waiting cannot be combined yet.
- native-compact-read-sequence-2026-10-07T07-26-04-397Z.json: two reads passed
 12.879s/11.057s on loaded/installed52702ce0. Independent journal replay proved
  BOTH compact continuations landed and then used tools. Later independent
  receipt/admission inspection verified success, exact gate tool IDs and gen6.
  Host audit code was added later; do not conflate that later source with527.
- Native follow-on07-28-11-461Z FAILED: first read12.905s passed; second
  rmuxsd9rd-e01269 exceeded its30s deadline. Unlike earlier no-tools failures,
  compact continuation DID execute CronList/ToolSearch/wait. Native automatic
  context compaction crossed the deadline, resetting parent UUID ancestry.
  Checkpoint returned dispatch:false/cancelled at07:29:19.812Z; a later native
  get_session attempt was denied by actual PreToolUse at07:29:20.046Z. No
  admission marker or correlated success receipt exists for that request.
  Preserve native-compact-follow-on-failure-forensics-2026-10-07.json and
  native-compact-expiry-gate-proof-2026-10-07.json. Do not call it recovered
  serving or weaken expiry because the model continued. Compaction was native,
  not an agent-requested context reset. Broker returned idle without intervention.
- Post-compaction standard90s-budget sequence07-31-22-114Z PASSED three reads
 12.377s/10.753s/10.852s on unchanged954ccca6. This is stronger sequential read
  evidence, not a latency guarantee. Every op.ok, native receipt and exact gate
  ID/gen6 independently verified in native-compact-post-compaction-independent-
 2026-10-07.json. The probe now requires operation success, not just transport
  receipt existence, and records its actual deadline. Original short-deadline
  failure remains failed. No second wakes, new chats, model changes or recovery.

Final full isolated suite passed on unchanged954ccca6 in
v2-2026-10-07T07-31-03-240Z.json. Tests cover actual concurrent command-hook
single consumption, compact/legacy version binding, arbitrary-version refusal,
policy enrollment/quiet incompatibility and historical evidence bounds.

New read-only historical audit scans a COMPLETE fixed range of the exact owned
journal, not a tail sample:5992307bytes/4334records for15 uncertain requests in
native-historical-effect-complete-range-2026-10-07.json. It hashes the range,
checks inode/owner/cursor/line/total bounds and emits tool IDs/results metadata
only. All matching tool calls in that range have results; zero exact matching
send invocations. Identical archive/pin calls can belong to another request.
Neither matching results nor absence proves original causality or absence of
queued future effects. All15 requests remain outcome_unknown/retrySafe:false;
release handoff is still refused. The auditor does not write receipts/control.

Next: expand compact candidate beyond reads to current-source controlled
mutation/cancellation, native concurrency and sustained steering qualification.
Resolve dependency-upgrade quiescence with an actual owned STOP barrier and
mechanically validated historical disposition that preserves causal unknowns;
never bypass the existing gate on desired-state readback alone. Quiet/compact
combination, distinct-build rollback, natural governor pressure, unattended cold
recovery and fully event-triggered inference remain open. Keep detector30s/
zero-inference and hourly observer fallback; Codex inbox ticks still infer.
Report scanner still only lists unchanged legacy021323/021456/023210; preserve
pending blockers. No user input is needed at this checkpoint.

## Previous frontier — October 7, 03:22 Eastern

Goal ACTIVE: working core interface, reliability hardening, NOT general-use
ready. Preserve keyboard/paste quarantine, native PID, permissions/model and
observer ownership. No competing recovery, replay, new chats or app restart.
Codex/1Password work stay separate. No user input needed for this checkpoint.

Current read-only broker check: local_35b3ba48-f02e-48de-bfbb-925192d90de1,
PID71262/start Wed Oct7 03:24:51 2026 UTC, idle, integrity true, no handoff STOP.
There is no verified current foreground waiter and quiet enrollment is OFF.
Dependency4af08654/bootstrapeb5cb750/generation6 remains active. Installed hook
404a085e0c7a6ecc8f7829a22f0ad1e415099f1b40d50eb9e1f059b7457e6290,
handlerabbf3c152a4397b5609a6f7bfb7a9d0a602b1f3daa87959a477ea47f37982993,
settings27b3730a20fb790a6eccc9f7b45b85cf388337e4bc9e4173bf6564de8d6ee1ad.
Current host candidate 8a6c7b6f640709d0bcde3d912209275642a847ada2560a93e50cf46e8c969db0 has later continuation-collector and
malformed-pointer fixes; it has isolated/replay proof, not a new native turn.
CLI2.1.289/app2.26454.0 remain the inspected versions.

New improvements:
- Native working/rearming heartbeats no longer prove a pickup channel. Verify
  selected sealed waiter entry, current epoch/build/generation, real helper
  PID/start/PPID ancestry, fresh waiting heartbeat and no completion marker.
  Legacy process timestamps have one-second precision; this is scoped liveness
  evidence, not protection against a hostile owner. Quiet proof stays separate.
- Before enqueue, wait for that actual channel or a stable idle boundary. Busy
  turn expiry/cancellation/epoch drift refuse before a durable request or send.
  Synthetic/non-native heartbeat compatibility is explicitly weaker and retained.
- Each ordinary pulse names its durable request: claude-driver request <id> v7.
  Generic wake/drain v6 aliases remain for recovery. Exact arm ID and actual
  queued protocol are required; no new chats, model change or operation payload.
- Receipt collection follows only the exact fixed native isMeta Stop feedback,
  backed by per-request/peer/current-epoch consumption and causal UUID ancestry.
  Initial end_turn waits for the owned hook decision or bounded continuation.
  Metadata alone never creates a receipt; foreign/human/late/forged feedback
  cannot join the chain. One wake/rescue budget and uncertainty guards remain.

Native evidence remains FAILED overall:
- native-turn-boundary-read-sequence-2026-10-07T07-08-22-187Z.json:
  first read11.998s passed, second expired30s. Its generic wake had NO native
  records since cursor; socket return was not intake proof. Preserve forensics.
- native-request-pulse-read-sequence-2026-10-07T07-14-50-012Z.json:
  first read13.772s passed with real receipt; second rmuxrw3em-e78c3a was
  unclaimed and cancelled/broker_not_serving. Exact request pulse DID land and
  one Stop continuation DID persist, but both turns ended with zero tools.
  Cancellation was AFTER the continued end_turn; premature cancellation was not
  this failure's cause. No dedup root-cause claim is justified by this trial.
- native-owned-continuation-collector-replay-2026-10-07.json: new host collector
  replayed the bounded original journal with unchanged inode/cursor and correctly
  bound the continued terminal, zero tool calls/no receipt. No inference/UI write.

Initial native-only residency change broke nine synthetic MCP cases; failures
v2-2026-10-07T07-06-00-550Z.json and 07-06-24-212Z.json are preserved. Compatibility
was fixed, full isolated suite passed07-08-11-325Z and final v7 pulse07-14-04-985Z.
Current continuation candidate passed07-21-11-631Z; final malformed-pointer check
passed the full unchanged-source suite in v2-2026-10-07T07-21-37-014Z.json.
All artifacts are under <state>/pressure.

Read-only installed receiver inspection and isolated VM probes show that the
inspected peer inbox handles user/known control actions; SDK turn_handoff RPC
is unhandled on this transport. peer-contract-2026-10-07T07-06-18-488Z.json passed
nine scoped checks with no native sends. SDK schema existence does not establish
an external direct-dispatch API. No attaching/spoofing stdio or app mutation.

Fifteen legacy enqueued mutations remain outcome_unknown/retrySafe:false.
native-historical-effect-current-state-audit-2026-10-07.json confirms their three
owned target fixtures are archived/unpinned/not live; exact old send text is
absent from its bounded recipient journal. That does NOT prove no queued/late
send or settle original causality. Keep release handoff refused; do not fabricate
receipts or replay. A future mechanically validated STOP-barrier operational
retirement strategy must preserve causal uncertainty and be reviewed/tested
before changing admission. It is a candidate, not implemented or qualified.

Report scan still lists only unchanged legacy021323/021456/023210; reuse their
durable blocker notes, no ack/repeated analysis. Local detector remains30s with
zero inference; hourly Claude observer is recovery fallback, not test pacing.
Codex report inbox ticks remain inference-bearing. General native steering,
sustained sequential execution, distinct-build rollback, natural governor
pressure, unattended cold recovery and event-triggered inference remain open.
Next: dependable execution dispatch and justified historical-effect settlement,
then current-source full native qualification. More identical prompts/polling
alone do not solve observed no-tools execution. Preserve failed outcomes.

## Previous frontier — October 7, 02:57 Eastern

Goal ACTIVE. Working native prototype, reliability hardening, NOT general-use
ready. Keep input quarantine, current native PID/permissions/model and observer
ownership. No keyboard/CUA, app restart, session process kill, context reset,
new chats, blind replay or competing recovery. Codex/1Password work stay separate.

Current broker remains local_35b3ba48-f02e-48de-bfbb-925192d90de1,
PID71262/start Wed Oct7 03:24:51 2026 UTC, dependency4af08654/generation6,
CLI2.1.289/app2.26454.0. Integrity/current-epoch entries verified. Hook package
35e9c23325a37cdad4b4b57e60f72114a4837f08ba38ed9efe2ad4b5e08ce677 is installed
with quiet waiting DISABLED after clean experimental expiry. Handler hash
 ee8c649e59324d64704e265d95095649d8384d45406340cb524985053e48dd33;
settings hash d8c8edfc0207bcb2cdbc5132a4bf6b091c32153f642464b9f97dae5dcadee9ff.
Host candidate has a later strict quiet-policy shape amendment; distinguish its
isolated proof from this installed/native-tested package. No release handoff.

Verified progress:
- Fixed continuation wording scopes the one-rescue budget to EACH request ID.
  Historical assistant statements about an exhausted lifecycle do not authorize
  STOP or terminate the service. This is a cue, not a guarantee of execution.
- One native batch read/archive completed15.635s with both admission IDs/native
  receipts; independent metadata confirms the existing owned fixture archived.
  `native-request-budget-batched-cleanup-2026-10-07T06-43-44-349Z.json` passed.
  Earlier uncertain archive attempts remain uncertain; desired state does not
  prove which old request caused an effect.
- Sequential ordinary reads still failed on the second request:
  `native-request-budget-sequential-2026-10-07T06-45-03-456Z.json`.
  Detector024454/024525 match rmuxqsph8-d35958, expired read, retrySafe:true,
  no receipt. Later liveness is queued-metadata clearance, NOT crash diagnosis
  or recovered serving. Review: `native-request-budget-detector-review-2026-10-07.json`.

Opt-in bounded mechanical Stop-hook POC is now implemented. Service-local policy
allows1000–60000ms; default off, PreToolUse timeout remains5s. It verifies native
identity/ancestry/version, current dependency pointer, actual policy/handler/
settings bytes, exact owned peer wake or consumed fixed isMeta feedback. An
exclusive helper owns bounded readiness metadata; actual helper PID/start/
ancestry, pointer and TTL are independently checked by clients. It polls only
one durable request notice with no idle model calls, copies no operation data
into feedback, and shares the same one-rescue-per-ID consumption file. Different
request IDs may continue a continued hook; the same ID cannot. STOP, policy drift
and expiry terminate waiting; handoff settlement retains its separate path.
A dead helper can leave an exclusive owner marker: readiness then fails, but
automatic stale-marker reaping is intentionally not implemented. Reconcile that
owned marker before re-enrollment; never infer readiness from a file alone.

Native experiment FAILED execution reliability:
- `native-quiet-read-burst-2026-10-07T06-55-03-695Z.json`: first get_session
  passed12.226s with a real receipt; second rmuxr6hdm-4d4631 expired30s.
- Mechanical continuation consumed at06:55:22.497Z and EXACT feedback persisted
  at06:55:22.500Z. Claude ended with no tool calls, then stated it was processing
  the request. Native helper48445 really waited afterward, but that proves only
  signaling/liveness. It does NOT prove the model executed the directive.
  See `native-quiet-continuation-forensics-2026-10-07.json` and matching
  `native-quiet-second-read-forensics-2026-10-07.json`.
- Quiet helper exited on its60s bound; owner absent/nativeidle independently
  checked before disabling quiet enrollment at06:56:40Z. No replay or kill.
  `native-quiet-experiment-settlement-2026-10-07.json`.

Isolated safety/contract tests passed on the native-trial candidate in
`v2-2026-10-07T06-54-39-457Z.json`. New actual subprocess tests cover no idle
feedback, exclusive ownership, distinct continued requests, cancellation,
expiry, STOP, policy drift, foreign human messages, helper death/epoch/TTL and
handoff settlement. Final strict-shape amendment passed the complete isolated suite on unchanged
source in `v2-2026-10-07T06-58-16-840Z.json`; these tests do not establish native
general-use readiness.

Next: focus on dependable execution dispatch. A purely mechanical signal can
reach the native context while the model still ends without tools. More polling
or identical wakes do not resolve this. Bound future experiments, preserve the
failed requests and independently verify actual dispatch/tool receipts. A
read-only app/CLI source inspection found in-process SDK MCP routing but no
external tools/call route in the inspected peer inbox; that is a scoped negative
observation, not proof no supported direct route exists. Do not attach to/spoof
parent stdio or alter the app. General steering, sustained latency, distinct-build
rollback, natural governor pressure and unattended cold recovery stay open.

Fast sensing remains the local zero-inference30s detector. Hourly Claude observer
is fallback only; active testing does not wait for it. Codex report inbox30s still
uses inference. Old reports021323/021456/023210 and15 historical mutations remain
pending with durable blockers; no blind replays. Archive cleanup is settled for
the fixture, not for those original causal outcomes. The old frontier below is
historical; in particular its unarchived fixture statement is superseded.

## Previous frontier — October 7, 02:35 Eastern

Goal ACTIVE. Working native prototype, not general-use readiness. The latest
full native suite FAILED; isolated/API passes are not native reliability proof.
Use current CLI/fresh MCP. Input automation remains quarantined; no app restart,
session process kill, context reset, model/auth/permission change or observer send.

Critical failure: rmuxpt37w-d5e587's helper returned dispatch:false/cancelled
at06:17:40.736Z, but Claude invoked the exact archive at06:17:41.324Z and the
owned fixture became archived. The old retrySafe:true claim was false. Preserve
`native-late-cleanup-forensics-2026-10-07.json`. Current inspection/errors report
outcome_unknown/retrySafe:false for every enqueued native mutation lacking a
correlated receipt, even with a recorded gate policy. Pure reads/pre-enqueue
refusals retain narrower safe retry semantics. Jobs propagate uncertainty.

The service-owned PreToolUse hook now gates actual mcp__ccd_* calls using native
SID/PID/start/cwd/version/ancestry, immutable current template, completed epoch
checkpoint, live request/index/canonical arguments, deadline/cancel/STOP and
recorded installed handler/settings hashes. Exclusive per-slot consumption binds
the native tool_use_id. No permission allow or inference hook. Malformed and
oversized PreToolUse input explicitly denies; bad Stop input stays quiet.
Platform hook timeout/runner failure remains a limit; policy presence alone is
not absence-of-effect proof. See [native-effect-admission.md](native-effect-admission.md).

Host/installed hook package e8b16514fc567713cc27b3f70d59337198b45ca4214a13d67e2bbaedb0d24895;
handler SHA2561ff90b8a72c68fbf45f7fccbd822b82404a727ee7b0966ab33f35fcd7c827644;
settings hash aa4e16a164c1a3dc8f0f5faea5ae59de6f59c2d123211606720c5d480a93b9fc.
Dependency package remains4af08654459f514c1e0d76f0071b54ddb6e22e1805bbb7db101a632d0a387912,
bootstrap eb5cb750e09080502b44a970dc3b18ef083ecb4beb9fdc0d3e4bb1c1acfa3492,
generation6; same broker PID71262/start Wed Oct7 03:24:51 2026 UTC,
CLI2.1.289/app2.26454.0/Haiku. Completed current dependency entry paths verified.
The new entry-index field is staged, not active; old entries admit unique slots only.

Evidence under <state>/pressure:
- Three unchanged-source isolated rounds on f824ce6c:
  `v2-2026-10-07T06-30-13-847Z.json`; final bounded-input e8b16514 passed one
  whole isolated round in `v2-2026-10-07T06-33-46-072Z.json`.
- Actual filtered Codex and Claude each passed10 API checks on f824ce6c:
  `harness-v2-codex-2026-10-07T06-30-28-082Z.json` and matching claude report.
  These predate the final input amendment; they perform no desktop effects.
- Native positive f824 gate: rmuxqala7-546ad7 completed12.430s, admission ID
  matched actual native receipt, same PID/gen6:
  `native-effect-gate-final-positive-2026-10-07T06-30-40-618Z.json`.
- Cancellation AFTER helper checkpoint produced a real native PreToolUse denial:
  rmuxq2or2-a1bd76, `native-effect-gate-negative-independent-2026-10-07.json`.
  This proves the earlier installed gate, not final provenance/input amendments.
- Final e8 bounded-input gate native read rmuxqg51n-4654bf passed13.174s, exact
  admission ID/native receipt matched. Its following desired-state archive
  rmuxqgf9k-b8cd4c expired45s and remains outcome_unknown/retrySafe:false:
  `native-bounded-gate-final-check-2026-10-07T06-35-45-388Z.json`. The whole
  cleanup report is FAILED despite the successful read; no replay.
- Earlier9-check native pass05:58 preserved. Later4af full run FAILED concurrency:
  `live-v2-2026-10-07T06-12-06-435Z.json`. Final f824 full run FAILED initial
  serving and cleanup: `live-v2-2026-10-07T06-31-26-193Z.json`.
  rmuxqbu92-490ff0 consumed one rescue, then continued Stop ended without tools;
  rmuxqc2c7-c5ba43 expired. Both now outcome_unknown/retrySafe:false. Forensics:
  `native-gated-wake-terminal-forensics-2026-10-07.json` and
  `native-gated-full-failure-review-2026-10-07.json`. No repeated wake/replay.
- Same PID survived180s, but pressureEvents=0, so natural-pressure gate FAILED:
  `residency-v2-2026-10-07T06-12-32-846Z.json`.

Idle-only immediate routing bypasses a blocked installed receiver chain in VM
and completed stable native reads; peer UUIDs now persist before bytes. Repeated
handoffs/concurrency still failed. This is not a proven native root cause or full
serving strategy. Preserve release-cycle06:00, idle-cue06:02 and immediate06:08
failures. Do not mutate old sealed snapshots or infer readiness from activation.
Quiet Stop-hook waiting is documented, not implemented or native-qualified.

Detector stays sealed5dfbbdc6/zero-inference/30s; hourly Claude observer is fallback,
not sensing cadence. Codex inbox30s ticks still use inference. Ten report reviews
are in `native-effect-detector-review-2026-10-07.json`. Reports021323/021456/023210 stay
pending: legacy set_pinned/archive effects lack native settlement. Reuse that
durable review instead of repeating unchanged analysis; no replay or competing
observer wake. Seven read/liveness reports may be acked by exact scanned hash after
repository checkpoint. Native liveness return is not serving/crash-cause proof.

Next: reconcile owned fixture cleanup and prior uncertain native effects before
another full run/handoff. Strengthen deterministic wake-to-serving: one-shot
rescue can still be ignored. Current-source steering, distinct-build rollback,
sustained latency, natural governor pressure and unattended cold recovery remain
open. Keep Codex/1Password work separate.

At02:36 Eastern the fixture local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 is
unarchived with an idle native process23791/start Wed Oct7 06:32:29 2026 UTC.
The broker remains71262 with no STOP/arm and verified current dependency entries.
Do not kill either process or call cleanup settled. Use the retained failed
cleanup evidence before any new deliberate desired-state action; no message replay.

## Previous frontier — October 7, 01:56 Eastern

The goal remains active: usable native control prototype, reliability hardening
in progress, not general-use readiness. Fast detection is the zero-inference
30-second local detector; the hourly Claude observer is fallback recovery.
The Codex inbox still makes inference calls on scheduled ticks. Active testing
does not wait for either observer schedule.

Native controls on the existing owned fixture passed after unarchiving it:
three settings in one request took 9.787s; three concurrent controls took21.079s;
independent readback and archived/unpinned cleanup passed. Evidence:
`native-valid-controls-2026-10-07T05-44-09-200Z.json`. The preceding archived
attempt produced a partial title effect before native pin/effort refusal; retain
`native-batched-controls-2026-10-07T05-42-01-109Z.json`. The host now rejects
known archived pin/effort prerequisites before dispatching any batch operation.

Deployment exposed a real stale-entry boundary: generation4 activation to
`dd307695157f992db0e01659bcaf6d9421f5dfb88203b948333cbc8c36944bd1`
with bootstrap `eb5cb750e09080502b44a970dc3b18ef083ecb4beb9fdc0d3e4bb1c1acfa3492`
kept PID71262/start Wed Oct7 03:24:51 2026 UTC and cleared the owned STOP.
Native maintenance cleanup succeeded. Claude subsequently invoked OLD sealed
3bfc scripts from context, bypassing the new entry admission. Integrity is true,
but native dependency qualification remains entry-evidence-mismatch. Do not
alter old sealed snapshots or count pointer activation as native deployment.
Evidence: `native-epoch-handoff-2026-10-07T05-47-40-871Z.json` and
`native-entry-paths-post-handoff-2026-10-07.json`.

A candidate broker-scoped PreToolUse command adapter redirects only exact
known wait/check invocations to the current sealed release. It validates the
native SID/PID/start/cwd/version/ancestry and immutable script hash, refuses
shell composition/background/unknown commands, and supplies updatedInput
without a permission allow decision. Actual subprocess tests cover foreign
identity, modified/writable script bytes and shell syntax; 12 focused cases
pass. This adapter is NOT installed or native-qualified. Installed Stop-only
hook remains dd307695; host candidate is
`78d937dcc327985999e8099241127037fd772d10a04d7e458954e432a77d2434`.
Three unchanged-source isolated rounds passed in
`v2-2026-10-07T05-56-01-765Z.json`. The latest actual Codex filtered10-check
pass is dd307695 in `harness-v2-codex-2026-10-07T05-48-56-472Z.json`;
Claude filtered proofs are older. Do not promote them to the new host build.

The first post-handoff request rmuxorta2-e8d52a expired without dispatch;
no native acceptance was established. A later stable-window read rmuxov0j8-55bb8f
hit its15s deadline after dispatch, then independently reconciled to a completed
native receipt. Keep its outcome_unknown/retrySafe:false control state and do
not replay. Evidence: `native-late-epoch-reconciliation-2026-10-07.json`.
Detector014828/014858 report hashes respectively
`0c085d50453936ab4e943be528212398d7cceb2d5cb764a4afcf3032ec5176d8` and
`6d5378b09b4a31a7bcbcee86057f9350c36088c62ed74c7722cfa1c0af999d7b`
match that earlier expired episode. Their liveness-returned event establishes
queued metadata becoming absent, not a crash cause or recovered serving.
Current narrow broker status again shows foreground waiting, unchanged PID,
no STOP, and app-acknowledged native maintenance job2a2c851b/list05:50:26Z.
This is a point-in-time observation, not sustained pressure qualification.

Earlier44.7s native latency included a40.773s auto-compaction boundary near
191457 preTokens; see `native-client-latency-breakdown-2026-10-07.json`.
No context reset was performed. Batching and receiver-direct signaling reduce
avoidable turns, but sustained latency is not qualified.

Next: upgrade the service-owned hook after admission, qualify two native read-only
requests with completed current-generation wait/check observations, then rerun
the full broker-only suite on existing fixture
local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 with restoration/cleanup. Full steering,
different-build rollback, sustained latency/natural governor pressure and
unattended cold recovery remain open. No input/quarantine/auth changes, app
restart, session process kill or competing observer wake is authorized. Codex
and 1Password fixes remain separate. Checkpoint review before acknowledging the
two exact report hashes; preserve every failed and uncertain native result.

## Previous frontier — October 7, 01:41 Eastern

The goal remains active. Fast sensing is the installed zero-inference 30-second
local detector; the Claude observer's hourly job is fallback recovery, not the
detection cadence. Codex's report inbox still uses inference on 30-second ticks.
There is no event-triggered observer message or automatic cold recovery wired.

Native serving improved this turn: a service-scoped command Stop hook supplied
one bounded continuation after an exact owned peer wake ended without tools.
The receiver's installed 2.1.289 source and exact native receipt proved it adds
fixed prefix/suffix text around the envelope. The initial hook's bare-envelope
check therefore could not accept the actual stored wake; do not infer from that
failure alone that settings were unloaded. The corrected hook recognizes only
the exact installed framing, native peer msg_id, broker session/cwd/PID/start,
real process ancestry, short-lived pending undispatched request, and no STOP.
It ignores human messages, continued hooks, cancellation/expiry and unknown
versions. Atomic exclusive consumption permits one rescue per request, even
under concurrent invocations. No prompt/agent hook, model change or input used.

The ordinary client arms its exact peer UUID BEFORE socket bytes, sends one
wake with no inference sender/fallback, then disarms on settlement. Installed
policy and settings hashes plus sealed handler package must match. A changed
policy fails closed. The command hook remains installed only in the approved
broker's own .claude/settings.json; no global settings, permissions or auth
changed. It is a bounded per-request serving strategy, not proven residency.

Current host source: 1a3630389cdd14cca115bf31a15f70190b15c130fa07b30430b402b752f2ba26.
Installed hook package: aaa0992c97287486e16dbc1502f0235ee1095fd587ac37c84c1c350234cb7d6d;
handler SHA256 5f7ba49b85b5610410c48ad3acd172091437991f98c172d6a853d93860b028f5.
Active broker dependency build remains 3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b,
bootstrap 7e62795266806cbd4435f68cc83f424e5299fe2ddd6e3f524babd1c7c39f5af4,
generation 3, same PID71262/start Wed Oct 7 03:24:51 2026 UTC. No handoff STOP.
Do not conflate host, hook package and broker dependency pin.

Evidence in <state>/pressure:
- native-stop-rescue-2026-10-07T05-30-36-723Z.json: initial FAILED hook trial,
  accepted wake/no tools, request rmuxo5m6t-cae19c expired undispatched.
- native-stop-rescue-2026-10-07T05-33-27-200Z.json: corrected hook invoked,
  one rescue, native dispatch/checkpoint/archive receipt. Original ok:false
  immediate metadata readback is preserved; do not replay the operation.
- stop-rescue-independent-readback-2026-10-07.json: independent later
  isArchived=true and exact cwd verified for local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14.
  The old fixture is now cleaned up. Original request rmuxo99pm-a3dc30 completed.
- native-stop-rescue-client-2026-10-07T05-36-01-033Z.json: ordinary aaa0992c
  client passed a native get_session operation in44.716s, one peer wake/rescue,
  native-tool-result receipt and unchanged PID/auth. This is not a low-latency
  or full native-controls qualification. After settlement the model again idled.
- v2-2026-10-07T05-36-28-189Z.json: three unchanged-source aaa0992c isolated rounds.
- harness-v2-codex-2026-10-07T05-37-15-771Z.json: ten actual filtered Codex checks
  passed on aaa0992c, private synthetic stores/global configuration unchanged.

Current source also fixes pinned-entry provenance: activation records procStart,
wait/check validate the real native ancestry and emit epoch-bound observations;
foreign/current-candidate paths cannot claim an active release's work. Explicit
malformed epochs refuse. Legacy absent epochs preserve integrity but show
activation-epoch-unbound and dependencyPathsObserved:false. The active old pin
is legacy/unbound, so a future settled handoff is required for current-epoch
native release qualification. Seventeen release cases passed. No handoff occurred.

Forced exit truncated captured output: baseline256KiB helper lost three quarters;
actual public CLI baseline emitted65536 bytes of a270343-byte UTF-8 JSON result,
then exited0. Helpers and CLI now complete naturally, preserving full parseable
output. Reports entry-stdout-exit-reproduction-2026-10-07.json and
cli-stdout-exit-reproduction-2026-10-07.json preserve these comparisons.
A private test cleanup initially failed on sealed directories; corrected cleanup
unseals only its own temporary candidate before removal. No native failure erased.

Two detector inbox reports013111/013142 were independently reviewed: the first
observed the deliberately pending first trial, the second followed its expiry;
neither establishes a crash or serving recovery. Their exact hash review is in
stop-rescue-independent-readback-2026-10-07.json. Acknowledge only after checkpoint.

Final current-host checks after the CLI correction passed: three unchanged-source
rounds in v2-2026-10-07T05-39-19-699Z.json and ten actual filtered Codex checks
in harness-v2-codex-2026-10-07T05-38-56-434Z.json. Claude filtered harness checks
remain older; no additional Claude harness inference consumed this turn.

Next: qualify batched/concurrent native controls on owned fixtures. Before claiming
full current pin readiness, settle maintenance cleanup under an owned STOP,
activate an epoch-bound candidate without replacing PID/auth, and independently
verify completed native wait/check observations. Distinct-build rollback, natural
governor pressure, sustained latency and unattended cold recovery remain open.
Do not repeat unbounded wakes, create competing recovery observers, initialize
CUA/keys/pastes, lift quarantine, restart apps or change auth. Codex-driver and
1Password work remain separate. A prepared observer-model comparison is awaiting
human authorization; do not forward it or change that chat/model unapproved,
and reconcile the restored serving state before considering it necessary.

## Previous frontier — October 7,01:00 Eastern

Progress this turn: source-qualified deterministic peer transport, an installed
zero-inference 30-second detector, and a native-verified guard that prevents
repeated inference wakes after the broker ends without tools. The goal is active
and incomplete, not blocked/no-progress. The user wants fast signaling without
hourly detection delays; active work never waits for the observer's hourly job.

Host build: `16a95ad1b4468111154b985c7a759a9082d414c5c31632d44238dfe77a0eac93`.
Active broker build remains `3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b`,
bootstrap `7e62795266806cbd4435f68cc83f424e5299fe2ddd6e3f524babd1c7c39f5af4`,
generation 3; same PID 71262/start `Wed Oct  7 03:24:51 2026`. No STOP remains.
The 30s detector runs its separate sealed 5dfbbdc6 package; this did not activate
a new broker dependency package. Workspace entry shim remains mutable. Completed
entry records/native receipt proved delegation, but exact current-process entry
provenance and rollback across distinct builds remain unqualified.

Transport 2.1.289 is now reviewed in VERIFIED_CLI. Seven installed receiver VM
checks passed in peer-contract-2026-10-07T04-43-32-185Z.json; initial extractor
failure is retained. Exact native peer msg_ids independently accepted in 155–159 ms;
no sender Claude inference turn. Version environment override removed; unknown
explicit-direct versions, invalid/private-mode/symlink keys, ambiguous or changed
PID epochs and malformed envelopes fail closed. Partial/uncertain writes never
fall through to another sender. Peer record reads use owned no-follow FDs.

Serving is still FAILED. Native reread(v8) was ignored; generic v7, named request v7,
then exact compatible v6 all ended without tools. Original 25/30 s expiries and
full-suite failure remain recorded, not counted as passes. A current ordinary
compatible direct client produced one correlated native end_turn with zero
calls; the guard cancelled pending work with broker_not_serving in 3353 ms, one
receiver turn, zero sender turns. Evidence: native-wake-end-turn-guard-2026-10-07.json.
Exact msg_id and UUID ancestry are used, never model prose. Other user branches,
sidechains and actual tool activity do not prove refusal; a checkpointed native
result wins. Three isolated rounds passed on 5dfbbdc6 in
v2-2026-10-07T05-00-48-265Z.json. A final progress-message-only correction
now says awaiting native serving evidence instead of asserting loop entry. One
full round passed unchanged 16a95ad1 source in
v2-2026-10-07T05-05-01-304Z.json. The native guard proof is on 5dfbbdc6; this
minor host change does not promote a full current native control pass. Actual filtered harness passes are older than
these host changes and must not qualify the current fingerprint.

Fixture local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 remains unarchived. All cleanup
requests are independently cancelled/expired before dispatch and retrySafe:
rmuxmikjs-994346, rmuxmjx67-3a93fa, rmuxmyift-8e9115, rmuxn2qt8-bd1e31.
Do not create another fixture or repeat full native suites until a justified
model/serving strategy changes. Sender-free wakes now work; further repeated
wakes alone have no supported improvement hypothesis.

Detector installed as com.taylor.claude-driver-detector,30s StartInterval,
sealed target in src/launchd/com.taylor.claude-driver-detector.plist. Reads only
owned broker/session/peer/control/request metadata; no keys or transcripts.
STOP suppresses events, idle alone is normal, fault transitions confirm after 2 s,
unchanged episodes deduplicate, reused PID epochs are events. Ten live read-only
samples mean 4.961 ms/max 8.556 ms; nine private cases passed including the atomic
report→hash scan→exact ack flow. It emitted the real pending unserved request
rmuxmyift-8e9115 at 04:57:28Z, then liveness-only at 04:57:58Z after expiry.
Those events do not establish crash cause or recovered serving. Review record:
detector-inbox-review-2026-10-07.json. Acknowledge exact filenames/hashes only
after commit/push checkpoint.

Observer schedule independently verified in native receipts: deleted owned
337cb675 at 04:42:03.979Z; created/listed exact hourly23 * * * * job ae838cf8 at
04:42:04.523/05.427Z, prompt claude-driver observer tick v1. Native cron expires
in 7 days/session closure. Fast detector reports feed the existing30s Codex inbox;
these scheduled Codex runs still invoke inference. No event-triggered Claude
observer send is connected; its hourly job is fallback recovery. Do not claim
hourly checks are the detection cadence or that native recovery is now event-only.
Last broker maintenance list04:37:33Z/job d7319422 is stale after 12 min; this is not
proof of job absence, protection, crash or governor eviction.

Next: mechanically bind pinned-entry proof to the exact current native epoch;
compare a justified native model or bounded one-request relay strategy against
retained Haiku no-tool end_turns before another full suite. Any observer native
control change/message needs human authorization for that chat; prepare a
compact one-time plan rather than reintroducing frequent inference polling.
Do not clear context, spoof native APIs, create replacement chats, start CUA,
lift input quarantine, restart apps, kill session processes or change auth.
Observer owns offline restarts; Codex-driver and 1Password work remain separate.

A broad launchctl print exposed inherited secrets in tool output. Subsequent
checks capture output privately and extract only state/runs/exit/interval fields.
Do not repeat environment dumps, copy values into reports, or read credentials.
Credential rotation remains necessary, outside this bridge change; no auth
mutation or rotation was performed.

## Previous frontier — October 7, 00:42 Eastern

A sealed broker dependency pin is active: build
`3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b`,
bootstrap `7e62795266806cbd4435f68cc83f424e5299fe2ddd6e3f524babd1c7c39f5af4`,
generation 3; fresh host source
`04d6d6b381cf8610485cfc1ee1688f72f94cc6dcf6a42a9e5998c0545a7f099e`.
Controlled STOP/handoffs preserved broker PID 71262 and existing authorization.
First direct-path handoff FAILED: a native Read of updated CLAUDE.md was followed
by workspace Bash commands. Preserve release-native-paths-2026-10-07.json.
The corrected cached-command shim validates a separately sealed built-ins-only
bootstrap, which validates/imports the immutable wait/check dependency snapshot.
Completed entry records plus correlated native read receipt prove this path;
release-sealed-dependencies-2026-10-07.json passed in17.323s, original PID,
exact native maintenance job d7319422 and app recognition. Workspace entry shims
remain the minimal startup boundary; do not describe a matching instruction file
or selected entry as completed native execution. Subsequent workspace edits do
not automatically advance the active release. Invalid pointer, hashes, writable
files, symlinks and an owned deployment STOP fail closed in fresh clients.

Nine release cases plus the new build-binding qualification case passed;
five complete isolated rounds and both real filtered harnesses passed on host
04d6d6b3. Native full input-free report
live-v2-2026-10-07T04-37-49-840Z.json FAILED: initial reply/cancel passed, then
Haiku ended turns with 'Broker running' without serving the next request.
Repeated compatible wakes did not correct this. The owned test runner was
cancelled (not the native broker process) to stop further repetitive usage.
Input resource audit stayed zero and quarantine remains active. Fixture
local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 remains unarchived after cancelled
cleanup; reconcile native dispatches and archive it safely before another full
suite. Do not repeat costly full suites until loop fidelity/wake delivery has
changed. Read-only native smoke does not qualify current full controls.

Next: finish that owned fixture cleanup with bounded recovery, mechanically
fence deployment/provenance to the exact native process, and compare a justified
transport/model improvement against the retained Haiku end-turn failures. A
new candidate snapshot has not been activated; rollback across different builds
and natural governor pressure/cold recovery remain unqualified. Do not clear
context, create replacement chats, lift input quarantine, terminate native
sessions, change auth or compete with the commissioned observer. The user has
requested a low-usage observer follow-up prompt; do not send it to another chat
or assume it was applied. Latest broker live/idle, no owned STOP remains.

# Claude-driver continuity — 2026-10-06

## October 7 continuation — helper and waiter pressure iteration

Current runtime `3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b`;
app 2.26454.0 / CLI 2.1.289, same approved broker PID 71262. The preceding
turn was progress, not a blocked/no-progress turn. The goal remains active.

Private tests reproduced seven failures in the original eight-case helper/socket
suite: a request's wake outlived its deadline, abort left a SIGTERM-resistant
helper alive, exited-helper output pipes extended the budget, and partial direct
frames/abort could fall through to another LLM send. The driver now shares the
remaining request budget with delivery, supervises only its own freshly launched
CLI child (TERM then KILL after250ms), settles cancellation after direct child
exit, and closes inherited readers without signalling descendants. A follow-up
fixture reproduced a synthetic late dispatch during cleanup; abort intent now
cancels the durable request concurrently with cleanup. Cancelled/expired synthetic
receipts remain cancellation errors with correct undispatched retry safety.
Actual native receipts still win a completed race; dispatch uncertainty is retained.

The intermediate native run failed. Its recipient interpreted automated stop as
human intervention and refused the peer replacement. Separately the broker ran
`broker-check ... && broker-wait ... > /dev/null &`, violating the standing
foreground rule. That hidden waiter claimed cleanup request rmuxlc7uv-e3ba0c;
the model's visible wait instead returned IDLE. The request expired without any
dispatch. A subsequent independently reconciled cleanup verified the fixture
local_a2e766c5-7566-42b3-8e50-3995cc200729 archived. Preserve this failure, never
claim the old native pass proves this branch reliable.

Mechanical waiter admission now rejects discarded/device stdout before a claim,
validates0–540s budgets, accepts native captured stdout in an owned regular file,
and holds a single kernel lock across the whole wait and pickup. Controls record
the picking PID for future diagnosis. The first pipe-only guard was too strict
for real native Bash output; that failed45s warm test and native refusals remain
recorded. Corrected regular capture warm activation received a native-tool receipt
in37.780s while preserving PID 71262 (three compatible wakes, one request/checkpoint).
This corrects the observed discard/duplicate-waiter cases; it does not prove that
arbitrary background captures reach the model or qualify direct wire on2.1.289.

The new disposable fixture bootstrap states the specific planned automated stop
and replacement up front. Actual human instructions still override it; unrelated
peer work remains unauthorized. The previously refused chat was archived and was
not sent replacement attempts. This is prospective scope clarification, not an
instruction to ignore a human stop. Current-source native input-free qualification passed all eleven checks with
zero input filters, exact replacement reply after the planned stop, one reply
per send and archived cleanup. Five isolated rounds passed124 cases each
(620 total); both actual filtered harnesses passed ten; four current installed
code governor scenarios passed in isolation. Native initial delivery/reply7.321s,
submit179ms, concurrent controls52.379s, batch38.011s and interruption28.026s
are measurements, not guarantees. Frequent peer-LLM re-wakes increased latency.
The broker often ends its turn despite the standing residency instructions;
transport/model fidelity remains a real reliability/efficiency frontier.

Reports under /Users/taylor/.local/state/claude-driver/pressure/:

- cli-budget-reproduction-2026-10-07.json and three retained baseline logs.
- native-hidden-waiter-2026-10-07.json: exact native violating command and refusal.
- live-v2-2026-10-07T04-09-18-109Z.json: failed native run, retained.
- waiter-guard-warm-2026-10-07.json: over-strict capture guard failure, retained.
- waiter-guard-capture-corrected-2026-10-07.json: corrected warm native receipt.
- live-v2-2026-10-07T04-18-49-103Z.json: eleven current native checks passed.
- waiter-native-maintenance-2026-10-07.json: IDLE04:21:15.157Z then
  CronList04:21:16.619Z on current source, reusing922e4a9e and PID 71262.
- governor-contract-2026-10-07T04-22-16-667Z.json: four isolated installed cases.
- v2-2026-10-07T04-19-29-815Z.json: five current isolated rounds.
- harness-v2-{claude,codex}-2026-10-07T04-18-49-090Z.json: current real filtered checks.

Two new observer reports (001827 and001927) independently corroborated the
capture-guard outage and recovery. Their build strings are explanatory text, not
fingerprints; source/native records were checked independently. Exact hashes and
review are in observer-guard-review-2026-10-07.json. Reports001827/001927 were acknowledged by exact scanned hashes after checkpoint
20004b9. A further002308 report corroborated unsolicited end_turns while the
broker stays live/cron-protected, making repeated client wakes necessary. Its
unique end_turn samples/template hash were independently verified in
observer-loop-drift-review-2026-10-07.json; counts/causal context-poisoning claims
are not promoted. Report002308 was acknowledged by its exact scanned hash after checkpoint
fa47c17; eight unique streamed assistant messages with terminal end_turn were
verified, without adopting causal context-poisoning claims. The observer is currently live/idle PID68416 and sent
no competing wake. The current source still directs native Bash into mutable
working-tree files. **Next priority: immutable qualified runtime staging and
pinned live wait/check paths before further source experiments.** Validate
snapshot hashes, current-versus-active build, controlled native handoff and
rollback without an app restart, auth changes or session termination. Do not
blindly apply the report's suggested context-clear or trigger changes.

A qualified snapshot is now staged (not active) at
`/Users/taylor/.local/state/claude-driver/releases/3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b/`.
`release.json` records hashes for57 source/doc files, native/filter/isolated
qualification references and two isolated smoke checks. Its build fingerprint
matches the workspace exactly; files/directories are sealed read-only. Live
instructions still reference workspace scripts. Do not treat this snapshot as
an installed host MCP launcher or a verified native handoff. Before further
runtime edits, settle the exact owned broker via its graceful STOP protocol,
reconcile pending dispatches and preserve PID/auth/job provenance; stage/test
activation logic privately, then qualify pinned paths and rollback without
external process termination. The existing observer must not compete with a
live warm handoff. Preserve all intermediate failures and exact source hashes.

After deployment isolation, qualify current-version deterministic peer wake
transport and/or compare broker model fidelity to reduce wake overhead and loop
violations. Real natural pressure and unattended cold recovery remain distinct,
unproven requirements. Do not manufacture OS pressure or kill desktop/user
session processes. Observer owns offline recovery; input quarantine stays active,
and this chat's old MCP still needs refresh. Both new scratch fixtures in
this continuation are archived; previous-turn fixtures remain parked.

## Previous settled frontier — historical

## Resumed work — latest frontier

Taylor resumed the goal on October 6 at 23:38 Eastern. Current runtime:
`d1cce7ed831d4298c0988a9e2728ff24347d3960db245cce857c8da18a3c8988`; app 2.26454.0 / CLI 2.1.289.
The approved broker remains PID 71262, session
`local_35b3ba48-f02e-48de-bfbb-925192d90de1`. Controlled graceful STOP and
warm handoffs preserved that process; no app restart or keyboard automation
was used. Current protocol is v7, with exact compatible `claude-driver wake v6`
and `claude-driver drain v6` aliases. Native sender names are routing metadata,
not authentication. Operations still come only from durable requests/checkpoints.

Two retained failures drove this iteration. First, the original IDLE branch
omitted CronList. V7 explicitly lists/reuses the exact job before its next wait.
The waiter also bounds its deadline by the last native list plus nine minutes,
including across intervening requests, and returns IDLE before claiming pending
work when that budget is due. The twelve-minute evidence freshness guard remains.
Second, a real v7 wake read the standing file then returned `ignored`. The accepted
v6 alias entered the updated loop on the same PID; ordinary clients now use that
compatible activation while queued requests keep protocol v7. No ambiguous send
was blindly replayed. Original failures and intermediate-source results remain
under `<state>/pressure/`.

The final-source native input-free suite passed all eleven checks: creation/import
and independently verified focus restoration, durable reply, cancellation,
concurrent and batched controls, busy queue, interruption/replacement, exactly
one reply per send and archived cleanup. Both input audits found zero filters;
quarantine remains active. Five isolated rounds passed 111 tests each (555 total),
and actual Claude Haiku/Codex gpt-6.1-sol each passed ten filtered synthetic checks.
Four isolated scenarios exercised the installed governor code without native OS
pressure. Normal-client warm activation had a correlated native receipt after
20.489 seconds; native submit measured 169 ms in the final suite. These are
observations, not latency guarantees or cold-recovery proof.

One intermediate-source native IDLE at 03:52:17.280Z was followed by CronList
at 03:52:18.832Z and rewait at 03:52:20.377Z, reusing job e969f887 despite
intervening controls. The final source then recreated/listed job 922e4a9e at
03:54:05.471Z / 03:54:06.819Z. Final-source IDLE at 04:03:06.882Z was followed by CronList at
04:03:09.251Z and the next wait at 04:03:10.919Z, reusing 922e4a9e
without another CronCreate. The ten-minute read-only observation retained
PID 71262 and fresh protection throughout, unchanged source and zero input
filters before/after. No natural governor pressure occurred; its overall
`ok:false` explicitly preserves that missing requirement, while idle survival
and native maintenance reconciliation passed.

Actual automatic compaction at 03:43:47.157Z reduced 188436 to 13857 tokens.
The native controls above passed after that compaction; this does not guarantee
standing-protocol retention through arbitrary future compactions. Do not clear
broker context or kill its process as routine recovery.

This chat's connected MCP reports driver `1a83e53`, API 2, runtime
`32a4b1193203c235dd0ed63876c4231d7783d6e3999e11b1792da32b213b8780`,
and lacks sourceBuild/restartRequired. It is outside qualification; use the
current CLI or a freshly connected MCP and verify current fingerprints.
Missing freshness fields in an older server do not establish safe write behavior.

The observer is live with its own five-minute job 337cb675; the Codex inbox
watcher is configured every thirty seconds and scans metadata first. Offline
recovery belongs to that observer; do not send competing cold wakes. Reports
234015 and 234531 were independently reviewed and acknowledged by exact scanned
hash after commit/push checkpoint e865a5a; the inbox is empty. A stale exited app query without relaunch, unattended recovery after
app closure/restart or cron expiry, actual natural pressure and safe keyboard
helper teardown remain unqualified. UI fallback stays disabled. The goal is now active (verified through get_goal), including automatic
continuations; do not mark it complete while the remaining reliability gaps persist.

Final-source reports under `/Users/taylor/.local/state/claude-driver/pressure/`:

- `v2-2026-10-07T03-54-01-092Z.json`: 555 isolated passes, unchanged source.
- `harness-v2-{claude,codex}-2026-10-07T03-53-19-256Z.json`: ten each.
- `governor-contract-2026-10-07T03-54-52-058Z.json`: four isolated scenarios.
- `live-v2-2026-10-07T03-54-52-074Z.json`: eleven current native passes.
- `residency-v2-2026-10-07T03-54-52-060Z.json`: ten-minute idle survival and
  fresh evidence passed; natural pressure absent, overall qualification false.
- `native-idle-v7-final-2026-10-07.json`: exact final IDLE/list/rewait receipts,
  same job/PID and no duplicate creation.
- `client-warm-handoff-2026-10-07.json`: ordinary client activation/receipt.
- `warm-wake-reproduction-2026-10-07.json`: real ignored v7 wake and failed
  synthetic baseline; corrected compatible client wake.
- `wait-budget-reproduction-2026-10-07.json`: actual waiter baseline claimed
  queued work before an expired deadline; corrected IDLE/STOP ordering.
- `v7-handoff-2026-10-07.json`: intermediate-source native IDLE/list/rewait.
- `observer-followup-review-2026-10-07.json`: report hashes and factual review.

## Earlier October 6 checkpoint — historical

Taylor resumed this work on 2026-10-06. Input automation remains quarantined.
The independent observer's first report was reviewed on October 6 at 23:27
Eastern: `claude-broker-20261006T232546-0400.report.json`, SHA256
`105e318b33d2114a515baf59c0574920528de25573ebd10158b7c91855ae0bae`.
The exact approved broker is now running as PID 71262, started at 23:24:51
Eastern. Its native create/list receipts and app acknowledgment independently
confirm maintenance job `3651b2a5`. The observer is the verified existing
`Broker Recovery Probe`, session `local_c98bc9eb-466e-4237-b199-ad4435bce111`,
with its own native five-minute job `337cb675` and persisted observer-v1.json.
Do not compete with its restart attempts or send another wake.

The earlier exit143 followed the intentional termination test, not a verified
spontaneous crash or governor eviction. Native logs independently confirm
Claude quit for an automatic update at 22:51:50 Eastern and relaunched at
22:52:00. The observer's successful native wake occurred after that relaunch;
it does not prove native-send recovery from the earlier stale-query state
without an app restart. Do not use external PID termination as routine recovery.
Current-source native controls and natural-pressure survival remain pending.

Current-source read-only report `residency-v2-2026-10-07T03-28-00-424Z.json`
observed the same PID for eight minutes, with zero input filters before/after,
unchanged source and no native writes. No natural governor pressure occurred;
overall `ok:false` preserves that missing requirement. The native trace also
exposed an omitted CronList after the first IDLE at 03:34:06.557Z, before the
next wait at 03:34:08.879Z. The last list remained 03:24:59.974Z, so its
evidence becomes stale at twelve minutes unless refreshed. This is not proof
of job deletion or eviction. Preserve `native-idle-rearm-2026-10-07.json` and
the [isolated protocol candidate](broker-idle-rearm-candidate.md). Do not load
it into the current broker during this restricted heartbeat. Current native
controls/import, loading that candidate and actual pressure survival remain
separate qualification work. The first observer report's factual review is
complete; these remaining goal requirements are durably checkpointed here.

Current runtime fingerprint:
`e959aec1f4983f78c833ff4e6370e016d5a3bb561fc7002082d147cb81d0817a`.
On this source, five fresh isolated rounds passed (105 cases each), actual Claude
Haiku and Codex gpt-6.1-sol each passed ten filtered API checks, and four isolated
scenarios exercised the installed app's actual governor/victim-selection code.
Those governor scenarios emit no real OS pressure or app IPC. During this run
Claude auto-updated to app 2.26454.0 / CLI 2.1.289. The earlier extractor failed
on renamed native bindings; the updated version-scoped adapter passes the four
scenarios on the current installed module. Failure retention now includes source
version/hash and extraction stage. Earlier native passes predate this app update.

Long-lived MCP runtimes expose sourceBuild/restartRequired and refuse new effects
when loaded code differs from files on disk. Read-only observation and job
cancellation remain available. Two actual stale-source tests verify rejection
before recipient resolution; reconnect rather than silently mixing revisions.

Three further pressure boundaries were reproduced and fixed without native
writes: a second worker could reclaim a running job; a queued job could execute
on changed source; and a control could pass its entry check then cross a source
change while waiting for its recipient lock. Workers now claim only queued
unstarted jobs, retain the claimant PID, and bind startup to the submitting
runtime fingerprint. Unknown/mismatched provenance fails before dispatch.
Controls recheck after lock acquisition. Reattaching an old key never launches
another worker; a known-undispatched stale job needs deliberate new submission
on current source. Synthetic reproduction evidence is retained in
`worker-boundaries-reproduction-2026-10-07.json`; the original failures are not
counted as passes. Current-source native qualification remains pending.

A further crash/pause experiment reproduced overlapping callbacks in the old
age-reclaimed directory reaper. The current outer kernel flock now holds through
that recovery path. Node retains its inherited descriptor after an isolated
`/usr/bin/python3` stdlib helper exits; all current clients serialize through it.
Four regressions cover paused live reaper exclusion, actual holder SIGKILL,
queued cancellation and helper failure without directory-only fallback. The
initial crash fixture exited on an unfulfilled top-level await before it could
be killed; that fixture failure was corrected with a live event-loop handle,
then the actual holder death was verified. The old directory guard is retained
for compatibility; old MCP clients remain outside current qualification until
refreshed. Never unlink/age-reclaim persistent `locks/*.mutex` files: replacing
the inode can split a live lock. No 1Password source, credential, app process or
input helper changed. Ten synthetic durable submits during concurrent checks
measured p50 56.30 ms / p95 63.66 ms; this is not native response latency or an SLA.

The initial native input-free run after resume passed all eleven checks,
including import/focus, durable reply, cancellation, settings, queue/interrupt,
single replies and archived cleanup. Its source predates the evidence-reader
hardening and therefore does not qualify the current fingerprint. The same
broker PID survived an eight-minute observation, but no natural governor pressure
occurred; the pressure requirement remains incomplete. Graceful STOP then
verified native deletion of only the exact owned maintenance job.

A candidate protocol-version upgrade was answered `ignored` by the existing
broker instead of causing it to reread the standing file. The pending control
was cancelled without native dispatch; the scratch fixture was independently
archived after restoring compatible v6. File equality (`templateCurrent`) is
not proof that a live broker loaded new instructions. Keep compatible v6 and
verify actual native behavior before future protocol upgrades.

Current reports under `/Users/taylor/.local/state/claude-driver/pressure/`:

- `v2-2026-10-07T03-16-48-625Z.json`: five isolated rounds passed, unchanged source.
- `harness-v2-{claude,codex}-2026-10-07T03-16-07-134Z.json`: ten checks per harness.
- `governor-contract-2026-10-07T03-16-07-133Z.json`: four installed-code scenarios.
- `governor-extraction-failure-reconciled-2026-10-07.json`: failed old extractor,
  reconstructed failure evidence explicitly marked; not a native pressure pass.
- `kernel-lock-reproduction-2026-10-07.json`: original strategy failed the
  paused-reaper exclusion experiment in a private source clone.
- `kernel-submit-latency-2026-10-07.json`: ten synthetic submits, all jobs completed.
- `live-v2-2026-10-07T02-27-50-669Z.json`: eleven native checks passed on earlier source.
- `residency-v2-2026-10-07T02-27-33-201Z.json`: eight-minute same PID survival,
  no natural pressure; not a passing pressure qualification.
- `live-v2-2026-10-07T02-36-44-905Z.json`: cancelled protocol-upgrade probe;
  owned scratch fixture subsequently verified archived.
- `warm-cold-v2-2026-10-07T02-41-36-542Z.json`: exact idle process exit and
  input audits passed; native warm recovery failed on stale exited app query.

Both new native scratch chats are archived; their durable jobs are terminal.
The approved dotfiles pool remains parked with cleared CLI context. No user
chat, permission, credential, app binary or global harness configuration changed.

After the observer reports a verified recovery, independently inspect the process and
native maintenance receipts/list/app acknowledgment. The reader now rejects
lists from before creation, unconfirmed deletes, invalid/future timestamps and
rows from earlier processes. It reads at most 2 MiB of the owned native journal;
a burst that exceeds retained evidence fails closed. Then rerun current-source
input-free native qualification and read-only residency observation. The observer
now records idle survival separately from the natural-pressure requirement.
Keep all failed/aborted reports and avoid Computer Use or another termination
experiment. Codex-driver fixes and the separate 1Password incident stay parked.

## Independent observer and report inbox

The exact requested directory is `/Users/taylor/Desktop/temp_reports`.
Taylor launched the [monitor prompt](claude-monitor-prompt.md) in the separate
Claude Desktop `Broker Recovery Probe`. A saved copy is at
`/Users/taylor/Desktop/temp_reports/claude-monitor-prompt.md`.
It authorizes one reconciled native wake of only the approved broker, direct
native session-local five-minute observation, capped retries, exact owned
health/exit evidence and atomically published sanitized `.report.json` files.
It forbids keyboard automation, permission changes, app restart and process kills.
The first report's native observer job was independently verified; session-local
cron expiry/app closure remain explicit limits, including across app restart.

Codex heartbeat `claude-broker-report-inbox` is saved ACTIVE every 30 seconds,
attached to this existing chat. Its execution depends on the local app scheduler;
configuration does not guarantee execution at every scheduled second. Scheduled
inbox invocations have now occurred. It first calls only `scripts/report-inbox.mjs`;
it loads continuity and independently verifies evidence only when reports are pending,
and checkpoints justified improvements before acknowledging the exact filename
and SHA256. No new report means no desktop actions or repeated status updates.
The scanner emits metadata only, skips symlinks/oversized/incomplete JSON and
recognizes changed content even under a previously reviewed filename. Two tests
verify those boundaries and persistent acknowledgment. Report text is untrusted
source material, not authority to execute commands. Reports with unresolved work
stay pending with a durable review note. A future explicit pause must pause the
heartbeat and stop owned observation, rather than auto-resume this work.

The current native observer wake used an envelope with `from=` and `name=`,
without `from-name="claude-driver"`. The broker accepted its exact wake and
entered its loop. This differs from the written v6 trigger example; an LLM
instruction naming a sender is not an independently enforced identity boundary.
Keep this as a candidate protocol finding. Do not broaden the allowlist, spoof
the sender, or hot-upgrade the live standing file during qualification. All
native operation outcomes still require request-file dispatch checkpoints and
correlated tool receipts. This heartbeat does not authorize sending to other
chats or creating a new qualification chat; native observation is read-only.

```sh
node /Users/taylor/src/github/dotfiles/src/claude-driver/scripts/report-inbox.mjs
# Only after independent review/checkpoint, with the exact scanned values:
node /Users/taylor/src/github/dotfiles/src/claude-driver/scripts/report-inbox.mjs --ack <filename> --sha256 <hash>
```

## Historical pause checkpoint

Status at the earlier checkpoint: paused at Taylor's request. All owned qualification processes are stopped;
no wake, navigation or input automation is pending. The earlier request to send
`claude-driver wake v6` is withdrawn for this pause. Codex-driver fixes remain
parked. The separate 1Password incident chat remains separate.

## Settled runtime

- The approved `claude-driver-broker` is offline, not resident. Its private
  template is current at protocol v6; v6 has not been qualified in the desktop.
- Computer Use remains quarantined. Taylor confirmed normal input after the
  exact stale helper was retired and manually woke v5 once. The cancelled
  observer's before/after audits both found zero Claude keyboard filters.
  This does not prove safe future helper teardown; retain quarantine.
- Both owned native scratch chats are archived. The approved dotfiles pool is
  archived/parked with its CLI context cleared. No owned probe process remains.
- Source and private service evidence are preserved. Existing MCP connections
  do not reload source; this chat's old binding still requires a fresh connection.

## Verified and pending

Current runtime fingerprint:
`32a4b1193203c235dd0ed63876c4231d7783d6e3999e11b1792da32b213b8780`.
On this source, five isolated rounds passed (87 tests each, 435 cases), and
actual Claude Haiku and Codex gpt-6.1-sol filtered harnesses each passed all ten
checks. These filtered harness runs cannot drive the desktop.

Reports in `/Users/taylor/.local/state/claude-driver/pressure/`:

- `v2-2026-10-07T00-39-50-052Z.json`: five rounds passed, source unchanged.
- `harness-v2-claude-2026-10-07T00-39-12-094Z.json`: ten checks passed.
- `harness-v2-codex-2026-10-07T00-39-12-094Z.json`: ten checks passed.
- `residency-v2-2026-10-07T00-39-12-093Z.json`: explicitly aborted for pause;
  no live maintenance job was acknowledged, no desktop write/navigation/input.
- `live-v2-2026-10-07T00-19-17-259Z.json`: earlier nine-check native control
  scope passed; its source predates the current input-free/bootstrap/v6 changes.
- `live-v2-2026-10-07T00-22-13-935Z.json`: failed interruption assertion;
  a quoted completion marker was mistaken for completion. Fixed fixture-only
  delegation and final-line assertions now need another native run.
- `live-v2-2026-10-07T00-27-59-144Z.json`: refused before creation when
  the broker was offline. Retain both failures, do not count them as passes.
- `cron-contract-2026-10-07T00-35-16-136Z-reconciled.json`: native CLI
  CronCreate/List/Delete receipts reconciled; the synthetic job was deleted.
  Original final-format failure is retained. Desktop governor protection is
  explicitly unqualified by this headless contract check.

The native governor evicted the v5 broker after 133 idle seconds despite its
foreground wait. Local app source excludes sessions with live native cron jobs
from its idle-victim selection. V6 stages one session-only recurring maintenance
job with exact prompt `claude-driver drain v6`; startup/idle reconciliation keeps
one owned job, and STOP deletes only that job. The new residency evidence reader
requires current-process tool receipts, a fresh list and native app acknowledgment.
This is a candidate, not established protection or unattended recovery. Warm-only
revival still refuses at the native process cap without keyboard fallback.

## Resume in order

1. Read this checkpoint and fresh `driver_status`/`broker_status` through the
   current CLI or a fresh MCP connection. Verify API v2, runtime fingerprint,
   app/CLI versions, quarantine, broker process and `residencyProtection`.
   Keep current failures and distinguish historical qualification by source.
2. Leave quarantine active and avoid Computer Use. Resume v6 only after Taylor
   resumes this work. If native warm-only revival has headroom, use its audited
   path; if it refuses at cap, retain the refusal and arrange one manual wake.
   Do not kill user sessions, raise permissions, spoof native APIs or inject keys.
3. With a current live v6 broker, require the correlated maintenance receipt/list
   and app acknowledgment. Run the read-only residency observer below; it must
   survive natural native governor pressure on one PID. No observed pressure
   means this requirement remains incomplete.
4. Run the scoped input-free live suite below against its single synthetic
   recipient. Require all eleven named checks, independent focus readback,
   before/after input audits and archived/cancelled cleanup. Do not run full
   UI qualification while quarantined.
5. If runtime source changes, rerun relevant isolated checks and both filtered
   harnesses on the final source. Only then reassess readiness. Sustained physical
   input, native-helper teardown and cold recovery at cap remain separate gaps.

```sh
node src/claude-driver/scripts/residency-v2.mjs --live --duration-sec 480
node src/claude-driver/scripts/live-v2.mjs --live --input-free
```

Shared technical mechanisms and reports belong to this service's docs and
private memory. Harness skills should retain only harness-specific judgment.
Nothing should automatically restart qualification while paused.
