"""Bounded static Apple accessibility audit for a foreground DEV surface."""
import asyncio
import json
import time
from pathlib import Path
from browser_inspector import scrub

CHECKS={'contrast':'testTypeContrast','hit-region':'testTypeHitRegion','text-clipped':'testTypeTextClipped'}
BUNDLES={'kickoff-dev':'com.dev.kudos.fit','safari':'com.apple.mobilesafari','chrome':'com.google.chrome.ios'}


def arguments(audit):
    if not isinstance(audit,dict) or set(audit)-{'target','profile','checks'}:
        raise ValueError('fixed_accessibility_arguments_required')
    target=audit.get('target','kickoff-dev');profile=audit.get('profile','app')
    checks=audit.get('checks',['hit-region','text-clipped'])
    if (target not in BUNDLES or profile not in ('app','call-rig')
        or target=='kickoff-dev' and profile!='app'
        or not isinstance(checks,list) or not 1<=len(checks)<=3
        or any(not isinstance(c,str) or c not in CHECKS for c in checks)
        or len(set(checks))!=len(checks)):
        raise ValueError('fixed_accessibility_arguments_required')
    return target,profile,checks


async def foreground(r,target,profile,check,browser_read):
    check()
    if target=='kickoff-dev':
        from cli import request
        status=await asyncio.to_thread(request,{'op':'status'},Path(r['state']),timeout=2)
        device=status.get('device') or {};feedback=status.get('deviceFeedback') or {}
        age=status.get('deviceAgeMs')
        if (device.get('bundle')!='com.dev.kudos.fit' or not device.get('boot')
            or type(age) not in (int,float) or not 0<=age<=3000
            or feedback.get('foreground') is not True):
            raise ValueError('foreground_dev_surface_required')
        result={'surface':'kickoff-dev','foreground':True,'hostEpoch':status.get('epoch'),'boot':device['boot']}
    else:
        preflight={**r,'debug':{'browser':target,'profile':profile,'op':'overview'}}
        value=await browser_read(preflight)
        rows=[p for p in value.get('pages',[]) if p.get('readConfirmed') and p.get('state',{}).get('visible')]
        if len(rows)!=1:raise ValueError('foreground_dev_surface_required')
        result={'surface':target,'foreground':True,'documentRef':rows[0].get('debug',{}).get('documentRef')}
        if not result['documentRef']:raise ValueError('foreground_dev_surface_required')
    check();return result


async def capture(r,rsd,check,browser_read):
    target,profile,checks=arguments(r.get('audit',{}))
    from pymobiledevice3.services.accessibilityaudit import AccessibilityAudit
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
    if AccessibilityAudit.RSD_SERVICE_NAME not in (rsd.peer_info or {}).get('Services',{}):
        raise ValueError('accessibility_service_unavailable')
    r['_phase']='accessibility_foreground'
    before=await foreground(r,target,profile,check,browser_read)
    async with DvtProvider(rsd) as dvt,ProcessControl(dvt) as control:
        pid=await control.process_identifier_for_bundle_identifier(BUNDLES[target])
    if type(pid) is not int or pid<=0:raise ValueError('foreground_dev_surface_required')
    rows=[];dropped=0;bytes_used=0;cleanup=False
    async with AccessibilityAudit(rsd) as audit:
        supported=await audit.supported_audits_types()
        selected=[CHECKS[c] for c in checks]
        if not all(c in supported for c in selected):raise ValueError('accessibility_check_unavailable')
        try:
            check();r['_phase']='accessibility_audit_target'
            await audit._invoke('deviceSetAuditTargetPid:',pid,expects_reply=False)
            check();r['_phase']='accessibility_audit';r['_auditRequested']=True
            issues=await asyncio.wait_for(audit.run_audit(selected),8)
            for issue in issues:
                value=scrub(issue.json())
                # Keep known diagnosis fields only; no element handles or screenshots.
                row={k:value[k] for k in ('element_rect_value','issue_classification','font_size','ml_generated_description','long_description_extra_info','foreground_color','background_color') if k in value}
                size=len(json.dumps(row,ensure_ascii=True).encode())
                if len(rows)>=256 or bytes_used+size>1024*1024:dropped+=1;continue
                rows.append(row);bytes_used+=size
        finally:
            try:
                await asyncio.wait_for(audit._invoke('devicePerformFinalCleanup',expects_reply=False),2)
                cleanup=True
            except Exception as error:raise ValueError('accessibility_cleanup_unconfirmed') from error
    check();r['_phase']='accessibility_foreground_readback'
    after=await foreground(r,target,profile,check,browser_read)
    if before!=after:raise ValueError('accessibility_surface_changed')
    return {'scope':'dev-static-accessibility-audit','target':target,'profile':profile,'checks':checks,
        'issues':rows,'reportedIssueCount':len(issues),'issueCount':len(rows),'droppedIssues':dropped,'auditCompleted':True,
        'auditChannelClosed':True,'finalCleanupSent':cleanup,'foregroundVerified':True,
        'documentRef':before.get('documentRef'),'inputSent':False,'settingsChanged':False,
        'attribution':'fixed native process; browser chrome may appear in browser audits; not DOM-only',
        'noIssuesIsNotAccessibilityCertification':True,'contrastPositiveControlQualified':False}
